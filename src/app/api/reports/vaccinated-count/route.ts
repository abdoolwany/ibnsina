import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

// صف مُعاد من RPC vaccinated_count_report (إحصاءات مجمّعة لعدد المتطعمين)
type VaccinatedCountRow = {
  total: number
  verified: number
  unverified: number
  male: number
  female: number
  egyptian: number
  non_egyptian: number
  nationality_breakdown: Array<{ nationality: string; count: number }>
}

export async function GET(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const hospitalId = searchParams.get('hospital_id')
  const nationality = searchParams.get('nationality')
  const vaccinatorId = searchParams.get('vaccinator_id')
  const enteredBy = searchParams.get('entered_by')

  const profileResult = await (supabase.from('user_profiles').select('role').eq('id', user.id).single() as never) as { data: { role: string } | null }
  const role = profileResult.data?.role
  if (!role) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  // إلزام نطاق تاريخ التطعيم (من - إلى) — بلا حد 31 يومًا (تقرير عدد المتطعمين)
  if (!from || !to) {
    return NextResponse.json({
      error: 'يجب تحديد تاريخ البداية والنهاية',
    }, { status: 400 })
  }

  // مستوى أول محصور بمستشفياته المرتبطة عبر RLS حتى لو مرّر معرفًا
  const params: Record<string, string | null> = {
    p_from: from,
    p_to: to,
    p_hospital_id: hospitalId && (role === 'moh_admin' || role === 'moh_level1') ? hospitalId : null,
    p_nationality: nationality,
    p_vaccinator_id: vaccinatorId,
    p_entered_by: enteredBy,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcResult = await (supabase as any).rpc('vaccinated_count_report', params) as { data: VaccinatedCountRow[] | null; error: { message: string } | null }
  const row = rpcResult.data?.[0]
  const error = rpcResult.error

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // تسجيل التقرير في سجل التدقيق (نطاق البيانات الذي طلبه المستخدم — القسم 9)
  await (supabase.from('audit_log').insert({
    table_name: 'reports',
    record_id: '00000000-0000-0000-0000-000000000000',
    action: 'insert',
    performed_by: user.id,
    new_value: {
      report_type: 'vaccinated_count',
      report_params: {
        from,
        to,
        hospital_id: hospitalId,
        nationality,
        vaccinator_id: vaccinatorId,
        entered_by: enteredBy,
      },
    },
  } as never))

  return NextResponse.json({
    statistics: row ?? {
      total: 0, verified: 0, unverified: 0,
      male: 0, female: 0, egyptian: 0, non_egyptian: 0,
      nationality_breakdown: [],
    },
  })
}
