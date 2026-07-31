import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import { getAllHospitals } from '@/lib/db/hospitals'
import { getBatchesByHospital, getBatchBalance } from '@/lib/db/batches'
import BatchForm from './BatchForm'
import Link from 'next/link'

export default async function MohLevel1Page() {
  const user = await getCurrentUser()
  if (!user) return <DashboardShell allowedRoles={['moh_level1']}><div>غير مصرح</div></DashboardShell>

  const hospitals = await getAllHospitals()
  const linkedHospitals = hospitals.filter(h => user.hospitalIds.includes(h.id))

  const hospitalData = await Promise.all(
    linkedHospitals.map(async h => {
      const batches = await getBatchesByHospital(h.id)
      const balances = await getBatchBalance(h.id)
      const totalDelivered = balances.reduce((s, b) => s + b.total_quantity, 0)
      const used = balances.reduce((s, b) => s + b.used_quantity, 0)
      const remaining = balances.reduce((s, b) => s + b.remaining_balance, 0)
      return { ...h, batches, totalDelivered, used, remaining }
    })
  )

  return (
    <DashboardShell allowedRoles={['moh_level1']}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">لوحة وزارة الصحة - مستوى أول</h2>
          <p className="text-gray-600">إدارة الشحنات ومراجعة التقارير للمستشفيات المرتبطة</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hospitalData.map(h => (
            <div key={h.id} className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-lg mb-2">{h.name}</h3>
              <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                <div><span className="text-gray-500">تم تسليمه:</span><span className="font-bold mr-1">{h.totalDelivered}</span></div>
                <div><span className="text-gray-500">مستخدم:</span><span className="font-bold mr-1">{h.used}</span></div>
                <div><span className="text-gray-500">المتبقي:</span><span className="font-bold mr-1">{h.remaining}</span></div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-4">إضافة دفعة شحن جديدة</h3>
          <BatchForm hospitals={linkedHospitals} />
        </div>

        {hospitalData.map(h => (
          <div key={h.id} className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-semibold mb-2">{h.name} - الدفعات</h3>
            {h.batches.length === 0 ? (
              <p className="text-gray-500 text-center py-4">لا توجد دفعات بعد</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-right">
                      <th className="py-2 px-3">رقم التشغيلة</th>
                      <th className="py-2 px-3">الكمية</th>
                      <th className="py-2 px-3">تاريخ التسليم</th>
                      <th className="py-2 px-3">تاريخ الصلاحية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.batches.map(b => (
                      <tr key={b.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">{b.batch_number}</td>
                        <td className="py-2 px-3">{b.quantity}</td>
                        <td className="py-2 px-3">{b.delivery_date}</td>
                        <td className="py-2 px-3">{b.expiry_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </DashboardShell>
  )
}
