import { createServerSupabase } from '@/lib/supabase/server'
import type { UserProfile, UserRole } from '@/types/database'

// مستخدم من نوع مدخل/موثّق مع المستشفى المرتبط به — لفلترة "المدخل" في التقارير
export interface HospitalEntryUser {
  id: string
  full_name: string
  role: UserRole
  hospital_id: string
}

// قائمة خيارات فلتر "المدخل" في التقارير — تعيد مستخدمي الإدخال والتدقيق
// المرتبطين بالمستشفيات المعطاة فقط، مع المستشفى لكل مستخدم ليتمكن
// العميل من ترشيحهم حسب المستشفى المحدد. الاستعلام يمرّ عبر العلاقة
// user_hospital_links فتبقى RLS مطبّقة (عزل المستشفيات — الترحيل 028).
export async function getEntryUsersByHospitals(hospitalIds: string[]): Promise<HospitalEntryUser[]> {
  const supabase = await createServerSupabase()
  if (hospitalIds.length === 0) return []

  const { data } = await (supabase
    .from('user_hospital_links')
    .select('hospital_id, user_profiles!inner(id, role, full_name)')
    .in('hospital_id', hospitalIds) as never)

  const seen = new Set<string>()
  const rows = data as Array<{ hospital_id: string; user_profiles: UserProfile | null }> | null
  const result: HospitalEntryUser[] = []
  for (const row of rows ?? []) {
    const p = row.user_profiles
    if (!p || (p.role !== 'hospital_entry' && p.role !== 'hospital_verifier')) continue
    const key = `${row.hospital_id}:${p.id}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ id: p.id, full_name: p.full_name, role: p.role, hospital_id: row.hospital_id })
  }

  return result.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'ar'))
}
