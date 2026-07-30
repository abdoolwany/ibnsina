import { createServerSupabase } from './supabase/server'
import type { UserRole } from '@/types/database'

export interface AuthUser {
  id: string
  email: string
  role: UserRole | null
  fullName: string | null
  hospitalIds: string[]
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileResult = await (supabase.from('user_profiles').select('role, full_name').eq('id', user.id).single() as any)
  const profile = profileResult.data as { role: UserRole; full_name: string } | null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linksResult = await (supabase.from('user_hospital_links').select('hospital_id') as any)
  const links = linksResult.data as Array<{ hospital_id: string }> | null

  return {
    id: user.id,
    email: user.email ?? '',
    role: profile?.role ?? null,
    fullName: profile?.full_name ?? null,
    hospitalIds: links?.map(l => l.hospital_id) ?? [],
  }
}

export function getDashboardUrl(role: UserRole | null): string {
  switch (role) {
    case 'hospital_entry': return '/hospital-entry'
    case 'hospital_verifier': return '/hospital-verifier'
    case 'moh_level1': return '/moh-level1'
    case 'moh_admin': return '/moh-admin'
    default: return '/'
  }
}
