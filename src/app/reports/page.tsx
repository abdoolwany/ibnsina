import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getAllHospitals } from '@/lib/db/hospitals'
import { getHospitalById } from '@/lib/db/hospitals'
import AppShell from '@/components/AppShell'
import ReportsContent from './ReportsContent'

export default async function ReportsPage() {
  const user = await getCurrentUser()

  if (!user || !user.role) {
    redirect('/')
  }

  let hospitals
  if (user.role === 'moh_admin') {
    hospitals = await getAllHospitals()
  } else {
    const fetched = await Promise.all(user.hospitalIds.map(id => getHospitalById(id)))
    hospitals = fetched.filter((h): h is NonNullable<typeof h> => h !== null)
  }

  return (
    <AppShell user={user} maxWidth="max-w-7xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">التقارير والبحث</h2>
        <p className="text-gray-600">البحث في سجلات الأطفال والتطعيمات</p>
      </div>
      <ReportsContent
        hospitals={hospitals}
        userRole={user.role}
      />
    </AppShell>
  )
}
