import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { ARCHIVE_ROTATION_THRESHOLD_KEY, DEFAULT_ARCHIVE_ROTATION_THRESHOLD_BYTES } from '@/lib/db/archive'

const SETTING_KEYS = ['auto_cleanup_enabled', 'auto_cleanup_threshold_bytes', 'auto_cleanup_delete_amount'] as const

// GET /api/system/settings — قراءة إعدادات التنظيف التلقائي (عبر service role)
export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'system_operator') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('system_settings').select('key, value')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const settings: Record<string, string> = {}
  for (const row of data ?? []) settings[row.key] = row.value

  return NextResponse.json({
    auto_cleanup_enabled: settings.auto_cleanup_enabled === 'true',
    auto_cleanup_threshold_bytes: Number(settings.auto_cleanup_threshold_bytes ?? 0),
    auto_cleanup_delete_amount: Number(settings.auto_cleanup_delete_amount ?? 0),
    archive_rotation_threshold_bytes: Number(
      settings[ARCHIVE_ROTATION_THRESHOLD_KEY] ?? DEFAULT_ARCHIVE_ROTATION_THRESHOLD_BYTES
    ),
  })
}

// POST /api/system/settings — حفظ إعدادات التنظيف التلقائي
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'system_operator') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const body = await request.json()
  const enabled = body.auto_cleanup_enabled === true
  const thresholdBytes = Number(body.auto_cleanup_threshold_bytes)
  const deleteAmount = Number(body.auto_cleanup_delete_amount)

  if (!Number.isFinite(thresholdBytes) || thresholdBytes <= 0) {
    return NextResponse.json({ error: 'حد التخزين يجب أن يكون رقمًا موجبًا (بايت)' }, { status: 400 })
  }
  if (!Number.isFinite(deleteAmount) || deleteAmount <= 0 || deleteAmount > 100000) {
    return NextResponse.json({ error: 'عدد السجلات يجب أن يكون بين 1 و 100000' }, { status: 400 })
  }

  // عتبة دوران الأرشيف اختيارية: تُحفظ إن أُرسلت، وإلا تُبقي القيمة المخزنة
  const admin = await createServiceRoleClient()
  let archiveThreshold = Number(body.archive_rotation_threshold_bytes)
  if (!Number.isFinite(archiveThreshold) || archiveThreshold <= 0) {
    const { data } = await admin
      .from('system_settings')
      .select('value')
      .eq('key', ARCHIVE_ROTATION_THRESHOLD_KEY)
      .maybeSingle()
    const stored = Number(data?.value)
    archiveThreshold =
      Number.isFinite(stored) && stored > 0
        ? stored
        : DEFAULT_ARCHIVE_ROTATION_THRESHOLD_BYTES
  }

  const values = [
    { key: 'auto_cleanup_enabled', value: String(enabled) },
    { key: 'auto_cleanup_threshold_bytes', value: String(Math.round(thresholdBytes)) },
    { key: 'auto_cleanup_delete_amount', value: String(Math.round(deleteAmount)) },
    { key: ARCHIVE_ROTATION_THRESHOLD_KEY, value: String(Math.round(archiveThreshold)) },
  ]

  const { error } = await admin.from('system_settings').upsert(values, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
