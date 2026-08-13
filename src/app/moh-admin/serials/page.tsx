import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import { getAllHospitals } from '@/lib/db/hospitals'
import SerialManager from './SerialManager'

export default async function SerialsPage() {
  const user = await getCurrentUser()
  if (!user) return <DashboardShell allowedRoles={['moh_admin']}><div>غير مصرح</div></DashboardShell>

  const hospitals = await getAllHospitals()

  return (
    <DashboardShell allowedRoles={['moh_admin']}>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">إدارة الأرقام المسلسلة</h2>
        <p className="text-gray-600">
          إعادة فتح رقم غير مستخدم بعد حذف سجل، تغيير رقم سجل إلى رقم آخر حر، أو إلغاء إعادة فتح —
          كل عملية حساسة تُسجَّل في سجل التدقيق.
        </p>
        <SerialManager hospitals={hospitals} />
      </div>
    </DashboardShell>
  )
}
