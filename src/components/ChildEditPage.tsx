import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getChildById } from '@/lib/db/children'
import { getBatchBalance } from '@/lib/db/batches'
import { getVaccinatorsByHospital } from '@/lib/db/vaccinators'
import { getHospitalById } from '@/lib/db/hospitals'
import ChildRegistrationForm from '@/app/hospital-entry/new/ChildRegistrationForm'
import type { UserRole } from '@/types/database'

interface Props {
  id: string
  allowedRole: UserRole
  backPath: string
}

export default async function ChildEditPage({ id, allowedRole, backPath }: Props) {
  const user = await getCurrentUser()
  if (!user || user.role !== allowedRole) redirect('/')

  const hospitalId = user.hospitalIds[0]
  if (!hospitalId) return <div>لم يتم ربطك بأي مستشفى</div>

  const record = await getChildById(id)
  if (!record || record.hospital_id !== hospitalId) redirect(backPath)
  if (record.is_verified) redirect(backPath)

  const hospital = await getHospitalById(hospitalId)
  const batches = await getBatchBalance(hospitalId)
  const vaccinators = await getVaccinatorsByHospital(hospitalId)

  // نضمن ظهور القائم بالتطعيم الحالي حتى لو لم يعد نشطًا
  if (record.vaccinator_id && !vaccinators.some(v => v.id === record.vaccinator_id)) {
    vaccinators.push({
      id: record.vaccinator_id,
      hospital_id: hospitalId,
      full_name: 'القائم بالتطعيم السابق',
      is_active: false,
      added_by: null,
      created_at: '',
    } as never)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">تعديل بيانات الطفل</h2>
        <p className="text-gray-600">{hospital?.name}</p>
      </div>
      <ChildRegistrationForm
        hospitalId={hospitalId}
        batches={batches}
        vaccinators={vaccinators}
        record={record}
        backPath={backPath}
      />
    </div>
  )
}
