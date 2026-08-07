import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import { getChildrenCountByHospital, getUnverifiedCountByHospital } from '@/lib/db/children'
import { getAvailableBatches } from '@/lib/db/batches'
import { getHospitalById } from '@/lib/db/hospitals'
import Link from 'next/link'

export default async function HospitalEntryPage() {
  const user = await getCurrentUser()
  const hospitalId = user?.hospitalIds[0]

  if (!hospitalId) return <DashboardShell allowedRoles={['hospital_entry']}><div>لم يتم ربطك بأي مستشفى.</div></DashboardShell>

  const hospital = await getHospitalById(hospitalId)
  const totalChildren = await getChildrenCountByHospital(hospitalId)
  const unverified = await getUnverifiedCountByHospital(hospitalId)
  const batches = await getAvailableBatches(hospitalId)

  return (
    <DashboardShell allowedRoles={['hospital_entry']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">لوحة مدخل البيانات</h2>
            <p className="text-gray-600">{hospital?.name}</p>
          </div>
          <Link href="/hospital-entry/new" className="btn btn-primary">
            + تسجيل طفل جديد
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <div className="text-2xl font-bold text-primary">{totalChildren}</div>
            <div className="text-sm text-gray-600">إجمالي الأطفال المسجلين</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-yellow-600">{unverified}</div>
            <div className="text-sm text-gray-600">بانتظار التوثيق</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-green-600">
              {batches.reduce((sum, b) => sum + b.remaining_balance, 0)}
            </div>
            <div className="text-sm text-gray-600">الرصيد المتبقي</div>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-lg font-semibold mb-2">البحث عن سجل</h3>
          <p className="text-gray-600">
            لتعديل أو حذف سجل طفل، استخدم شاشة «التقارير» وابحث عن الطفل (باسمه أو تاريخه أو أي معيار)،
            ثم استخدم أزرار «تعديل» و«حذف» بجانب زر «سجل فردي». هذا يمنع تحميل قائمة كاملة بالأطفال عند كل فتح للوحة.
          </p>
          <Link href="/reports" className="btn btn-secondary mt-3">
            الانتقال إلى شاشة التقارير
          </Link>
        </div>
      </div>
    </DashboardShell>
  )
}
