import { redirect } from 'next/navigation'
import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import AccountForm from './AccountForm'

export default async function AccountPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  return (
    <DashboardShell allowedRoles={['hospital_entry', 'hospital_verifier', 'moh_level1', 'moh_admin']}>
      <div className="max-w-md mx-auto">
        <h2 className="text-2xl font-bold mb-1">حسابي</h2>
        <p className="text-gray-600 mb-6">تغيير كلمة المرور الخاصة بك</p>
        <AccountForm email={user.email} fullName={user.fullName ?? ''} />
      </div>
    </DashboardShell>
  )
}
