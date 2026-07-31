import DashboardShell from '@/components/DashboardShell'
import StorageManager from './StorageManager'

export default async function SystemOperatorPage() {
  return (
    <DashboardShell allowedRoles={['system_operator']}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">إدارة النظام والتخزين</h2>
          <p className="text-gray-600">مراقبة استهلاك قاعدة البيانات وأدوات الحذف والتنظيف التلقائي</p>
        </div>
        <StorageManager />
      </div>
    </DashboardShell>
  )
}
