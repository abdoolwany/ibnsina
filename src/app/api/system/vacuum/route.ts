import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getSystemPgClient } from '@/lib/db/pool'

// POST /api/system/vacuum
// استعادة مساحة الجداول العملياتية (VACUUM FULL) — إعادة كتابة الجدول فقط لفرز
// الصفحات الميتة، لا يحذف أي بيانات حية ولا يمس RLS أو أي منطق. يعمل عبر DATABASE_URL
// (Session Pooler / IPv4) — VACUUM FULL لا يمكن تشغيله عبر API Supabase العادي.
export async function POST() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'system_operator') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const client = await getSystemPgClient()
  if (!client) {
    return NextResponse.json({
      ok: false,
      error: 'DATABASE_URL غير مضبوطة — أضفها في Vercel (Session Pooler) لإتاحة استعادة المساحة',
    }, { status: 400 })
  }

  // الجداول العملياتية: كلها صغيرة، والـ VACUUM FULL لحظي عمليًا
  const tables = ['child_vaccination_records', 'vaccine_batches', 'audit_log', 'vaccinators', 'user_profiles']
  const results: { table: string; ok: boolean; error?: string }[] = []

  try {
    for (const t of tables) {
      try {
        await client.query(`VACUUM FULL public.${t}`)
        results.push({ table: t, ok: true })
      } catch (err) {
        results.push({ table: t, ok: false, error: err instanceof Error ? err.message : 'فشل VACUUM' })
      }
    }
    const failed = results.filter(r => !r.ok)
    if (failed.length === tables.length) {
      return NextResponse.json({ ok: false, results, error: 'تعذر تنفيذ VACUUM FULL على كل الجداول' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, results })
  } finally {
    await client.end()
  }
}
