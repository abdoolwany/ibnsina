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

// عدّادات خفيفة (COUNT فقط دون جلب الصفوف) — تُستخدم في لوحة المدخل بدلًا من جلب كل السجلات
export async function getChildrenCountByHospital(hospitalId: string): Promise<number> {
  const supabase = await createServerSupabase()
  const { count } = await supabase
    .from('child_vaccination_records')
    .select('id', { count: 'exact', head: true })
    .eq('hospital_id', hospitalId)
    .eq('is_deleted', false)
  return count ?? 0
}

export async function getUnverifiedCountByHospital(hospitalId: string): Promise<number> {
  const supabase = await createServerSupabase()
  const { count } = await supabase
    .from('child_vaccination_records')
    .select('id', { count: 'exact', head: true })
    .eq('hospital_id', hospitalId)
    .eq('is_deleted', false)
    .eq('is_verified', false)
  return count ?? 0
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
  record: Omit<ChildVaccinationRecord, 'id' | 'created_at' | 'updated_at' | 'is_verified' | 'verified_by' | 'verified_at' | 'is_deleted' | 'serial_number' | 'serial_month' | 'serial_year'>
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

// قائمة السجلات الموثّقة في مستشفيات معينة (مع اسم المستشفى) — تُستخدم في لوحة
// moh_level1 لعرض سجلات "تسجيل الميكنة". العزل يبقى عبر RLS: moh_level1 يقرأ
// مستشفياته المرتبطة فقط حتى لو مرّر معرفات خارجية في القائمة.
export async function getVerifiedChildrenByHospitals(hospitalIds: string[]): Promise<
  Array<ChildVaccinationRecord & { hospitals: { name: string } | null }>
> {
  const supabase = await createServerSupabase()
  if (hospitalIds.length === 0) return []
  const { data } = await supabase
    .from('child_vaccination_records')
    .select('*, hospitals(name)')
    .in('hospital_id', hospitalIds)
    .eq('is_deleted', false)
    .eq('is_verified', true)
    .order('verified_at', { ascending: false, nullsFirst: false })
  return (data ?? []) as Array<ChildVaccinationRecord & { hospitals: { name: string } | null }>
}
