-- ============================================================
-- الترحيل 036: جداول ودوال مراقبة الموارد (شاشة مشغل النظام)
-- 1) لقطات يومية لمعدل النمو وتوقع المدة المتبقية للنفاذ
-- 2) سجل نبضات الفحص الدوري (keep-awake / UptimeRobot)
-- 3) دالة RPC شاملة تعيد مقاييس النظام دفعة واحدة
-- ============================================================

-- --- 1) اللقطات اليومية (تُجمع عبر مؤقت GitHub Actions) ---
CREATE TABLE IF NOT EXISTS public.system_resource_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at timestamptz NOT NULL DEFAULT now(),
  database_bytes bigint NOT NULL,
  children_active int NOT NULL DEFAULT 0,
  audit_log_count int NOT NULL DEFAULT 0,
  auth_users_count int NOT NULL DEFAULT 0,
  storage_bytes bigint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS system_resource_snapshots_captured_at_idx
  ON public.system_resource_snapshots (captured_at);

ALTER TABLE public.system_resource_snapshots ENABLE ROW LEVEL SECURITY;

-- قراءة اللقطات: مشغل النظام فقط (service_role يتجاوز RLS للكتابة من الخادم)
DROP POLICY IF EXISTS "system_operator_read_snapshots" ON public.system_resource_snapshots;
CREATE POLICY "system_operator_read_snapshots" ON public.system_resource_snapshots
  FOR SELECT USING (get_current_user_role() = 'system_operator');

-- --- 2) سجل نبضات الفحص الدوري ---
CREATE TABLE IF NOT EXISTS public.system_health_checks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'github_actions',
  status text NOT NULL DEFAULT 'ok'
);

CREATE INDEX IF NOT EXISTS system_health_checks_checked_at_idx
  ON public.system_health_checks (checked_at);

ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_operator_read_health_checks" ON public.system_health_checks;
CREATE POLICY "system_operator_read_health_checks" ON public.system_health_checks
  FOR SELECT USING (get_current_user_role() = 'system_operator');

-- --- 3) دالة المقاييس الشاملة (تُستدعى عبر RPC بالـ service role) ---
-- تعيد في JSONB واحد: حجم قاعدة البيانات، أحجام الجداول، الاتصالات، ضرب الكاش،
-- عدد المستخدمين/الجلسات/اللقطات/النشاط اليومي، حجم التخزين، وآخر فحص دوري.
-- SECURITY DEFINER: service_role في هذا المشروع لا يملك SELECT على auth.* مباشرة،
-- والدالة تنفذ بصلاحيات المالك (postgres) لقراءة الجداول النظامية — مع حصر الاستدعاء
-- على service_role فقط وتثبيت search_path لمنع أي اختراق عبر المسارات.
CREATE OR REPLACE FUNCTION public.get_system_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, auth, storage
AS $$
DECLARE
  result jsonb;
  db_bytes bigint;
BEGIN
  db_bytes := pg_database_size(current_database());
  SELECT jsonb_build_object(
    'captured_at', now(),
    'database_size_bytes', db_bytes,
    'database_size_pretty', pg_size_pretty(db_bytes),
    'tables', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'schemaname', s.schemaname,
        'table_name', s.relname,
        'approx_rows', s.n_live_tup,
        'size_bytes', pg_total_relation_size(s.relid),
        'size_pretty', pg_size_pretty(pg_total_relation_size(s.relid))
      ) ORDER BY pg_total_relation_size(s.relid) DESC)
      FROM pg_stat_user_tables s
      WHERE s.schemaname IN ('public', 'auth', 'storage')
    ), '[]'::jsonb),
    'active_connections', (SELECT count(*)::int FROM pg_stat_activity),
    'cache_hit_ratio', (SELECT round(
        (sum(blks_hit)::numeric / NULLIF(sum(blks_hit) + sum(blks_read), 0)) * 100, 1)
      FROM pg_stat_database WHERE datname = current_database()),
    'auth_users', (SELECT count(*)::int FROM auth.users),
    'active_sessions_7d', (SELECT count(*)::int FROM auth.sessions
                           WHERE updated_at > now() - interval '7 days'),
    'children_active', (SELECT count(*)::int FROM public.child_vaccination_records WHERE is_deleted = false),
    'children_total', (SELECT count(*)::int FROM public.child_vaccination_records),
    'children_verified', (SELECT count(*)::int FROM public.child_vaccination_records WHERE is_verified = true),
    'audit_log_count', (SELECT count(*)::int FROM public.audit_log),
    'audit_30d', (SELECT count(*)::int FROM public.audit_log
                  WHERE performed_at >= now() - interval '30 days'),
    'auth_audit_30d', (SELECT count(*)::int FROM auth.audit_log_entries
                       WHERE created_at >= now() - interval '30 days'),
    'audit_today', (SELECT count(*)::int FROM public.audit_log
                    WHERE performed_at >= date_trunc('day', now())),
    'audit_today_verified', (SELECT count(*)::int FROM public.audit_log
                             WHERE performed_at >= date_trunc('day', now()) AND action = 'verify'),
    'storage_bytes', COALESCE((SELECT sum((metadata->>'size')::bigint) FROM storage.objects), 0),
    'storage_objects', (SELECT count(*)::int FROM storage.objects),
    'latest_health_check', (
      SELECT jsonb_build_object('checked_at', checked_at, 'source', source, 'status', status)
      FROM public.system_health_checks
      ORDER BY checked_at DESC
      LIMIT 1
    ),
    'snapshots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'captured_at', captured_at,
        'database_bytes', database_bytes,
        'children_active', children_active
      ) ORDER BY captured_at)
      FROM (SELECT captured_at, database_bytes, children_active
            FROM public.system_resource_snapshots
            ORDER BY captured_at DESC LIMIT 90) sub
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

-- تقييد الاستدعاء: service_role فقط (الشاشة تمر عبر الخادم، ولا تُكشف بيانات حساسة لأي مستخدم)
REVOKE ALL ON FUNCTION public.get_system_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_system_metrics() TO service_role;
