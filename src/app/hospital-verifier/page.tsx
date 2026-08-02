import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import { getChildrenByHospital } from '@/lib/db/children'
import { getHospitalById } from '@/lib/db/hospitals'
import { getVaccinatorsByHospital } from '@/lib/db/vaccinators'
import { getBatchBalance } from '@/lib/db/batches'
import { getRequestStatusByRecordIds } from '@/lib/db/unverifyRequests'
import VerifyList from './VerifyList'
import VerifiedRequestsSection from './VerifiedRequestsSection'
import BatchBalanceTable from './BatchBalanceTable'
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
  const requestStatuses = await getRequestStatusByRecordIds(hospitalId)

  return (
    <DashboardShell allowedRoles={['hospital_verifier']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">لوحة الموثق</h2>
            <p className="text-gray-600">{hospital?.name}</p>
          </div>
          <Link href="/hospital-verifier/vaccinators" className="btn btn-secondary">
            إدارة القائمين بالتطعيم
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="text-2xl font-bold text-yellow-600">{pendingVerification.length}</div>
            <div className="text-sm text-gray-600">بانتظار التوثيق</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-green-600">{verified.length}</div>
            <div className="text-sm text-gray-600">تم توثيقها</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-primary">{vaccinators.length}</div>
            <div className="text-sm text-gray-600">قائمة القائمين بالتطعيم</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-indigo-600">{balances.reduce((s, b) => s + b.remaining_balance, 0)}</div>
            <div className="text-sm text-gray-600">إجمالي الرصيد المتبقي</div>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-lg font-semibold mb-4">الطعوم والدفعات المستلمة</h3>
          <BatchBalanceTable balances={balances} />
        </div>

        <div className="card p-4">
          <h3 className="text-lg font-semibold mb-4">سجلات بانتظار التوثيق</h3>
          {pendingVerification.length === 0 ? (
            <p className="text-gray-500 text-center py-8">جميع السجلات موثقة</p>
          ) : (
            <VerifyList records={pendingVerification} userId={user!.id} />
          )}
        </div>

        <VerifiedRequestsSection
          verifiedRecords={verified.map(c => ({
            id: c.id,
            child_full_name: c.child_full_name,
            vaccination_date: c.vaccination_date,
            requestStatus: requestStatuses[c.id] ?? null,
          }))}
          hospitalId={hospitalId}
          userId={user!.id}
        />
      </div>
    </DashboardShell>
  )
}
