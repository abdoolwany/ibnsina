import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getSystemPgClient } from '@/lib/db/pool'

const SETTING_KEYS = ['auto_cleanup_enabled', 'auto_cleanup_threshold_bytes', 'auto_cleanup_delete_amount'] as const

// GET /api/system/settings — قراءة إعدادات التنظيف التلقائي
export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'system_operator') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const client = await getSystemPgClient()
  if (!client) return NextResponse.json({ error: 'DATABASE_URL غير مضبوطة' }, { status: 500 })

  try {
    const r = await client.query('SELECT key, value FROM system_settings')
    const settings: Record<string, string> = {}
    for (const row of r.rows) settings[row.key] = row.value

    return NextResponse.json({
      auto_cleanup_enabled: settings.auto_cleanup_enabled === 'true',
      auto_cleanup_threshold_bytes: Number(settings.auto_cleanup_threshold_bytes ?? 0),
      auto_cleanup_delete_amount: Number(settings.auto_cleanup_delete_amount ?? 0),
    })
  } finally {
    await client.end()
  }
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

  const client = await getSystemPgClient()
  if (!client) return NextResponse.json({ error: 'DATABASE_URL غير مضبوطة' }, { status: 500 })

  const values: Array<[string, string]> = [
    ['auto_cleanup_enabled', String(enabled)],
    ['auto_cleanup_threshold_bytes', String(Math.round(thresholdBytes))],
    ['auto_cleanup_delete_amount', String(Math.round(deleteAmount))],
  ]

  try {
    for (const [key, value] of values) {
      await client.query(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, value]
      )
    }
    return NextResponse.json({ success: true })
  } finally {
    await client.end()
  }
}
