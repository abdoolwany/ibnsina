import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import { getBatchById, getBatchBalanceById } from '@/lib/db/batches'
import { getHospitalById } from '@/lib/db/hospitals'
import BatchEditForm from '@/app/moh-level1/BatchEditForm'
import Link from 'next/link'

// تعديل دفعة أرسلها حساب وزارة - مستوى أول، متاح فقط إن لم تُستخدم منها أي جرعة.
// القيد مفروض أيضًا في RLS (ترحيل 17): التعديل/الحذف يُرفض من قاعدة البيانات
// إن وُجد أي طفل مطعّم من الدفعة (حي أو مؤرشف).
export default async function BatchEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return <DashboardShell allowedRoles={['moh_level1']}><div>غير مصرح</div></DashboardShell>

  const batch = await getBatchById(id)
  if (!batch) {
    return (
      <DashboardShell allowedRoles={['moh_level1']}>
        <div className="space-y-4">
          <p className="text-red-600">الدفعة غير موجودة أو لا تملك صلاحية الوصول إليها.</p>
          <Link href="/moh-level1" className="btn btn-secondary">العودة للوحة</Link>
        </div>
      </DashboardShell>
    )
  }

  const balance = await getBatchBalanceById(id)
  const used = balance?.used_quantity ?? 0

  const hospital = await getHospitalById(batch.hospital_id)

  return (
    <DashboardShell allowedRoles={['moh_level1']}>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-2xl font-bold">تعديل الدفعة</h2>
          <p className="text-gray-600">
            {hospital?.name ?? ''} — تشغيلة: {batch.batch_number}
          </p>
        </div>

        {used > 0 ? (
          <div className="card p-6">
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg text-sm">
              لا يمكن تعديل هذه الدفعة لأن {used} جرعة استُخدمت منها.
              لتحرير الدفعة يجب أولًا حذف سجلات الأطفال غير الموثقة المرتبطة بها
              (من لوحة مدخل البيانات أو الموثق) لتُرجع الجرعات إلى الرصيد.
            </div>
            <div className="mt-4">
              <Link href="/moh-level1" className="btn btn-secondary">العودة للوحة</Link>
            </div>
          </div>
        ) : (
          <div className="card p-6">
            <BatchEditForm batch={batch} />
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
