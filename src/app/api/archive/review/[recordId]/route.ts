import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { updateArchiveReviewRecord } from '@/lib/db/archiveReview'

// PATCH /api/archive/review/[recordId] — تعديل سجل داخل جلسة مراجعة مفتوحة
// body: { sessionId, data } — يُسجَّل التعديل إجباريًا في audit_log
// الصلاحية: moh_admin + system_operator (الاستثناء المحدود للأرشيف فقط)

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> }
) {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'moh_admin' && user.role !== 'system_operator')) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const { recordId } = await params
  const { sessionId, data } = await request.json()
  if (!sessionId || !recordId || !data || typeof data !== 'object') {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  try {
    await updateArchiveReviewRecord(sessionId, recordId, data, user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
