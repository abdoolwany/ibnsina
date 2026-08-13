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
  entered_by: string
  is_verified: boolean
  verified_at: string | null
  created_at: string
  serial_number: number | null
  serial_month: number | null
  serial_year: number | null
  hospital_name: string | null
  vaccinator_name: string | null
  entered_by_name: string | null
  batch_number: string | null
  batch_delivery_date: string | null
  batch_expiry_date: string | null
  ministry_registered: boolean
  ministry_registered_at: string | null
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
  const serialParam = searchParams.get('serial_number')
  // نوع الفلترة الزمنية: birth_date (تاريخ ميلاد الطفل - الافتراضي) أو created_at (تاريخ الإدخال الفعلي)
  const dateType = searchParams.get('date_type') === 'created_at' ? 'created_at' : 'birth_date'

  // Get user profile
  const profileResult = await (supabase.from('user_profiles').select('role').eq('id', user.id).single() as never) as { data: { role: string } | null }
  const role = profileResult.data?.role
  if (!role) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  // إلزام نطاق تاريخ (بداية ونهاية) لكل بحث (القسم 9): يمنع جلب كميات ضخمة
  // دون تحديد زمني. باقي الحقول (اسم، رقم قومي، تشغيلة، مستشفى للمدير) فلاتر اختيارية إضافية.
  if (!dateFrom || !dateTo) {
    return NextResponse.json({
      error: 'يجب تحديد تاريخ البداية والنهاية للبحث',
    }, { status: 400 })
  }

  // الرقم المسلسل ليس فريدًا بين المستشفيات، لذا يلزم تحديد مستشفى لحسابات
  // الوزارة (المستوى الأول والإدارة العليا) عند البحث به — يُفرض على الخادم أيضًا
  // وليس في الواجهة فقط (القسم 2 من المواصفات: حماية على مستوى الخادم).
  const rawSerial = serialParam?.trim() ?? ''
  const isValidSerial = rawSerial !== '' && /^[1-9]\d*$/.test(rawSerial)
  const parsedSerial = isValidSerial ? Number(rawSerial) : null
  if (rawSerial !== '' && !isValidSerial) {
    return NextResponse.json({
      error: 'الرقم المسلسل يجب أن يكون رقمًا صحيحًا موجبًا',
    }, { status: 400 })
  }
  if (isValidSerial && (role === 'moh_admin' || role === 'moh_level1') && !hospitalId) {
    return NextResponse.json({
      error: 'يجب تحديد المستشفى عند البحث بالرقم المسلسل',
    }, { status: 400 })
  }

  // الحد الأقصى لمدة البحث شهر واحد (بحد أقصى 31 يومًا لاستيعاب شهور الـ31 يومًا)
  if (dateRangeDays(dateFrom, dateTo) > MAX_REPORT_RANGE_DAYS) {
    return NextResponse.json({
      error: `الحد الأقصى لمدة البحث شهر واحد (بحد أقصى ${MAX_REPORT_RANGE_DAYS} يومًا)`,
    }, { status: 400 })
  }

  // معاملات RPC البحث المتقدم — تُجمع كل القيم المُدخلة بـ AND (راجع القسم 3/9 من المواصفات).
  // عزل المستشفيات لا يُطبَّق يدويًا هنا؛ RPC من نوع SECURITY INVOKER فتبقى RLS مطبقة تلقائيًا.
  // p_hospital_id يُمرَّر فقط للاختيار اليدوي لمستشفى محددة (moh_admin أو moh_level1)،
  // ولأي دور آخر تُترك NULL. مستوى أول محصور بمستشفياته المرتبطة عبر RLS حتى لو مرّر معرفًا.
  const params: Record<string, string | null> = {
    p_birth_from: null,
    p_birth_to: null,
    p_created_from: null,
    p_created_to: null,
    p_hospital_id: hospitalId && (role === 'moh_admin' || role === 'moh_level1') ? hospitalId : null,
    p_nationality: searchParams.get('nationality'),
    p_vaccinator_id: searchParams.get('vaccinator_id'),
    p_entered_by: searchParams.get('entered_by'),
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
    p_serial_number: parsedSerial?.toString() ?? null,
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

  // ترحيل وفرز من جهة الخادم (بند 5): الواجهة تطلب صفحة محددة فقط (20 سجلًا افتراضيًا)،
  // بينما تُحسب الإحصائيات دائمًا على كامل النتيجة. عند التصدير/الطباعة (full=1) تُرجَع كل الصفوف.
  const allRecords = rows ?? []

  const statusFilter = searchParams.get('status')
  const filtered = statusFilter === 'verified' || statusFilter === 'unverified'
    ? allRecords.filter(r => statusFilter === 'verified' ? r.is_verified : !r.is_verified)
    : allRecords

  // فلترة حالة التسجيل على الميكنة (للوزارة فقط في الواجهة): مسجّل / غير مسجّل
  const ministryStatus = searchParams.get('ministry_status')
  const ministryFiltered = ministryStatus === 'registered' || ministryStatus === 'unregistered'
    ? filtered.filter(r => ministryStatus === 'registered' ? r.ministry_registered : !r.ministry_registered)
    : filtered

  // الفرز: مفتاح + اتجاه، مع قيمة افتراضية بالاسم تصاعديًا
  const sortBy = searchParams.get('sort_by') ?? 'child_name'
  const sortDir = searchParams.get('sort_dir') === 'desc' ? 'desc' : 'asc'
  const dirMul = sortDir === 'desc' ? -1 : 1
  const sorted = [...ministryFiltered].sort((a, b) => {
    let av: string | number, bv: string | number
    switch (sortBy) {
      case 'birth_date': av = a.birth_date; bv = b.birth_date; break
      case 'vaccination_date': av = a.vaccination_date; bv = b.vaccination_date; break
      case 'created_at': av = a.created_at; bv = b.created_at; break
      case 'hospital': av = a.hospital_name ?? ''; bv = b.hospital_name ?? ''; break
      case 'father_name': av = `${a.father_first_name} ${a.father_grandfather_name}`; bv = `${b.father_first_name} ${b.father_grandfather_name}`; break
      case 'mother_name': av = `${a.mother_first_name} ${a.mother_grandfather_name}`; bv = `${b.mother_first_name} ${b.mother_grandfather_name}`; break
      default: av = a.child_full_name; bv = b.child_full_name
    }
    av = av ?? ''; bv = bv ?? ''
    if (av < bv) return -1 * dirMul
    if (av > bv) return 1 * dirMul
    return 0
  })

  const total = sorted.length
  const males = sorted.filter(r => r.child_gender === 'male').length
  const females = sorted.filter(r => r.child_gender === 'female').length

  // إحصائيات لكل مستشفى على حدة (على كامل النتيجة)
  const byHospital = new Map<string, HospitalStat>()
  for (const r of sorted) {
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

  // تحديد الصفحة المطلوبة: full=1 للتصدير/الطباعة (كل الصفوف)، وإلا صفحة 20 افتراضيًا
  const isFull = searchParams.get('full') === '1'
  let pageRows: ReportRow[]
  let page = 1
  let pageSize = 20
  let totalPages = 1
  if (isFull) {
    pageRows = sorted
    pageSize = Math.max(total, 1)
  } else {
    const parsedPage = Number.parseInt(searchParams.get('page') ?? '1', 10)
    const parsedSize = Number.parseInt(searchParams.get('page_size') ?? '20', 10)
    page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
    pageSize = [10, 20, 50].includes(parsedSize) ? parsedSize : 20
    totalPages = Math.max(1, Math.ceil(total / pageSize))
    if (page > totalPages) page = totalPages
    const start = (page - 1) * pageSize
    pageRows = sorted.slice(start, start + pageSize)
  }

  // إعادة تشكيل الصفوف المُسطّحة إلى البنية المتداخلة التي تتوقعها الواجهة
  const shaped = pageRows.map(r => ({
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
    entered_by: r.entered_by,
    is_verified: r.is_verified,
    verified_at: r.verified_at,
    created_at: r.created_at,
    serial_number: r.serial_number,
    serial_month: r.serial_month,
    serial_year: r.serial_year,
    ministry_registered: r.ministry_registered,
    ministry_registered_at: r.ministry_registered_at,
    request_status: r.request_status,
    vaccinators: r.vaccinator_name ? { full_name: r.vaccinator_name } : null,
    entered_by_name: r.entered_by_name,
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
        serial_number: serialParam,
        status: statusFilter,
        ministry_status: ministryStatus,
      },
    },
  } as never))

  return NextResponse.json({
    records: shaped,
    statistics: { total, male: males, female: females, byHospital: [...byHospital.values()] },
    total,
    page,
    page_size: pageSize,
    total_pages: totalPages,
  })
}
