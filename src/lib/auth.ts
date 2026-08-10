import { createServerSupabase } from './supabase/server'
import type { UserRole } from '@/types/database'

export interface AuthUser {
  id: string
  email: string
  role: UserRole | null
  fullName: string | null
  hospitalIds: string[]
  hospitalNames: string[]
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileResult = await (supabase.from('user_profiles').select('role, full_name').eq('id', user.id).single() as any)
  const profile = profileResult.data as { role: UserRole; full_name: string } | null

  // نقرأ روابط المستخدم الحالي فقط صراحة (لا نعتمد على RLS وحده): سياسات قراءة
  // روابط المستشفيات تُدمج بـ OR (users_read_own_links + سياسات 028 الخاصة
  // بمستشفيات الدور)، فبدون فلتر user_id تعود كل روابط مستشفيات المستخدم
  // (المستخدمين الآخرين) فتتكرر المستشفيات في hospitalIds والمستشفى يظهر
  // عدة مرات في فلاتر المستشفى.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linksResult = await (supabase.from('user_hospital_links').select('hospital_id, hospitals(name)').eq('user_id', user.id) as any)
  const links = linksResult.data as Array<{ hospital_id: string; hospitals: { name: string } | null }> | null

  return {
    id: user.id,
    email: user.email ?? '',
    role: profile?.role ?? null,
    fullName: profile?.full_name ?? null,
    // إزالة التكرار دفاعًا إضافيًا في حال تكرار صفوف الربط في قاعدة البيانات
    hospitalIds: Array.from(new Set(links?.map(l => l.hospital_id) ?? [])),
    hospitalNames: Array.from(new Set(links?.map(l => l.hospitals?.name ?? '').filter(Boolean) ?? [])),
  }
}

export function getDashboardUrl(role: UserRole | null): string {
  switch (role) {
    case 'hospital_entry': return '/hospital-entry'
    case 'hospital_verifier': return '/hospital-verifier'
    case 'moh_level1': return '/moh-level1'
    case 'moh_admin': return '/moh-admin'
    case 'system_operator': return '/system-operator'
    default: return '/'
  }
}
