import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import { getChildrenByHospital } from '@/lib/db/children'
import { getAvailableBatches } from '@/lib/db/batches'
import { getActiveVaccinators } from '@/lib/db/vaccinators'
import { getHospitalById } from '@/lib/db/hospitals'
import Link from 'next/link'

export default async function HospitalEntryPage() {
  const user = await getCurrentUser()
  const hospitalId = user?.hospitalIds[0]

  if (!hospitalId) return <DashboardShell allowedRoles={['hospital_entry']}><div>لم يتم ربطك بأي مستشفى.</div></DashboardShell>

  const hospital = await getHospitalById(hospitalId)
  const children = await getChildrenByHospital(hospitalId)
  const batches = await getAvailableBatches(hospitalId)
  const unverified = children.filter(c => !c.is_verified)

  return (
    <DashboardShell allowedRoles={['hospital_entry']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">لوحة مدخل البيانات</h2>
            <p className="text-gray-600">{hospital?.name}</p>
          </div>
          <Link href="/hospital-entry/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            + تسجيل طفل جديد
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-blue-600">{children.length}</div>
            <div className="text-sm text-gray-600">إجمالي الأطفال المسجلين</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-yellow-600">{unverified.length}</div>
            <div className="text-sm text-gray-600">بانتظار التوثيق</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-green-600">
              {batches.reduce((sum, b) => sum + b.remaining_balance, 0)}
            </div>
            <div className="text-sm text-gray-600">الرصيد المتبقي</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-4">آخر السجلات</h3>
          {children.length === 0 ? (
            <p className="text-gray-500 text-center py-8">لا يوجد أطفال مسجلين بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-right">
                    <th className="py-2 px-3">اسم الطفل</th>
                    <th className="py-2 px-3">تاريخ التطعيم</th>
                    <th className="py-2 px-3">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {children.slice(0, 20).map(child => (
                    <tr key={child.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">{child.child_full_name}</td>
                      <td className="py-2 px-3">{child.vaccination_date}</td>
                      <td className="py-2 px-3">
                        {child.is_verified
                          ? <span className="text-green-600">موثق</span>
                          : <span className="text-yellow-600">بانتظار التوثيق</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
