-- ============================================================
-- الترحيل الثالث: إصلاح دالة RLS المتكررة (stack depth limit exceeded)
-- السبب: الدوال المساعدة كانت تعمل كـ SECURITY INVOKER فتعيد استدعاء RLS
-- نفسها بلا نهاية. الحل: تحويلها إلى SECURITY DEFINER + search_path ثابت.
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_hospital_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hospital_id FROM user_hospital_links WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$;

-- منح صلاحية التنفيذ لدور authenticated (وكذلك anon للاحتياط)
GRANT EXECUTE ON FUNCTION get_user_hospital_ids() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_current_user_role() TO authenticated, anon;
