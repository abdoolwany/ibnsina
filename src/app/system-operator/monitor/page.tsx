import DashboardShell from '@/components/DashboardShell'
import ResourceMonitor from './ResourceMonitor'

export default async function SystemOperatorMonitorPage() {
  return (
    <DashboardShell allowedRoles={['system_operator']}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">مراقبة الموارد</h2>
          <p className="text-gray-600">
            استهلاك الموارد الحالي، وتقدير المدة حتى نفاد الحد، لكل خدمة (Supabase، Vercel، GitHub)
          </p>
        </div>
        <ResourceMonitor />
      </div>
    </DashboardShell>
  )
}
