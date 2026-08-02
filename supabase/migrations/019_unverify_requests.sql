-- ============================================================
-- الترحيل 19: طلبات إعادة فتح التوثيق (Unverify Requests)
--  1) جدول unverify_requests: يُنشئ موثّق المستشفى طلبًا لإعادة فتح
--     سجل موثّق، ويستعرضه المستوى الأول/الإدارة العليا ويعتمدونه أو يرفضونه.
--  2) منع تكرار طلب معلّق لنفس سجل الطفل.
--  3) RLS: الإدراج من الموثّق لمستشفاه فقط، والعرض/الحسم من الوزارة.
--  4) ربط بالأدوار المعتمدة عبر RPC حلّ الطلب (يستدعيها فك التوثيق الفعلي).
--  5) تسجيل إنشاء الطلبات وحسمها في audit_log.
-- ============================================================

-- 1) جدول طلبات إعادة فتح التوثيق
CREATE TABLE IF NOT EXISTS unverify_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES child_vaccination_records(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  resolved_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE unverify_requests ENABLE ROW LEVEL SECURITY;

-- منع تكرار طلب معلّق لنفس سجل الطفل (يمكن إعادة الطلب بعد الحسم فقط)
CREATE UNIQUE INDEX IF NOT EXISTS unverify_requests_one_pending_per_record
  ON unverify_requests (record_id)
  WHERE status = 'pending';

-- 2) إتاحة قراءة الحد الأدنى من الملفات (id, full_name) للأدوار التي تحتاج
--    أسماء الطالبين في لوحاتها، دون كشف بقية بيانات الملفات الشخصية.
DROP POLICY IF EXISTS "hospital_roles_read_minimal_profiles" ON user_profiles;
CREATE POLICY "hospital_roles_read_minimal_profiles" ON user_profiles
  FOR SELECT USING (
    get_current_user_role() IN ('hospital_entry', 'hospital_verifier', 'moh_level1')
  );

-- 3) توسيع قيود action في audit_log لإضافة أنواع الأحداث الجديدة
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN ('insert', 'update', 'verify', 'delete_attempt', 'unverify', 'request_create', 'request_resolve'));

-- 4) سياسات RLS لجدول unverify_requests
--    الموثّق: يقرأ ويطلب فقط، لمستشفاه، وعلى سجلات موثّقة فعليًا.
DROP POLICY IF EXISTS "verifier_select_unverify_requests" ON unverify_requests;
CREATE POLICY "verifier_select_unverify_requests" ON unverify_requests
  FOR SELECT USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'hospital_verifier'
  );

DROP POLICY IF EXISTS "verifier_insert_unverify_requests" ON unverify_requests;
CREATE POLICY "verifier_insert_unverify_requests" ON unverify_requests
  FOR INSERT WITH CHECK (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'hospital_verifier'
    AND EXISTS (
      SELECT 1 FROM child_vaccination_records cvr
      WHERE cvr.id = record_id AND cvr.is_verified = true AND cvr.is_deleted = false
    )
  );

--    moh_level1: يقرأ طلبات مستشفياته المعلّقة فقط (قبل الحسم)
DROP POLICY IF EXISTS "level1_select_pending_unverify_requests" ON unverify_requests;
CREATE POLICY "level1_select_pending_unverify_requests" ON unverify_requests
  FOR SELECT USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'moh_level1'
    AND status = 'pending'
  );

--    moh_admin: يقرأ كل الطلبات المعلّقة (قراءة فقط، الحسم عبر RPC)
DROP POLICY IF EXISTS "admin_select_pending_unverify_requests" ON unverify_requests;
CREATE POLICY "admin_select_pending_unverify_requests" ON unverify_requests
  FOR SELECT USING (
    get_current_user_role() = 'moh_admin'
    AND status = 'pending'
  );

--    منع التعديل المباشر للطلبات من الجميع (الحسم يتم حصريًا عبر RPC)
DROP POLICY IF EXISTS "no_direct_update_unverify_requests" ON unverify_requests;
CREATE POLICY "no_direct_update_unverify_requests" ON unverify_requests
  FOR UPDATE USING (false);

-- 5) تسجيل إنشاء الطلب في audit_log
CREATE OR REPLACE FUNCTION log_unverify_request_create()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, performed_by, new_value)
  VALUES (
    'unverify_requests',
    NEW.id,
    'request_create',
    COALESCE(auth.uid(), NEW.requested_by),
    jsonb_build_object('status', NEW.status, 'record_id', NEW.record_id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_unverify_request_create ON unverify_requests;
CREATE TRIGGER trigger_log_unverify_request_create
  AFTER INSERT ON unverify_requests
  FOR EACH ROW EXECUTE FUNCTION log_unverify_request_create();

-- 6) دالة RPC لحسم الطلب (اعتماد أو رفض) — لا يُكشف عنها لأي دور،
--    وتُستدعى من خادم Next.js بمفتاح الخدمة حصريًا.
--    عند الاعتماد: تنفّذ فك التوثيق الفعلي بالشروط نفسها التي يفرضها
--    trigger منع التعديل بعد التوثيق (moh_admin أو moh_level1 لمستشفى السجل).
CREATE OR REPLACE FUNCTION resolve_unverify_request(req_id UUID, decision TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role user_role;
  req_hospital_id UUID;
  req_record_id UUID;
  child_verified BOOLEAN;
  v_checked_actor_id UUID;
  v_actor_belongs BOOLEAN;
BEGIN
  -- الفاعل الحقيقي: هو المستخدم الذي يملك الجلسة، وليس استدعاء الخادم بمفتاح الخدمة
  SELECT COALESCE(auth.uid(), NULL) INTO v_checked_actor_id;
  IF v_checked_actor_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد مستخدم موثّق يمكن نسب الحسم إليه';
  END IF;

  SELECT role INTO actor_role FROM user_profiles WHERE id = v_checked_actor_id;
  IF actor_role IS NULL OR actor_role NOT IN ('moh_admin', 'moh_level1') THEN
    RAISE EXCEPTION 'غير مصرح: الحسم مسموح فقط للمستوى الأول أو الإدارة العليا';
  END IF;

  SELECT hospital_id, record_id INTO req_hospital_id, req_record_id
  FROM unverify_requests WHERE id = req_id AND status = 'pending';
  IF req_hospital_id IS NULL THEN
    RAISE EXCEPTION 'الطلب غير موجود أو لم يعد معلّقًا';
  END IF;

  IF actor_role = 'moh_level1' THEN
    SELECT EXISTS (
      SELECT 1 FROM user_hospital_links WHERE user_id = v_checked_actor_id AND hospital_id = req_hospital_id
    ) INTO v_actor_belongs;
    IF NOT v_actor_belongs THEN
      RAISE EXCEPTION 'غير مصرح: الطلب يخص مستشفى غير مرتبط بحسابك';
    END IF;
  END IF;

  IF decision = 'approve' THEN
    -- فك التوثيق الفعلي: يعود السجل غير موثّق بحقول توثيق فارغة
    SELECT is_verified INTO child_verified FROM child_vaccination_records WHERE id = req_record_id;
    IF child_verified IS NOT TRUE THEN
      UPDATE unverify_requests SET status = 'rejected', resolved_by = v_checked_actor_id, resolved_at = now()
      WHERE id = req_id;
      RETURN FALSE;
    END IF;

    UPDATE child_vaccination_records
    SET is_verified = false, verified_by = NULL, verified_at = NULL
    WHERE id = req_record_id;

    INSERT INTO audit_log (table_name, record_id, action, performed_by, old_value, new_value)
    VALUES (
      'child_vaccination_records',
      req_record_id,
      'unverify',
      v_checked_actor_id,
      jsonb_build_object('is_verified', true),
      jsonb_build_object('is_verified', false)
    );

    UPDATE unverify_requests SET status = 'approved', resolved_by = v_checked_actor_id, resolved_at = now()
    WHERE id = req_id;
  ELSIF decision = 'reject' THEN
    UPDATE unverify_requests SET status = 'rejected', resolved_by = v_checked_actor_id, resolved_at = now()
    WHERE id = req_id;
  ELSE
    RAISE EXCEPTION 'قرار غير معروف: يجب أن يكون approve أو reject';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION resolve_unverify_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_unverify_request(UUID, TEXT) TO authenticated;

-- 7) تسجيل حسم الطلب في audit_log
CREATE OR REPLACE FUNCTION log_unverify_request_resolve()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO audit_log (table_name, record_id, action, performed_by, old_value, new_value)
    VALUES (
      'unverify_requests',
      NEW.id,
      'request_resolve',
      COALESCE(NEW.resolved_by, auth.uid(), NEW.requested_by),
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_unverify_request_resolve ON unverify_requests;
CREATE TRIGGER trigger_log_unverify_request_resolve
  AFTER UPDATE ON unverify_requests
  FOR EACH ROW EXECUTE FUNCTION log_unverify_request_resolve();
