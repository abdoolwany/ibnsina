import { createServerSupabase } from '@/lib/supabase/server'
import type { ChildVaccinationRecord } from '@/types/database'

export async function getChildrenByHospital(hospitalId: string): Promise<ChildVaccinationRecord[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('child_vaccination_records')
    .select('*')
    .eq('hospital_id', hospitalId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
  return (data ?? []) as ChildVaccinationRecord[]
}

export async function getChildById(id: string): Promise<ChildVaccinationRecord | null> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('child_vaccination_records')
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .single()
  return data as ChildVaccinationRecord | null
}

export async function createChildRecord(
  record: Omit<ChildVaccinationRecord, 'id' | 'created_at' | 'updated_at' | 'is_verified' | 'verified_by' | 'verified_at' | 'is_deleted'>
): Promise<ChildVaccinationRecord> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('child_vaccination_records')
    .insert(record as never)
    .select('*')
    .single()
  if (error) throw error
  return data as ChildVaccinationRecord
}

export async function updateChildRecord(
  id: string,
  updates: Partial<ChildVaccinationRecord>
): Promise<ChildVaccinationRecord> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('child_vaccination_records')
    .update(updates as never)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as ChildVaccinationRecord
}

export async function verifyChildRecord(
  id: string,
  verifiedBy: string
): Promise<ChildVaccinationRecord> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('child_vaccination_records')
    .update({
      is_verified: true,
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
    } as never)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as ChildVaccinationRecord
}

export interface VerifiedChildRecord {
  id: string
  child_full_name: string
  vaccination_date: string
  hospital_name?: string
}

// السجلات الموثّقة ضمن مجموعة مستشفيات (تُستخدم في لوحة المستوى الأول لعرض زر فك التوثيق)
export async function getVerifiedRecordsByHospitals(hospitalIds: string[]): Promise<VerifiedChildRecord[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('child_vaccination_records')
    .select('id, child_full_name, vaccination_date, hospitals(name)')
    .in('hospital_id', hospitalIds)
    .eq('is_verified', true)
    .eq('is_deleted', false)
    .order('vaccination_date', { ascending: false })
    .limit(50)
  return (data ?? []) as unknown as VerifiedChildRecord[]
}

// كل السجلات الموثّقة في النظام (تُستخدم في لوحة الإدارة العليا)
export async function getAllVerifiedRecords(): Promise<VerifiedChildRecord[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('child_vaccination_records')
    .select('id, child_full_name, vaccination_date, hospitals(name)')
    .eq('is_verified', true)
    .eq('is_deleted', false)
    .order('vaccination_date', { ascending: false })
    .limit(100)
  return (data ?? []) as unknown as VerifiedChildRecord[]
}
