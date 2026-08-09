import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import { getAllHospitals } from '@/lib/db/hospitals'
import UserManager from '../../moh-admin/users/UserManager'

export default async function SystemOperatorUsersPage() {
  const user = await getCurrentUser()
  if (!user) return <DashboardShell allowedRoles={['system_operator']}><div>غير مصرح</div></DashboardShell>

  const hospitals = await getAllHospitals()

  return (
    <DashboardShell allowedRoles={['system_operator']}>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">إدارة المستخدمين</h2>
        <p className="text-gray-600">إنشاء كل أنواع الحسابات وتحديد الأدوار والصلاحيات — تشمل الإدارة العليا ومديري النظام</p>
        <UserManager hospitals={hospitals} currentUserId={user.id} managerRole="system_operator" />
      </div>
    </DashboardShell>
  )
}