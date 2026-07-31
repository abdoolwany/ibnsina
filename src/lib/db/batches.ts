import { createServerSupabase } from '@/lib/supabase/server'
import type { VaccineBatch, BatchBalanceView } from '@/types/database'

export async function getBatchesByHospital(hospitalId: string): Promise<VaccineBatch[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('vaccine_batches')
    .select('*')
    .eq('hospital_id', hospitalId)
    .order('delivery_date', { ascending: false })
  return (data ?? []) as VaccineBatch[]
}

export async function getBatchBalance(hospitalId: string): Promise<BatchBalanceView[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('batch_balance_view')
    .select('*')
    .eq('hospital_id', hospitalId)
    .order('expiry_date')
  return (data ?? []) as BatchBalanceView[]
}

export async function getAvailableBatches(hospitalId: string): Promise<BatchBalanceView[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('batch_balance_view')
    .select('*')
    .eq('hospital_id', hospitalId)
    .gt('remaining_balance', 0)
    .order('expiry_date')
  return (data ?? []) as BatchBalanceView[]
}

export async function createBatch(
  batch: Omit<VaccineBatch, 'id' | 'created_at'>
): Promise<VaccineBatch> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('vaccine_batches')
    .insert(batch as never)
    .select('*')
    .single()
  if (error) throw error
  return data as VaccineBatch
}
