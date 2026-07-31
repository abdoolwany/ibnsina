import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getSystemPgClient } from '@/lib/db/pool'

// GET /api/system/auto-cleanup
// يفحص حجم قاعدة البيانات، وإذا تجاوز حد التخزين المحدد في الإعدادات
// يحذف أقدم عدد محدد من سجلات الأطفال (حذف فعلي + سجل تدقيق) ويستعيد المساحة
// يُستدعى من: مؤقت Vercel Cron (عبر رأس x-cron-secret) أو يدويًا من حساب system_operator
export async function GET(request: Request) {
  const client = await getSystemPgClient()
  if (!client) return NextResponse.json({ error: 'DATABASE_URL غير مضبوطة' }, { status: 500 })

  try {
    // التحقق من الهوية: إما رأس المفتاح الخاص بالمؤقت أو جلسة system_operator
    const user = await getCurrentUser()
    const cronSecret = process.env.CRON_SECRET
    const headerSecret = request.headers.get('x-cron-secret')

    let performedBy: string | null = null
    if (user && user.role === 'system_operator') {
      performedBy = user.id
    } else if (cronSecret && headerSecret && headerSecret === cronSecret) {
      // في وضع المؤقت (بلا جلسة): ننسب التدقيق لأول حساب system_operator موجود
      const p = await client.query("SELECT id FROM user_profiles WHERE role = 'system_operator' ORDER BY id LIMIT 1")
      performedBy = p.rows[0]?.id ?? null
    } else {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }

    // قراءة الإعدادات
    const r = await client.query('SELECT key, value FROM system_settings')
    const settings: Record<string, string> = {}
    for (const row of r.rows) settings[row.key] = row.value

    const enabled = settings.auto_cleanup_enabled === 'true'
    const thresholdBytes = Number(settings.auto_cleanup_threshold_bytes ?? 0)
    const deleteAmount = Number(settings.auto_cleanup_delete_amount ?? 0)

    const sizeRes = await client.query('SELECT pg_database_size(current_database())::bigint AS size')
    const currentSize = sizeRes.rows[0].size

    if (!enabled) {
      return NextResponse.json({ status: 'disabled', current_size: currentSize })
    }
    if (currentSize <= thresholdBytes || deleteAmount <= 0 || !performedBy) {
      return NextResponse.json({ status: 'skipped', current_size: currentSize, threshold_bytes: thresholdBytes })
    }

    // حذف أقدم سجلات الأطفال بالكمية المحددة
    const deleted = await client.query(
      `
      WITH selected AS (
        SELECT id FROM child_vaccination_records
        ORDER BY created_at ASC
        LIMIT $1
      ),
      deleted AS (
        DELETE FROM child_vaccination_records
        WHERE id IN (SELECT id FROM selected)
        RETURNING id, to_jsonb(child_vaccination_records) AS old_value
      )
      INSERT INTO audit_log (table_name, record_id, action, performed_by, old_value)
      SELECT 'child_vaccination_records', id, 'delete_attempt', $2, old_value FROM deleted
      RETURNING 1
      `,
      [Math.min(Math.round(deleteAmount), 100000), performedBy]
    )

    // استعادة المساحة
    let vacuumOk = false
    let vacuumError: string | null = null
    try {
      await client.query('VACUUM FULL public.child_vaccination_records')
      vacuumOk = true
    } catch (err) {
      vacuumError = err instanceof Error ? err.message : 'فشل VACUUM'
    }

    return NextResponse.json({
      status: 'cleaned',
      current_size: currentSize,
      threshold_bytes: thresholdBytes,
      deleted_records: deleted.rowCount ?? 0,
      vacuum_ok: vacuumOk,
      vacuum_error: vacuumError,
    })
  } finally {
    await client.end()
  }
}
