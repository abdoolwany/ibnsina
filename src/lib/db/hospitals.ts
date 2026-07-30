import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server'
import type { Hospital } from '@/types/database'

export async function getAllHospitals(): Promise<Hospital[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('hospitals').select('*').order('name')
  return (data ?? []) as Hospital[]
}

export async function getHospitalById(id: string): Promise<Hospital | null> {
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('hospitals').select('*').eq('id', id).single()
  return data as Hospital | null
}

export async function createHospital(name: string): Promise<Hospital> {
  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase.from('hospitals').insert({ name } as never).select('*').single()
  if (error) throw error
  return data as Hospital
}
