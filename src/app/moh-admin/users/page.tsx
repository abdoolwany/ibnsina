import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import { getAllHospitals } from '@/lib/db/hospitals'
import UserManager from './UserManager'

export default async function UsersPage() {
  const user = await getCurrentUser()
  if (!user) return <DashboardShell allowedRoles={['moh_admin']}><div>غير مصرح</div></DashboardShell>

  const hospitals = await getAllHospitals()

  return (
    <DashboardShell allowedRoles={['moh_admin']}>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">إدارة المستخدمين</h2>
        <p className="text-gray-600">إنشاء الحسابات الدنيا (مدخل، موثق، مستوى أول) وتحديد الصلاحيات — إدارة حسابات الإدارة العليا ومدير النظام حصرية لمدير النظام</p>
        <UserManager hospitals={hospitals} currentUserId={user.id} managerRole="moh_admin" />
      </div>
    </DashboardShell>
  )
}
