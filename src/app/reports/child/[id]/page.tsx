import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import DashboardNav from '@/components/DashboardNav'
import ChildRecordView from './ChildRecordView'

// صفحة السجل الفردي — تُفتح في نافذة خاصة من التقارير، ويمكن تنزيل PDF من داخلها.
// الوصول محكوم بنفس RLS الخاص بسجلات الأطفال (عزل صارم بين المستشفيات).
export default async function ChildRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('child_vaccination_records')
    .select('*, vaccinators(full_name), vaccine_batches!inner(delivery_date, batch_number, expiry_date), hospitals(name)')
    .eq('id', id)
    .eq('is_deleted', false)
    .single()

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <DashboardNav user={user} />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-4">
          <h2 className="text-2xl font-bold">سجل طفل</h2>
        </div>
        {!data ? (
          <div className="card p-6 text-center text-gray-600">
            السجل غير موجود أو لا تملك صلاحية الوصول إليه.
          </div>
        ) : (
          <ChildRecordView record={data} />
        )}
      </main>
    </div>
  )
}
