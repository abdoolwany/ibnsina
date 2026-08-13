import { createServiceRoleClient } from '@/lib/supabase/server'
import type { QuotaLimits, SystemMetrics } from '@/types/monitoring'

// ============================================================
// طبقة الوصول لقاعدة البيانات لشاشة المراقبة (عبر service role)
// قراءة المقاييس، حفظ/قراءة حدود الباقات، تسجيل اللقطات والنبضات
// ============================================================

/** الحدود الافتراضية للخطط المجانية (Vercel Hobby + Supabase Free) — قابلة للتعديل من الشاشة */
export const DEFAULT_QUOTA_LIMITS: QuotaLimits = {
  supabase_db_limit_mb: 500,
  supabase_bandwidth_limit_gb: 5,
  supabase_storage_limit_gb: 1,
  vercel_bandwidth_limit_gb: 100,
  vercel_edge_requests_limit: 1_000_000,
  vercel_function_invocations_limit: 1_000_000,
  vercel_provisioned_memory_limit: 360,
  vercel_build_minutes_limit: 6_000,
  vercel_fast_origin_transfer_limit_gb: 10,
}

const QUOTA_KEYS = Object.keys(DEFAULT_QUOTA_LIMITS) as (keyof QuotaLimits)[]

export { QUOTA_KEYS }

/** قراءة مقاييس النظام الشاملة (دالة RPC واحدة في قاعدة البيانات) */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.rpc('get_system_metrics')
  if (error) throw new Error(`فشل قراءة مقاييس النظام: ${error.message}`)
  return data as SystemMetrics
}

/** قراءة حدود الباقات من system_settings مع الدمج بالافتراضية */
export async function getQuotaLimits(): Promise<QuotaLimits> {
  const admin = await createServiceRoleClient()
  const { data } = await admin.from('system_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const row of data ?? []) settings[row.key] = row.value

  const limits: QuotaLimits = { ...DEFAULT_QUOTA_LIMITS }
  for (const key of QUOTA_KEYS) {
    const raw = settings[key]
    if (raw !== undefined) {
      const num = Number(raw)
      if (Number.isFinite(num) && num > 0) limits[key] = num
    }
  }
  return limits
}

/** حفظ حدود الباقات (تحديث كامل — كل القيم تُرسل معًا) */
export async function saveQuotaLimits(limits: QuotaLimits): Promise<void> {
  const admin = await createServiceRoleClient()
  const rows = QUOTA_KEYS.map((key) => ({ key, value: String(limits[key]) }))
  const { error } = await admin.from('system_settings').upsert(rows, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

/** تسجيل لقطة يومية (يستدعيها المؤقت أو مشغل النظام يدويًا) */
export async function recordResourceSnapshot(): Promise<SystemMetrics> {
  const metrics = await getSystemMetrics()
  const admin = await createServiceRoleClient()
  const { error } = await admin.from('system_resource_snapshots').insert({
    database_bytes: metrics.database_size_bytes,
    children_active: metrics.children_active,
    audit_log_count: metrics.audit_log_count,
    auth_users_count: metrics.auth_users,
    storage_bytes: metrics.storage_bytes,
  } as never)
  if (error) throw new Error(`فشل تسجيل اللقطة: ${error.message}`)
  return metrics
}

/** تسجيل نبضة فحص دوري (keep-awake / UptimeRobot) */
export async function recordHealthCheck(source = 'github_actions', status = 'ok'): Promise<void> {
  const admin = await createServiceRoleClient()
  const { error } = await admin
    .from('system_health_checks')
    .insert({ source, status } as never)
  // الفشل في تسجيل النبضة لا يجب أن يعطل نقطة الصحة نفسها
  if (error) console.error('فشل تسجيل نبضة الفحص:', error.message)
}
