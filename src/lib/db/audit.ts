import { createServerSupabase } from '@/lib/supabase/server'
import type { AuditLog } from '@/types/database'

export async function getAuditLogs(
  tableName?: string,
  recordId?: string
): Promise<AuditLog[]> {
  const supabase = await createServerSupabase()
  let query = supabase.from('audit_log').select('*').order('performed_at', { ascending: false })

  if (tableName) query = query.eq('table_name', tableName)
  if (recordId) query = query.eq('record_id', recordId)

  const { data } = await query.limit(100)
  return (data ?? []) as AuditLog[]
}

export async function logAuditEntry(
  entry: Omit<AuditLog, 'id' | 'performed_at'>
): Promise<void> {
  const supabase = await createServerSupabase()
  const { error } = await supabase.from('audit_log').insert(entry as never)
  if (error) throw error
}
