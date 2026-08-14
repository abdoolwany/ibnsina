import DashboardShell from '@/components/DashboardShell'
import { getCurrentUser } from '@/lib/auth'
import ArchiveBrowser from '@/components/ArchiveBrowser'

// /archives — شاشة مراجعة الأرشيف الشهري (moh_admin: عرض/تعديل داخل الجلسة فقط،
// system_operator: عرض + حذف ملفات الأشهر) — بند مراجعة الأرشيف.
export default async function ArchivesPage() {
  const user = await getCurrentUser()
  if (!user) {
    return (
      <DashboardShell allowedRoles={['moh_admin', 'system_operator']}>
        <div>غير مصرح</div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell allowedRoles={['moh_admin', 'system_operator']}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">الأرشيف الشهري</h2>
          <p className="text-gray-600">
            نسخة احتياطية من بيانات الأشهر القديمة تُحفظ هنا بعد خروجها من النظام، مع
            إمكانية مراجعتها وتصحيحها. أما بيانات الأشهر الحديثة فتُعرض من شاشات التقارير العادية.
          </p>
        </div>
        <ArchiveBrowser role={user.role ?? ''} />
      </div>
    </DashboardShell>
  )
}
