import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import { getAllHospitals } from '@/lib/db/hospitals'
import { getChildrenByHospital } from '@/lib/db/children'
import { getBatchesByHospital, getBatchBalance } from '@/lib/db/batches'
import Link from 'next/link'

export default async function MohAdminPage() {
  const user = await getCurrentUser()
  if (!user) return <DashboardShell allowedRoles={['moh_admin']}><div>غير مصرح</div></DashboardShell>

  const hospitals = await getAllHospitals()

  const hospitalData = await Promise.all(
    hospitals.map(async h => {
      const batches = await getBatchesByHospital(h.id)
      const children = await getChildrenByHospital(h.id)
      const balances = await getBatchBalance(h.id)
      const totalDelivered = batches.reduce((s, b) => s + b.quantity, 0)
      const remaining = balances.reduce((s, b) => s + b.remaining_balance, 0)
      const verified = children.filter(c => c.is_verified).length
      return { ...h, totalDelivered, remaining, childrenCount: children.length, verifiedCount: verified }
    })
  )

  const totals = hospitalData.reduce(
    (s, h) => ({
      children: s.children + h.childrenCount,
      delivered: s.delivered + h.totalDelivered,
      verified: s.verified + h.verifiedCount,
      remaining: s.remaining + h.remaining,
    }),
    { children: 0, delivered: 0, verified: 0, remaining: 0 }
  )

  return (
    <DashboardShell allowedRoles={['moh_admin']}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">لوحة الإدارة العليا - وزارة الصحة</h2>
          <p className="text-gray-600">عرض ومراقبة كل النظام (قراءة فقط)</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-blue-600">{hospitals.length}</div>
            <div className="text-sm text-gray-600">عدد المستشفيات</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-green-600">{totals.delivered}</div>
            <div className="text-sm text-gray-600">إجمالي اللقاحات المسلمة</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-indigo-600">{totals.children}</div>
            <div className="text-sm text-gray-600">إجمالي الأطفال المسجلين</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-emerald-600">{totals.verified}</div>
            <div className="text-sm text-gray-600">تم توثيقها</div>
          </div>
        </div>

        {/* روابط الإدارة */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href="/moh-admin/users" className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">إدارة المستخدمين</h3>
            <p className="text-sm text-gray-500">إنشاء حسابات، تحديد الأدوار، ربط المستشفيات</p>
          </div>
          <span className="text-2xl">👥</span>
        </a>
        <a href="/moh-admin/hospitals" className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">إدارة المستشفيات</h3>
            <p className="text-sm text-gray-500">إضافة أو إزالة مستشفيات من النظام</p>
          </div>
          <span className="text-2xl">🏥</span>
        </a>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-right">
                <th className="py-3 px-4 font-semibold">المستشفى</th>
                <th className="py-3 px-4 font-semibold">لقاحات مسلمة</th>
                <th className="py-3 px-4 font-semibold">أطفال مسجلين</th>
                <th className="py-3 px-4 font-semibold">موثق</th>
                <th className="py-3 px-4 font-semibold">المتبقي</th>
              </tr>
            </thead>
            <tbody>
              {hospitalData.map(h => (
                <tr key={h.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">{h.name}</td>
                  <td className="py-3 px-4">{h.totalDelivered}</td>
                  <td className="py-3 px-4">{h.childrenCount}</td>
                  <td className="py-3 px-4">{h.verifiedCount}</td>
                  <td className="py-3 px-4">{h.remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  )
}
