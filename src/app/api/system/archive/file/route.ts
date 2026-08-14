import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { readArchiveFile, deleteArchiveFileManually, isValidMonthKey } from '@/lib/db/archive'

// GET  /api/system/archive/file?month=YYYY-MM — قراءة ملف شهر (system_operator + moh_admin)
// DELETE /api/system/archive/file — حذف ملف شهر (system_operator فقط)
// body: { month, confirm } — confirm مطلوب عندما يكون الملف النسخة الوحيدة

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'system_operator' && user.role !== 'moh_admin')) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const month = new URL(request.url).searchParams.get('month')
  if (!month || !isValidMonthKey(month)) {
    return NextResponse.json({ error: 'شهر غير صالح (الصيغة YYYY-MM)' }, { status: 400 })
  }

  try {
    const content = await readArchiveFile(month)
    if (!content) {
      return NextResponse.json({ error: 'لا يوجد ملف أرشيف لهذا الشهر' }, { status: 404 })
    }
    return NextResponse.json({ month, content })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'خطأ غير متوقع' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'system_operator') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const body = await request.json()
  const month: string | undefined = body?.month
  if (!month || !isValidMonthKey(month)) {
    return NextResponse.json({ error: 'شهر غير صالح (الصيغة YYYY-MM)' }, { status: 400 })
  }

  try {
    // هل يتبقى للشهر سجلات حية في الداتا بيز؟ إن لم يتبقَّ، فالملف هو
    // النسخة الوحيدة ويتطلب تأكيدًا صريحًا قبل الحذف.
    const admin = await createServiceRoleClient()
    const from = `${month}-01T00:00:00Z`
    const { count } = await admin
      .from('child_vaccination_records')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', from)
      .lt('created_at', `${month}-31T23:59:59Z`)
    const onlyCopy = (count ?? 0) === 0

    if (onlyCopy && body?.confirm !== true) {
      return NextResponse.json(
        {
          error: 'هذا الملف هو النسخة الوحيدة لبيانات هذا الشهر (لا توجد سجلات حية في الداتا بيز). أرسل confirm: true للتأكيد.',
          onlyCopy,
        },
        { status: 409 }
      )
    }

    const result = await deleteArchiveFileManually(month, user.id)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
