import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

type ChildRecord = Record<string, unknown> & {
  id: string
  child_full_name: string
  child_gender: string
  birth_date: string
  father_first_name: string
  father_grandfather_name: string
  father_national_id: string
  mother_first_name: string
  mother_grandfather_name: string
  mother_national_id: string
  vaccination_date: string
  is_verified: boolean
  vaccinators: { full_name: string } | null
  vaccine_batches: { delivery_date: string; batch_number: string; expiry_date: string } | null
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
  const search = searchParams.get('search')
  const hospitalId = searchParams.get('hospital_id')

  // Get user profile and links
  const profileResult = await (supabase.from('user_profiles').select('role').eq('id', user.id).single() as never) as { data: { role: string } | null }
  const role = profileResult.data?.role
  if (!role) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const linksResult = await (supabase.from('user_hospital_links').select('hospital_id') as never) as { data: Array<{ hospital_id: string }> | null }
  const userHospitalIds = linksResult.data?.map(l => l.hospital_id) ?? []

  // Build query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('child_vaccination_records')
    .select('*, vaccinators(full_name), vaccine_batches!inner(delivery_date, batch_number, expiry_date)')

  // Apply hospital isolation
  if (role === 'hospital_entry' || role === 'hospital_verifier') {
    query = query.in('hospital_id', userHospitalIds)
  } else if (role === 'moh_level1') {
    query = query.in('hospital_id', userHospitalIds)
  }

  // Apply specific hospital filter
  if (hospitalId && (role === 'moh_admin' || userHospitalIds.includes(hospitalId))) {
    query = query.eq('hospital_id', hospitalId)
  }

  // Date range filter
  if (dateFrom) query = query.gte('vaccination_date', dateFrom)
  if (dateTo) query = query.lte('vaccination_date', dateTo)

  // Text search
  if (search) {
    query = query.or(`child_full_name.ilike.%${search}%,father_first_name.ilike.%${search}%,father_grandfather_name.ilike.%${search}%`)
  }

  query = query.eq('is_deleted', false).order('vaccination_date', { ascending: false })

  const queryResult = await query as { data: ChildRecord[] | null; error: { message: string } | null }
  const { data: records, error } = queryResult

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const allRecords = records ?? []
  const total = allRecords.length
  const males = allRecords.filter(r => r.child_gender === 'male').length
  const females = allRecords.filter(r => r.child_gender === 'female').length

  // Log the report generation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logEntry: any = {
    table_name: 'reports',
    record_id: '00000000-0000-0000-0000-000000000000',
    action: 'insert',
    performed_by: user.id,
    new_value: {
      report_params: { date_from: dateFrom, date_to: dateTo, search, hospital_id: hospitalId },
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('audit_log').insert(logEntry) as any)

  return NextResponse.json({
    records: allRecords,
    statistics: { total, male: males, female: females },
  })
}
