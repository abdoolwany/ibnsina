import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'

// ============================================================
// واجهة برمجية لشاشة "إدارة الأرقام المسلسلة" (moh_admin فقط)
//  - GET: شبكة الأرقام (عدادات + أرقام مُعاد فتحها + سجلات الشهر المحدد)
//  - POST: إعادة فتح رقم / تغيير رقم سجل / إلغاء إعادة الفتح
// كل عملية تعديل تنفَّذ حصريا داخل دالة admin_manage_serial_number
// (SECURITY DEFINER تتحقق من الدور وتكتب audit_log) — يحتفظ moh_admin
// بصلاحية "قراءة فقط" على الجداول نفسها وفق المواصفة، والاستثناء محصور
// في مسار إدارة الأرقام المتفق عليه مع المستخدم.
// ============================================================

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'moh_admin') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const url = new URL(request.url)
  const hospitalId = url.searchParams.get('hospital_id')
  const month = url.searchParams.get('month')
  const year = url.searchParams.get('year')

  const supabase = await createServerSupabase()

  // عدد صفوف العدادات محدود (مستشفى × شهر) — يُحمَّل كاملًا
  const countersRes = await supabase.from('child_serial_counters').select('hospital_id, serial_month, serial_year, last_number')
  if (countersRes.error) return NextResponse.json({ error: 'تعذر جلب العدادات' }, { status: 500 })

  const releasesRes = await supabase.from('child_serial_releases').select('hospital_id, serial_month, serial_year, serial_number, reason')
  if (releasesRes.error) return NextResponse.json({ error: 'تعذر جلب الأرقام المعاد فتحها' }, { status: 500 })

  // سجلات شهر محدد فقط (عند الاختيار) — تضييق نطاق الاستعلام على الخادم
  let records: unknown[] = []
  if (hospitalId && month && year) {
    const recRes = await supabase
      .from('child_vaccination_records')
      .select('id, serial_number, child_full_name, is_verified')
      .eq('hospital_id', hospitalId)
      .eq('serial_month', Number(month))
      .eq('serial_year', Number(year))
      .eq('is_deleted', false)
      .not('serial_number', 'is', null)
    if (recRes.error) return NextResponse.json({ error: 'تعذر جلب سجلات الشهر' }, { status: 500 })
    records = recRes.data
  }

  return NextResponse.json({
    counters: countersRes.data,
    releases: releasesRes.data,
    records,
  })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'moh_admin') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const body = await request.json()
  const { action, hospitalId, serialMonth, serialYear, serialNumber, recordId, reason } = body

  if (action !== 'release' && action !== 'change' && action !== 'cancel_release') {
    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  }

  const supabase = await createServerSupabase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('admin_manage_serial_number', {
    p_action: action,
    p_hospital_id: hospitalId ?? null,
    p_serial_month: serialMonth ?? null,
    p_serial_year: serialYear ?? null,
    p_serial_number: serialNumber ?? null,
    p_record_id: recordId ?? null,
    p_reason: reason ?? null,
  }) as { data: unknown | null; error: { message: string } | null }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) })
}
