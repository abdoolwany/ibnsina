import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import DashboardNav from './DashboardNav'

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
    <div dir="rtl" className="min-h-screen bg-background">
      <DashboardNav user={user} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
