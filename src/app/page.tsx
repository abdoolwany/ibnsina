import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDashboardUrl } from '@/lib/auth'
import LoginForm from '@/components/LoginForm'
import type { UserRole } from '@/types/database'

export default async function Home() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase.from('user_profiles').select('role').eq('id', user.id).single() as any)
    const role = (profile as { role: UserRole } | null)?.role
    if (role) {
      redirect(getDashboardUrl(role))
    }
  }

  return <LoginForm />
}
