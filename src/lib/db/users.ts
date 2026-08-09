import { createServerSupabase } from '@/lib/supabase/server'
import type { UserProfile } from '@/types/database'

// قائمة خيارات فلتر "المدخل" في التقارير — تعيد مستخدمي الإدخال والتدقيق
// المرتبطين بالمستشفيات المعطاة فقط، كاسم موحّد لكل مستشفى.
// الاستعلام يمرّ عبر العلاقة user_hospital_links فتبقى RLS مطبّقة (عزل المستشفيات).
export async function getEntryUsersByHospitals(hospitalIds: string[]): Promise<UserProfile[]> {
  const supabase = await createServerSupabase()
  if (hospitalIds.length === 0) return []

  const { data } = await (supabase
    .from('user_hospital_links')
    .select('user_profiles!inner(id, role, full_name)')
    .in('hospital_id', hospitalIds) as never)

  const seen = new Map<string, UserProfile>()
  const rows = data as Array<{ user_profiles: UserProfile }> | null
  for (const row of rows ?? []) {
    const p = row.user_profiles
    if (p && (p.role === 'hospital_entry' || p.role === 'hospital_verifier') && !seen.has(p.id)) {
      seen.set(p.id, p)
    }
  }

  return Array.from(seen.values()).sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'ar'))
}
