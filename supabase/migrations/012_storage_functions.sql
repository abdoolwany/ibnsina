-- ============================================================
-- الترحيل 12: دوال حجم قاعدة البيانات (تُستدعى عبر RPC بالـ service role)
-- تتيح مراقبة التخزين دون الحاجة لاتصال pg مباشر (DATABASE_URL)
-- ============================================================

CREATE OR REPLACE FUNCTION get_database_total_size()
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT pg_database_size(current_database())
$$;

CREATE OR REPLACE FUNCTION get_database_table_sizes()
RETURNS TABLE (schemaname text, table_name text, approx_rows bigint, size_bytes bigint, size_pretty text)
LANGUAGE sql
STABLE
AS $$
  SELECT s.schemaname::text, s.relname::text, s.n_live_tup,
         pg_total_relation_size(s.relid)::bigint,
         pg_size_pretty(pg_total_relation_size(s.relid))
  FROM pg_stat_user_tables s
  WHERE s.schemaname IN ('public', 'auth', 'storage')
  ORDER BY pg_total_relation_size(s.relid) DESC
$$;

-- تقييد الاستدعاء: الخدمات والمصادق عليهم فقط (وليس الجمهور)
REVOKE EXECUTE ON FUNCTION get_database_total_size() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_database_table_sizes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_database_total_size() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_database_table_sizes() TO authenticated, service_role;
