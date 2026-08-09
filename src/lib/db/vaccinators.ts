import { createServerSupabase } from '@/lib/supabase/server'
import type { Vaccinator } from '@/types/database'

export async function getVaccinatorsByHospital(hospitalId: string): Promise<Vaccinator[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('vaccinators')
    .select('*')
    .eq('hospital_id', hospitalId)
    .order('full_name')
  return (data ?? []) as Vaccinator[]
}

export async function getActiveVaccinators(hospitalId: string): Promise<Vaccinator[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('vaccinators')
    .select('*')
    .eq('hospital_id', hospitalId)
    .eq('is_active', true)
    .order('full_name')
  return (data ?? []) as Vaccinator[]
}

// لقائمة خيارات فلتر "القائم بالتطعيم" في التقارير — تعيد قائمة موحّدة
// لكل المستشفيات المرتبطة بالمستخدم (المدخل عبر عدة مستشفيات يحتاجها موحّدة).
export async function getVaccinatorsByHospitals(hospitalIds: string[]): Promise<Vaccinator[]> {
  const supabase = await createServerSupabase()
  if (hospitalIds.length === 0) return []
  const { data } = await supabase
    .from('vaccinators')
    .select('*')
    .in('hospital_id', hospitalIds)
    .order('full_name')
  return (data ?? []) as Vaccinator[]
}

export async function createVaccinator(
  vaccinator: Omit<Vaccinator, 'id' | 'created_at'>
): Promise<Vaccinator> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('vaccinators')
    .insert(vaccinator as never)
    .select('*')
    .single()
  if (error) throw error
  return data as Vaccinator
}

export async function toggleVaccinatorActive(
  id: string,
  isActive: boolean
): Promise<Vaccinator> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('vaccinators')
    .update({ is_active: isActive } as never)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Vaccinator
}
