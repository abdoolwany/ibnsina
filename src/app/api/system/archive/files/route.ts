import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { listArchiveFiles } from '@/lib/db/archive'

// GET /api/system/archive/files — قائمة ملفات الأرشيف (system_operator + moh_admin)
// يُرجع لكل ملف: الشهر، الحجم، تاريخ التحديث، وهل ما زال للشهر سجلات حية
// في الداتا بيز (يعني الملف ليس النسخة الوحيدة).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function monthHasLiveRows(admin: any, monthKey: string): Promise<boolean> {
  const from = `${monthKey}-01T00:00:00Z`
  const { count } = await admin
    .from('child_vaccination_records')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', from)
    .lt('created_at', `${monthKey}-31T23:59:59Z`)
  return (count ?? 0) > 0
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'system_operator' && user.role !== 'moh_admin')) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  try {
    const admin = await createServiceRoleClient()
    const files = await listArchiveFiles()
    const withLive = await Promise.all(
      files.map(async (f) => ({
        ...f,
        month_has_live_rows: await monthHasLiveRows(admin, f.month),
      }))
    )
    return NextResponse.json({ files: withLive })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
