import Link from 'next/link'
import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import { getAllHospitals } from '@/lib/db/hospitals'
import { getBatchBalance } from '@/lib/db/batches'
import { getVerifiedChildrenByHospitals } from '@/lib/db/children'
import { getPendingUnverifyRequestsByHospitals } from '@/lib/db/unverifyRequests'
import BatchListTable from './BatchListTable'
import MinistryRegistrationList from './MinistryRegistrationList'
import UnverifyRequestsList from '@/components/UnverifyRequestsList'

export default async function MohLevel1Page() {
  const user = await getCurrentUser()
  if (!user) return <DashboardShell allowedRoles={['moh_level1']}><div>غير مصرح</div></DashboardShell>

  const hospitals = await getAllHospitals()
  const linkedHospitals = hospitals.filter(h => user.hospitalIds.includes(h.id))

  const [hospitalData, pendingRequests, verifiedChildren] = await Promise.all([
    Promise.all(
      linkedHospitals.map(async h => {
        const balances = await getBatchBalance(h.id)
        const totalDelivered = balances.reduce((s, b) => s + b.total_quantity, 0)
        const used = balances.reduce((s, b) => s + b.used_quantity, 0)
        const remaining = balances.reduce((s, b) => s + b.remaining_balance, 0)
        return { ...h, balances, totalDelivered, used, remaining }
      })
    ),
    getPendingUnverifyRequestsByHospitals(user.hospitalIds),
    getVerifiedChildrenByHospitals(user.hospitalIds),
  ])

  return (
    <DashboardShell allowedRoles={['moh_level1']}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">لوحة وزارة الصحة - مستوى أول</h2>
            <p className="text-gray-600">إدارة الشحنات ومراجعة التقارير للمستشفيات المرتبطة</p>
          </div>
          <Link href="/moh-level1/batches/new" className="btn btn-primary">إضافة طلبية جديدة</Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hospitalData.map(h => (
            <div key={h.id} className="card p-4">
              <h3 className="font-semibold text-lg mb-2">{h.name}</h3>
              <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                <div><span className="text-gray-500">تم تسليمه:</span><span className="font-bold mr-1">{h.totalDelivered}</span></div>
                <div><span className="text-gray-500">مستخدم:</span><span className="font-bold mr-1">{h.used}</span></div>
                <div><span className="text-gray-500">المتبقي:</span><span className="font-bold mr-1">{h.remaining}</span></div>
              </div>
            </div>
          ))}
        </div>

        {hospitalData.map(h => (
          <div key={h.id} className="card p-4">
            <h3 className="text-lg font-semibold mb-2">{h.name} - الدفعات</h3>
            <BatchListTable balances={h.balances} />
          </div>
        ))}

        <MinistryRegistrationList
          records={verifiedChildren}
          hospitals={linkedHospitals.map(h => ({ id: h.id, name: h.name }))}
        />

        <UnverifyRequestsList requests={pendingRequests} />
      </div>
    </DashboardShell>
  )
}
