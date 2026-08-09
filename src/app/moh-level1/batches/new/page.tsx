import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import { getAllHospitals } from '@/lib/db/hospitals'
import BatchForm from './BatchForm'

export default async function NewBatchPage() {
  const user = await getCurrentUser()
  if (!user) return <DashboardShell allowedRoles={['moh_level1']}><div>غير مصرح</div></DashboardShell>

  const hospitals = await getAllHospitals()
  const linkedHospitals = hospitals.filter(h => user.hospitalIds.includes(h.id))

  return (
    <DashboardShell allowedRoles={['moh_level1']}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">إضافة طلبية جديدة</h2>
          <p className="text-gray-600">إدخال دفعة شحن جديدة لأحد المستشفيات المرتبطة</p>
        </div>

        <div className="card p-4">
          <BatchForm hospitals={linkedHospitals} />
        </div>
      </div>
    </DashboardShell>
  )
}
