import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { closeArchiveReview } from '@/lib/db/archiveReview'

// POST /api/archive/review/close — إغلاق جلسة المراجعة (حفظ الأرشيف المعدّل ثم حذف الجدولين المؤقتين)
// body: { sessionId } — الصلاحية: moh_admin + system_operator

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'moh_admin' && user.role !== 'system_operator')) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const { sessionId } = await request.json()
  if (!sessionId) {
    return NextResponse.json({ error: 'معرف الجلسة مطلوب' }, { status: 400 })
  }

  try {
    const result = await closeArchiveReview(user.id, sessionId)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
