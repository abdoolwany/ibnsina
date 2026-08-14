import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { archiveBeforeDelete } from '@/lib/db/archive'

// POST /api/system/archive/protect-record — ضمانة التسليم قبل الحذف الفردي
// body: { id } — يُستدعى من لوحتي الإدخال/التوثيق قبل الحذف الفردي لسجل طفل
// (DeleteChildButton / ChildRecordView). يتحقق من صلاحية حذف السجل وفق
// نفس قواعد RLS (مستشفى المستخدم فقط + غير موثق)، ثم يُدرج آخر حالة السجل
// في أرشيفه إن كان مؤهلًا (مؤرشف مسبقًا أو أقدم من حد الأقدمية).
// إن فشلت الأرشفة يُرجع خطأ فيُلغى الحذف من الواجهة.

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'hospital_entry' && user.role !== 'hospital_verifier')) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const { id } = await request.json()
  if (!id) {
    return NextResponse.json({ error: 'معرف السجل مطلوب' }, { status: 400 })
  }

  try {
    const admin = await createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: record, error } = await (admin.from('child_vaccination_records').select('*').eq('id', id).single() as any)
    if (error) {
      return NextResponse.json({ error: 'السجل غير موجود' }, { status: 404 })
    }

    // نفس قيود الحذف الفردي: مستشفى المستخدم فقط + السجل غير موثق
    if (!user.hospitalIds.includes(record.hospital_id)) {
      return NextResponse.json({ error: 'غير مصرح — السجل خارج نطاق مستشفاك' }, { status: 403 })
    }
    if (record.is_verified) {
      return NextResponse.json({ error: 'لا يمكن حذف سجل موثق' }, { status: 403 })
    }

    // تسليم آخر حالة للأرشيف قبل الحذف (إن كان السجل مؤهلًا)
    await archiveBeforeDelete([record], 'child')

    return NextResponse.json({ success: true, protected: true })
  } catch (err) {
    return NextResponse.json(
      { error: `تعذرت الأرشفة قبل الحذف — أُلغي الحذف: ${err instanceof Error ? err.message : 'خطأ'}` },
      { status: 500 }
    )
  }
}
