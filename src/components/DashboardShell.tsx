import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import AppShell from './AppShell'

interface Props {
  children: React.ReactNode
  allowedRoles: string[]
}

export default async function DashboardShell({ children, allowedRoles }: Props) {
  const user = await getCurrentUser()

  if (!user || !user.role || !allowedRoles.includes(user.role)) {
    redirect('/')
  }

  return (
    <AppShell user={user}>
      {children}
    </AppShell>
  )
}
