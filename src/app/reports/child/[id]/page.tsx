import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import AppShell from '@/components/AppShell'
import ChildRecordView from './ChildRecordView'

// صفحة السجل الفردي — تُفتح بالنقر على أي صف في قائمة الأطفال، وتضم كل أزرار
// الإجراءات (تعديل/حذف/توثيق/إعادة فتح) حسب صلاحية ومستوى المستخدم الداخل.
// الوصول محكوم بنفس RLS الخاص بسجلات الأطفال (عزل صارم بين المستشفيات).

// نوع محلي لبيانات السجل القادمة من الخادم (تتجاوز استدلال Supabase المتداخل)
interface ChildRecordData {
  id: string
  hospital_id: string
  child_full_name: string
  child_gender: string
  child_nationality: string
  birth_date: string
  father_first_name: string
  father_grandfather_name: string
  father_national_id: string
  father_passport_number: string | null
  father_phone_number: string | null
  mother_first_name: string
  mother_grandfather_name: string
  mother_national_id: string | null
  mother_passport_number: string | null
  mother_phone_number: string | null
  vaccination_date: string
  is_verified: boolean
  created_at: string
  verified_at: string | null
  vaccinators: { full_name: string } | null
  vaccine_batches: { delivery_date: string; batch_number: string; expiry_date: string } | null
  hospitals: { name: string } | null
}

export default async function ChildRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const supabase = await createServerSupabase()
  const result = await supabase
    .from('child_vaccination_records')
    .select('*, vaccinators(full_name), vaccine_batches!inner(delivery_date, batch_number, expiry_date), hospitals(name)')
    .eq('id', id)
    .eq('is_deleted', false)
    .single()
  const data = result.data as ChildRecordData | null

  const canManage = user.role === 'hospital_entry' || user.role === 'hospital_verifier'

  return (
    <AppShell user={user} maxWidth="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold">سجل طفل</h2>
        <span className={`badge ${data?.is_verified ? 'badge-success' : 'badge-warning'}`}>
          {data?.is_verified ? 'موثّق' : 'غير موثّق'}
        </span>
      </div>
      {!data ? (
        <div className="card p-6 text-center text-gray-600">
          السجل غير موجود أو لا تملك صلاحية الوصول إليه.
        </div>
      ) : (
        <ChildRecordView
          record={data}
          userRole={user.role}
          userId={user.id}
          hospitalIds={user.hospitalIds}
          canManage={canManage && data.hospital_id === user.hospitalIds[0] && !data.is_verified}
          canVerify={user.role === 'hospital_verifier' && data.hospital_id === user.hospitalIds[0]}
        />
      )}
    </AppShell>
  )
}
