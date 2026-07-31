import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getAvailableBatches } from '@/lib/db/batches'
import { getActiveVaccinators } from '@/lib/db/vaccinators'
import { getHospitalById } from '@/lib/db/hospitals'
import ChildRegistrationForm from './ChildRegistrationForm'

export default async function NewChildPage() {
  const user = await getCurrentUser()

  if (!user || user.role !== 'hospital_entry') {
    redirect('/')
  }

  const hospitalId = user.hospitalIds[0]
  if (!hospitalId) return <div>لم يتم ربطك بأي مستشفى</div>

  const hospital = await getHospitalById(hospitalId)
  const batches = await getAvailableBatches(hospitalId)
  const vaccinators = await getActiveVaccinators(hospitalId)

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">تسجيل طفل جديد</h2>
        <p className="text-gray-600">{hospital?.name}</p>
      </div>
      <ChildRegistrationForm
        hospitalId={hospitalId}
        batches={batches}
        vaccinators={vaccinators}
      />
    </div>
  )
}
