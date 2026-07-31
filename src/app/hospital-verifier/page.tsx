import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import { getChildrenByHospital } from '@/lib/db/children'
import { getHospitalById } from '@/lib/db/hospitals'
import { getVaccinatorsByHospital } from '@/lib/db/vaccinators'
import { getBatchBalance } from '@/lib/db/batches'
import VerifyList from './VerifyList'
import Link from 'next/link'

export default async function HospitalVerifierPage() {
  const user = await getCurrentUser()
  const hospitalId = user?.hospitalIds[0]

  if (!hospitalId) return <DashboardShell allowedRoles={['hospital_verifier']}><div>لم يتم ربطك بأي مستشفى.</div></DashboardShell>

  const hospital = await getHospitalById(hospitalId)
  const children = await getChildrenByHospital(hospitalId)
  const vaccinators = await getVaccinatorsByHospital(hospitalId)
  const balances = await getBatchBalance(hospitalId)
  const pendingVerification = children.filter(c => !c.is_verified)
  const verified = children.filter(c => c.is_verified)

  return (
    <DashboardShell allowedRoles={['hospital_verifier']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">لوحة الموثق</h2>
            <p className="text-gray-600">{hospital?.name}</p>
          </div>
          <Link href="/hospital-verifier/vaccinators" className="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700">
            إدارة القائمين بالتطعيم
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-yellow-600">{pendingVerification.length}</div>
            <div className="text-sm text-gray-600">بانتظار التوثيق</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-green-600">{verified.length}</div>
            <div className="text-sm text-gray-600">تم توثيقها</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-blue-600">{vaccinators.length}</div>
            <div className="text-sm text-gray-600">قائمة القائمين بالتطعيم</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-4">الطعوم والدفعات المستلمة</h3>
          {balances.length === 0 ? (
            <p className="text-gray-500 text-center py-8">لا توجد دفعات مستلمة بعد</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right border-b text-gray-600">
                  <th className="py-2">رقم التشغيلة</th>
                  <th className="py-2">تاريخ الصلاحية</th>
                  <th className="py-2">المُسلَّم</th>
                  <th className="py-2">المستخدم</th>
                  <th className="py-2">المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {balances.map(b => (
                  <tr key={b.batch_id} className="border-b hover:bg-gray-50">
                    <td className="py-2 font-medium">{b.batch_number}</td>
                    <td className="py-2">{b.expiry_date}</td>
                    <td className="py-2">{b.total_quantity}</td>
                    <td className="py-2">{b.used_quantity}</td>
                    <td className={`py-2 font-bold ${b.remaining_balance <= 0 ? 'text-red-600' : 'text-green-600'}`}>{b.remaining_balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-4">سجلات بانتظار التوثيق</h3>
          {pendingVerification.length === 0 ? (
            <p className="text-gray-500 text-center py-8">جميع السجلات موثقة</p>
          ) : (
            <VerifyList records={pendingVerification} userId={user!.id} />
          )}
        </div>
      </div>
    </DashboardShell>
  )
}
