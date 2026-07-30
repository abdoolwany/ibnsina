import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getVaccinatorsByHospital } from '@/lib/db/vaccinators'
import VaccinatorManager from './VaccinatorManager'

export default async function VaccinatorsPage() {
  const user = await getCurrentUser()

  if (!user || user.role !== 'hospital_verifier') {
    redirect('/')
  }

  const hospitalId = user.hospitalIds[0]
  if (!hospitalId) return <div>لم يتم ربطك بأي مستشفى</div>

  const vaccinators = await getVaccinatorsByHospital(hospitalId)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold">إدارة القائمين بالتطعيم</h2>
        <p className="text-gray-600">إضافة أو إيقاف القائمين بالتطعيم (لا يتم حذف السجل التاريخي)</p>
      </div>

      <VaccinatorManager vaccinators={vaccinators} hospitalId={hospitalId} userId={user.id} />
    </div>
  )
}
