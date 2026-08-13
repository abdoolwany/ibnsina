// أنواع بيانات شاشة مراقبة الموارد (دور مشغل النظام)

export interface TableStat {
  schemaname: string
  table_name: string
  approx_rows: number
  size_bytes: number
  size_pretty: string
}

export interface SnapshotPoint {
  captured_at: string
  database_bytes: number
  children_active: number
}

export interface HealthCheckInfo {
  checked_at: string | null
  source: string | null
  status: string | null
}

export interface SystemMetrics {
  captured_at: string
  database_size_bytes: number
  database_size_pretty: string
  tables: TableStat[]
  active_connections: number
  cache_hit_ratio: number | null
  auth_users: number
  active_sessions_7d: number
  children_active: number
  children_total: number
  children_verified: number
  audit_log_count: number
  audit_30d: number
  auth_audit_30d: number
  audit_today: number
  audit_today_verified: number
  storage_bytes: number
  storage_objects: number
  latest_health_check: HealthCheckInfo | null
  snapshots: SnapshotPoint[]
}

export interface GithubRepoInfo {
  full_name: string
  private: boolean
  html_url: string
  size_kb: number
  pushed_at: string | null
  default_branch: string
}

export interface GithubWorkflowRun {
  name: string
  path: string
  last_run_at: string | null
  last_conclusion: string | null
  runs_7d: number
  duration_minutes_7d: number
}

export interface GithubStatus {
  repo: GithubRepoInfo
  workflows: GithubWorkflowRun[]
}

// حدود الباقة المجانية (قابلة للتعديل من الشاشة عبر system_settings)
export type QuotaKey =
  | 'supabase_db_limit_mb'
  | 'supabase_bandwidth_limit_gb'
  | 'supabase_storage_limit_gb'
  | 'vercel_bandwidth_limit_gb'
  | 'vercel_edge_requests_limit'
  | 'vercel_function_invocations_limit'
  | 'vercel_provisioned_memory_limit'
  | 'vercel_build_minutes_limit'
  | 'vercel_fast_origin_transfer_limit_gb'

export interface QuotaLimits {
  supabase_db_limit_mb: number
  supabase_bandwidth_limit_gb: number
  supabase_storage_limit_gb: number
  vercel_bandwidth_limit_gb: number
  vercel_edge_requests_limit: number
  vercel_function_invocations_limit: number
  vercel_provisioned_memory_limit: number
  vercel_build_minutes_limit: number
  vercel_fast_origin_transfer_limit_gb: number
}

// نتيجة توقع المورد التراكمي (لا يتجدد — مثل حجم قاعدة البيانات)
export interface CumulativeProjection {
  status: 'ok' | 'no_growth' | 'insufficient_data' | 'exhausted'
  percent: number
  used: number
  remaining: number
  avgGrowthPerDay: number
  daysUntilLimit: number | null
  etaDate: string | null
  label: string
}

// نتيجة توقع المورد الشهري (يتجدد — مثل استدعاءات Vercel)
export interface MonthlyProjection {
  status: 'safe' | 'exceed' | 'no_data' | 'exhausted'
  avgPerDay: number
  projectedEnd: number
  percentAtEnd: number
  daysUntilLimit: number | null
  label: string
}

// استجابة مسار /api/system/monitor الكاملة
export interface MonitorData {
  captured_at: string
  quotas: QuotaLimits
  db: {
    size_bytes: number
    size_pretty: string
    limit_bytes: number
    projection: CumulativeProjection
    tables: TableStat[]
    snapshots: SnapshotPoint[]
    active_connections: number
    cache_hit_ratio: number | null
    auth_users: number
    active_sessions_7d: number
    children_active: number
    children_total: number
    children_verified: number
    audit_log_count: number
    audit_today: number
    audit_today_verified: number
    storage_bytes: number
    storage_objects: number
    latest_health_check: HealthCheckInfo | null
  }
  vercel: {
    usage_link: string
    documented_ops_30d: number
    projection: MonthlyProjection
  }
  supabase: {
    usage_link: string
    bandwidth_limit_gb: number
  }
  github: GithubStatus | null
}
