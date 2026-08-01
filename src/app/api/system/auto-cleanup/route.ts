import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSystemPgClient } from '@/lib/db/pool'

// GET /api/system/auto-cleanup
// يفحص حجم قاعدة البيانات، وإذا تجاوز حد التخزين المحدد في الإعدادات
// يحذف أقدم عدد محدد من سجلات الأطفال (حذف فعلي + سجل تدقيق) ويستعيد المساحة
// يُستدعى من: مؤقت GitHub Actions (عبر رأس x-cron-secret) أو يدويًا من حساب system_operator
export async function GET(request: Request) {
  const admin = await createServiceRoleClient()

  // التحقق من الهوية: إما رأس المفتاح الخاص بالمؤقت أو جلسة system_operator
  const user = await getCurrentUser()
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = request.headers.get('x-cron-secret')

  let performedBy: string | null = null
  if (user && user.role === 'system_operator') {
    performedBy = user.id
  } else if (cronSecret && headerSecret && headerSecret === cronSecret) {
    // في وضع المؤقت (بلا جلسة): ننسب التدقيق لأول حساب system_operator موجود
    const { data } = await admin
      .from('user_profiles')
      .select('id')
      .eq('role', 'system_operator')
      .order('id', { ascending: true })
      .limit(1)
    performedBy = data?.[0]?.id ?? null
  } else {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  // قراءة الإعدادات
  const { data: settingsRows } = await admin.from('system_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) settings[row.key] = row.value

  const enabled = settings.auto_cleanup_enabled === 'true'
  const thresholdBytes = Number(settings.auto_cleanup_threshold_bytes ?? 0)
  const deleteAmount = Number(settings.auto_cleanup_delete_amount ?? 0)

  const { data: sizeRes } = await admin.rpc('get_database_total_size')
  const currentSize = (sizeRes as number) ?? 0

  if (!enabled) {
    return NextResponse.json({ status: 'disabled', current_size: currentSize })
  }
  if (currentSize <= thresholdBytes || deleteAmount <= 0 || !performedBy) {
    return NextResponse.json({ status: 'skipped', current_size: currentSize, threshold_bytes: thresholdBytes })
  }

  // حذف أقدم سجلات الأطفال بالكمية المحددة
  const limit = Math.min(Math.round(deleteAmount), 100000)
  const { data: selected } = await admin
    .from('child_vaccination_records')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(limit)

  const rows = selected ?? []
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id)
    await admin.from('child_vaccination_records').delete().in('id', ids)
    await admin.from('audit_log').insert(
      rows.map((r) => ({
        table_name: 'child_vaccination_records',
        record_id: r.id,
        action: 'delete_attempt',
        performed_by: performedBy,
        old_value: r,
      }))
    )
    // أرشفة الجرعات المستهلكة حتى لا تعود إلى الرصيد بعد الحذف
    await admin.from('deleted_child_vaccination_records').insert(
      rows.map((r) => ({
        original_record_id: r.id,
        batch_id: r.batch_id,
        hospital_id: r.hospital_id,
        deleted_by: performedBy,
      }))
    )
  }

  // استعادة المساحة (اختياري: يعمل فقط مع DATABASE_URL)
  let vacuumOk = false
  let vacuumError: string | null = null
  const client = await getSystemPgClient()
  if (client) {
    try {
      await client.query('VACUUM FULL public.child_vaccination_records')
      vacuumOk = true
    } catch (err) {
      vacuumError = err instanceof Error ? err.message : 'فشل VACUUM'
    } finally {
      await client.end()
    }
  } else {
    vacuumError = 'DATABASE_URL غير مضبوطة — الحذف تم دون استعادة فورية للمساحة'
  }

  return NextResponse.json({
    status: 'cleaned',
    current_size: currentSize,
    threshold_bytes: thresholdBytes,
    deleted_records: rows.length,
    vacuum_ok: vacuumOk,
    vacuum_error: vacuumError,
  })
}
