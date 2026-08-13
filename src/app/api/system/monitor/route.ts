import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getSystemMetrics, getQuotaLimits, saveQuotaLimits, QUOTA_KEYS } from '@/lib/db/monitoring'
import { fetchGithubStatus } from '@/lib/external/github'
import { computeCumulativeProjection, computeMonthlyProjection } from '@/lib/monitoring/projections'
import type { QuotaLimits } from '@/types/monitoring'

const MB = 1024 * 1024

// GET /api/system/monitor — شاشة مراقبة الموارد الشاملة (دور مشغل النظام فقط)
// يجمع: مقاييس قاعدة البيانات + حدود الباقات + توقعات النفاذ + حالة GitHub
export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'system_operator') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  try {
    const [metrics, quotas, github] = await Promise.all([
      getSystemMetrics(),
      getQuotaLimits(),
      fetchGithubStatus(),
    ])

    const dbLimitBytes = quotas.supabase_db_limit_mb * MB
    const dbProjection = computeCumulativeProjection(
      metrics.database_size_bytes,
      dbLimitBytes,
      metrics.snapshots
    )

    // تقدير الحد الأدنى لنشاط Vercel الشهري من عملياتنا الموثّقة (سجل التدقيق + المصادقة)
    const documentedOps30d = metrics.audit_30d + metrics.auth_audit_30d
    const vercelProjection = computeMonthlyProjection(
      documentedOps30d,
      quotas.vercel_function_invocations_limit,
      30,
      30
    )

    const supabaseRef = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
      .replace(/^https?:\/\//, '')
      .split('.')[0]

    return NextResponse.json({
      captured_at: metrics.captured_at,
      quotas,
      db: {
        size_bytes: metrics.database_size_bytes,
        size_pretty: metrics.database_size_pretty,
        limit_bytes: dbLimitBytes,
        projection: dbProjection,
        tables: metrics.tables,
        snapshots: metrics.snapshots,
        active_connections: metrics.active_connections,
        cache_hit_ratio: metrics.cache_hit_ratio,
        auth_users: metrics.auth_users,
        active_sessions_7d: metrics.active_sessions_7d,
        children_active: metrics.children_active,
        children_total: metrics.children_total,
        children_verified: metrics.children_verified,
        audit_log_count: metrics.audit_log_count,
        audit_today: metrics.audit_today,
        audit_today_verified: metrics.audit_today_verified,
        storage_bytes: metrics.storage_bytes,
        storage_objects: metrics.storage_objects,
        latest_health_check: metrics.latest_health_check,
      },
      vercel: {
        usage_link: 'https://vercel.com/dashboard/usage',
        documented_ops_30d: documentedOps30d,
        projection: vercelProjection,
      },
      supabase: {
        usage_link: supabaseRef
          ? `https://supabase.com/dashboard/project/${supabaseRef}/settings/usage`
          : 'https://supabase.com/dashboard',
        bandwidth_limit_gb: quotas.supabase_bandwidth_limit_gb,
      },
      github,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'خطأ غير متوقع' },
      { status: 500 }
    )
  }
}

// POST /api/system/monitor — حفظ حدود الباقات (قيم أرقام موجبة فقط)
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'system_operator') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  try {
    const body = (await request.json()) as Partial<QuotaLimits>
    const current = await getQuotaLimits()
    const merged: QuotaLimits = { ...current }
    for (const key of QUOTA_KEYS) {
      const value = body[key]
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        merged[key] = value
      }
    }
    await saveQuotaLimits(merged)
    return NextResponse.json({ success: true, quotas: merged })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
