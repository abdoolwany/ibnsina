import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import { getAllHospitals } from '@/lib/db/hospitals'
import HospitalManager from './HospitalManager'

export default async function HospitalsPage() {
  const user = await getCurrentUser()
  if (!user) return <DashboardShell allowedRoles={['moh_admin']}><div>غير مصرح</div></DashboardShell>

  const hospitals = await getAllHospitals()

  return (
    <DashboardShell allowedRoles={['moh_admin']}>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">إدارة المستشفيات</h2>
        <p className="text-gray-600">إضافة وإزالة المستشفيات من النظام</p>
        <HospitalManager hospitals={hospitals} />
      </div>
    </DashboardShell>
  )
}
