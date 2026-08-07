import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { cairoDayStartUtc, cairoDayEndExclusiveUtc, MAX_REPORT_RANGE_DAYS, dateRangeDays } from '@/lib/time'

// صف مُعاد من RPC search_child_records (حقول السجل + أسماء المستشفى والقائم بالتطعيم
// والتشغيلة + أحدث حالة لطلب إعادة فتح التوثيق إن وُجد)
type ReportRow = {
  id: string
  hospital_id: string
  child_full_name: string
  child_gender: string
  birth_date: string
  child_nationality: string | null
  father_first_name: string
  father_grandfather_name: string
  father_national_id: string
  father_passport_number: string | null
  father_phone_number: string | null
  mother_first_name: string
  mother_grandfather_name: string
  mother_national_id: string | null
  mother_passport_number: string | null
  mother_phone_number: string | null
  vaccination_date: string
  batch_id: string
  vaccinator_id: string
  is_verified: boolean
  verified_at: string | null
  created_at: string
  hospital_name: string | null
  vaccinator_name: string | null
  batch_number: string | null
  batch_delivery_date: string | null
  batch_expiry_date: string | null
  request_status: 'pending' | 'approved' | 'rejected' | null
}

interface HospitalStat {
  hospital_id: string
  hospital_name: string
  total: number
  male: number
  female: number
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const hospitalId = searchParams.get('hospital_id')
  // نوع الفلترة الزمنية: birth_date (تاريخ ميلاد الطفل - الافتراضي) أو created_at (تاريخ الإدخال الفعلي)
  const dateType = searchParams.get('date_type') === 'created_at' ? 'created_at' : 'birth_date'

  // Get user profile
  const profileResult = await (supabase.from('user_profiles').select('role').eq('id', user.id).single() as never) as { data: { role: string } | null }
  const role = profileResult.data?.role
  if (!role) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  // منع البحث الفارغ (القسم 9): يلزم معيار بحث واحد على الأقل لتقليل الحمل على الخادم
  // ولأي دور غير moh_admin لا تُمرَّر hospital_id، لذا لا تُحسب ضمن المعايير إلا للمدير.
  const hasCriteria = !!(dateFrom || dateTo || (hospitalId && role === 'moh_admin')
    || searchParams.get('child_name')
    || searchParams.get('father_name')
    || searchParams.get('father_grandfather')
    || searchParams.get('mother_name')
    || searchParams.get('mother_grandfather')
    || searchParams.get('father_national_id')
    || searchParams.get('mother_national_id')
    || searchParams.get('father_passport')
    || searchParams.get('mother_passport')
    || searchParams.get('father_phone')
    || searchParams.get('mother_phone')
    || searchParams.get('batch_number'))

  if (!hasCriteria) {
    return NextResponse.json({
      error: 'يجب إدخال معيار بحث واحد على الأقل لعرض التقرير (تاريخ محدد، اسم، رقم قومي، رقم تشغيلة...)',
    }, { status: 400 })
  }

  // الحد الأقصى لمدة البحث شهر واحد (30 يومًا) بين تاريخي البداية والنهاية
  if (dateFrom && dateTo && dateRangeDays(dateFrom, dateTo) > MAX_REPORT_RANGE_DAYS) {
    return NextResponse.json({
      error: `الحد الأقصى المسموح بين تاريخ البداية والنهاية هو ${MAX_REPORT_RANGE_DAYS} يومًا`,
    }, { status: 400 })
  }

  // معاملات RPC البحث المتقدم — تُجمع كل القيم المُدخلة بـ AND (راجع القسم 3/9 من المواصفات).
  // عزل المستشفيات لا يُطبَّق يدويًا هنا؛ RPC من نوع SECURITY INVOKER فتبقى RLS مطبقة تلقائيًا.
  // p_hospital_id يُمرَّر فقط للاختيار اليدوي لمستشفى محددة (moh_admin)، ولأي دور آخر تُترك NULL.
  const params: Record<string, string | null> = {
    p_birth_from: null,
    p_birth_to: null,
    p_created_from: null,
    p_created_to: null,
    p_hospital_id: hospitalId && role === 'moh_admin' ? hospitalId : null,
    p_child_name: searchParams.get('child_name'),
    p_father_name: searchParams.get('father_name'),
    p_father_grandfather: searchParams.get('father_grandfather'),
    p_mother_name: searchParams.get('mother_name'),
    p_mother_grandfather: searchParams.get('mother_grandfather'),
    p_father_national_id: searchParams.get('father_national_id'),
    p_mother_national_id: searchParams.get('mother_national_id'),
    p_father_passport: searchParams.get('father_passport'),
    p_mother_passport: searchParams.get('mother_passport'),
    p_father_phone: searchParams.get('father_phone'),
    p_mother_phone: searchParams.get('mother_phone'),
    p_batch_number: searchParams.get('batch_number'),
  }

  // نطاق التاريخ: birth_date مقارنة مباشرة، أما created_at فيُحوَّل لحدود منتصف ليل توقيت القاهرة
  if (dateFrom) {
    if (dateType === 'created_at') {
      params.p_created_from = cairoDayStartUtc(dateFrom)
    } else {
      params.p_birth_from = dateFrom
    }
  }
  if (dateTo) {
    if (dateType === 'created_at') {
      params.p_created_to = cairoDayEndExclusiveUtc(dateTo)
    } else {
      params.p_birth_to = dateTo
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcResult = await (supabase as any).rpc('search_child_records', params) as { data: ReportRow[] | null; error: { message: string } | null }
  const { data: rows, error } = rpcResult

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const allRecords = rows ?? []
  const total = allRecords.length
  const males = allRecords.filter(r => r.child_gender === 'male').length
  const females = allRecords.filter(r => r.child_gender === 'female').length

  // إحصائيات لكل مستشفى على حدة
  const byHospital = new Map<string, HospitalStat>()
  for (const r of allRecords) {
    const existing = byHospital.get(r.hospital_id) ?? {
      hospital_id: r.hospital_id,
      hospital_name: r.hospital_name ?? 'غير معروف',
      total: 0,
      male: 0,
      female: 0,
    }
    existing.total++
    if (r.child_gender === 'male') existing.male++
    if (r.child_gender === 'female') existing.female++
    byHospital.set(r.hospital_id, existing)
  }

  // إعادة تشكيل الصفوف المُسطّحة إلى البنية المتداخلة التي تتوقعها الواجهة
  const shaped = allRecords.map(r => ({
    id: r.id,
    hospital_id: r.hospital_id,
    child_full_name: r.child_full_name,
    child_gender: r.child_gender,
    birth_date: r.birth_date,
    child_nationality: r.child_nationality ?? '',
    father_first_name: r.father_first_name,
    father_grandfather_name: r.father_grandfather_name,
    father_national_id: r.father_national_id,
    father_passport_number: r.father_passport_number,
    father_phone_number: r.father_phone_number,
    mother_first_name: r.mother_first_name,
    mother_grandfather_name: r.mother_grandfather_name,
    mother_national_id: r.mother_national_id,
    mother_passport_number: r.mother_passport_number,
    mother_phone_number: r.mother_phone_number,
    vaccination_date: r.vaccination_date,
    batch_id: r.batch_id,
    vaccinator_id: r.vaccinator_id,
    is_verified: r.is_verified,
    verified_at: r.verified_at,
    created_at: r.created_at,
    request_status: r.request_status,
    vaccinators: r.vaccinator_name ? { full_name: r.vaccinator_name } : null,
    vaccine_batches: r.batch_number ? {
      delivery_date: r.batch_delivery_date ?? '',
      batch_number: r.batch_number,
      expiry_date: r.batch_expiry_date ?? '',
    } : null,
    hospitals: r.hospital_name ? { name: r.hospital_name } : null,
  }))

  // تسجيل التقرير في سجل التدقيق (نطاق البيانات الذي طلبه المستخدم — القسم 9)
  await (supabase.from('audit_log').insert({
    table_name: 'reports',
    record_id: '00000000-0000-0000-0000-000000000000',
    action: 'insert',
    performed_by: user.id,
    new_value: {
      report_params: {
        date_from: dateFrom,
        date_to: dateTo,
        date_type: dateType,
        hospital_id: hospitalId,
        child_name: searchParams.get('child_name'),
        father_name: searchParams.get('father_name'),
        father_grandfather: searchParams.get('father_grandfather'),
        mother_name: searchParams.get('mother_name'),
        mother_grandfather: searchParams.get('mother_grandfather'),
        father_national_id: searchParams.get('father_national_id'),
        mother_national_id: searchParams.get('mother_national_id'),
        father_passport: searchParams.get('father_passport'),
        mother_passport: searchParams.get('mother_passport'),
        father_phone: searchParams.get('father_phone'),
        mother_phone: searchParams.get('mother_phone'),
        batch_number: searchParams.get('batch_number'),
      },
    },
  } as never))

  return NextResponse.json({
    records: shaped,
    statistics: { total, male: males, female: females, byHospital: [...byHospital.values()] },
  })
}
