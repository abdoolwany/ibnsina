import { createServerSupabase } from '@/lib/supabase/server'
import type { UnverifyRequestDetail, UnverifyRequestStatus } from '@/types/database'

export interface PendingUnverifyRequest {
  id: string
  record_id: string
  child_full_name: string
  vaccination_date: string
  hospital_name?: string
  requester_name?: string
  requested_at: string
}

// طلبات إعادة فتح التوثيق المعلّقة لمجموعة مستشفيات (لوحة المستوى الأول)
export async function getPendingUnverifyRequestsByHospitals(hospitalIds: string[]): Promise<PendingUnverifyRequest[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('unverify_requests')
    .select(`
      id,
      record_id,
      requested_at,
      hospitals(name),
      child_vaccination_records(child_full_name, vaccination_date),
      user_profiles(full_name)
    `)
    .in('hospital_id', hospitalIds)
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
    .limit(100)
  return mapRequests(data)
}

// كل طلبات إعادة فتح التوثيق المعلّقة في النظام (لوحة الإدارة العليا)
export async function getAllPendingUnverifyRequests(): Promise<PendingUnverifyRequest[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('unverify_requests')
    .select(`
      id,
      record_id,
      requested_at,
      hospitals(name),
      child_vaccination_records(child_full_name, vaccination_date),
      user_profiles(full_name)
    `)
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
    .limit(200)
  return mapRequests(data)
}

function mapRequests(data: unknown): PendingUnverifyRequest[] {
  const rows = (data ?? []) as Array<Record<string, unknown> & {
    hospitals: { name: string } | null
    child_vaccination_records: { child_full_name: string; vaccination_date: string } | null
    user_profiles: { full_name: string } | null
  }>
  return rows.map(r => ({
    id: String(r.id),
    record_id: String(r.record_id),
    requested_at: String(r.requested_at),
    child_full_name: r.child_vaccination_records?.child_full_name ?? '-',
    vaccination_date: r.child_vaccination_records?.vaccination_date ?? '-',
    hospital_name: r.hospitals?.name,
    requester_name: r.user_profiles?.full_name,
  }))
}

// أحدث حالة طلب لكل سجل موثّق في مستشفى (لعرض حالة الطلب في قسم السجلات الموثّقة)
export async function getRequestStatusByRecordIds(hospitalId: string): Promise<Record<string, UnverifyRequestStatus>> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('unverify_requests')
    .select('record_id, status')
    .eq('hospital_id', hospitalId)
  const rows = (data ?? []) as Array<{ record_id: string; status: UnverifyRequestStatus }>
  const map: Record<string, UnverifyRequestStatus> = {}
  for (const r of rows) {
    // عند وجود أكثر من طلب لنفس السجل، تُعرض أحدث حالة (المعلّق هو الأولوية)
    if (!map[r.record_id] || r.status === 'pending') {
      map[r.record_id] = r.status
    }
  }
  return map
}

export type { UnverifyRequestDetail }
