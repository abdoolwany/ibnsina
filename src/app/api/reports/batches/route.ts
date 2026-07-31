import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

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
  const includeExpired = searchParams.get('include_expired') === 'true'

  const profileResult = await (supabase.from('user_profiles').select('role').eq('id', user.id).single() as never) as { data: { role: string } | null }
  const role = profileResult.data?.role
  if (!role) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const linksResult = await (supabase.from('user_hospital_links').select('hospital_id') as never) as { data: Array<{ hospital_id: string }> | null }
  const userHospitalIds = linksResult.data?.map(l => l.hospital_id) ?? []

  const today = new Date().toISOString().slice(0, 10)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('vaccine_batches')
    .select('*, hospitals(name)')

  if (role !== 'moh_admin') {
    query = query.in('hospital_id', userHospitalIds)
  }

  if (hospitalId && (role === 'moh_admin' || userHospitalIds.includes(hospitalId))) {
    query = query.eq('hospital_id', hospitalId)
  }

  if (dateFrom) query = query.gte('delivery_date', dateFrom)
  if (dateTo) query = query.lte('delivery_date', dateTo)

  // إخفاء التشغيلات المنتهية افتراضيًا مع إمكانية إظهارها
  if (!includeExpired) {
    query = query.gte('expiry_date', today)
  }

  query = query.order('delivery_date', { ascending: false })

  const queryResult = await query as { data: BatchRow[] | null; error: { message: string } | null }
  const { data: batches, error } = queryResult
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const allBatches = batches ?? []
  const batchIds = allBatches.map(b => b.id)

  // عدد الجرعات المستخدمة لكل دفعة ضمن الفترة (كل السجلات غير المحذوفة)
  let usedQuery: any = supabase
    .from('child_vaccination_records')
    .select('batch_id')
    .eq('is_deleted', false)
    .in('batch_id', batchIds.length > 0 ? batchIds : ['00000000-0000-0000-0000-000000000000'])

  if (dateFrom) usedQuery = usedQuery.gte('vaccination_date', dateFrom)
  if (dateTo) usedQuery = usedQuery.lte('vaccination_date', dateTo)

  const { data: usedRows } = await usedQuery as { data: Array<{ batch_id: string }> | null }
  const usedMap = new Map<string, number>()
  for (const r of usedRows ?? []) {
    usedMap.set(r.batch_id, (usedMap.get(r.batch_id) ?? 0) + 1)
  }

  // الرصيد المتبقي الحالي لكل دفعة عبر الـ View (خاضع لـ RLS)
  let balanceQuery: any = supabase.from('batch_balance_view').select('*')
  if (role !== 'moh_admin') {
    balanceQuery = balanceQuery.in('hospital_id', userHospitalIds)
  }
  const { data: balances } = await balanceQuery as { data: Array<{ batch_id: string; remaining_balance: number }> | null }
  const balanceMap = new Map((balances ?? []).map(b => [b.batch_id, b.remaining_balance]))

  const rows = allBatches.map(b => ({
    batch_id: b.id,
    hospital_id: b.hospital_id,
    hospital_name: (b as BatchRow & { hospitals: { name: string } | null }).hospitals?.name ?? '-',
    batch_number: b.batch_number,
    delivery_date: b.delivery_date,
    expiry_date: b.expiry_date,
    received: b.quantity,
    used: usedMap.get(b.id) ?? 0,
    remaining: balanceMap.get(b.id) ?? 0,
  }))

  const totals = rows.reduce(
    (s, r) => ({ received: s.received + r.received, used: s.used + r.used, remaining: s.remaining + r.remaining }),
    { received: 0, used: 0, remaining: 0 }
  )

  // تسجيل التقرير في سجل التدقيق
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('audit_log').insert({
    table_name: 'reports_batches',
    record_id: '00000000-0000-0000-0000-000000000000',
    action: 'insert',
    performed_by: user.id,
    new_value: { report_params: { date_from: dateFrom, date_to: dateTo, hospital_id: hospitalId, include_expired: includeExpired } },
  } as any))

  return NextResponse.json({ rows, totals })
}

interface BatchRow {
  id: string
  hospital_id: string
  quantity: number
  delivery_date: string
  batch_number: string
  expiry_date: string
}
