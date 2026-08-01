-- ============================================================
-- الترحيل 16: حذف سجل طفل غير موثق من قبل المستشفى (مدخل أو موثق)
-- مع إرجاع جرعته إلى رصيد الدفعة.
--
-- المنطق: الحذف هنا حذف فعلي (hard delete) بدون أرشفة، فينخفض
-- used_quantity في batch_balance_view تلقائيًا (used = live + archived)
-- وتعود الجرعة إلى الرصيد المتاح للدفعة.
-- يمنع الحذف نهائيًا للسجلات الموثقة: عبر RLS + BEFORE DELETE trigger
-- (دفاع ثانٍ يشبه trigger منع التعديل بعد التوثيق في الترحيل 1).
-- service_role (تنظيف system_operator) مستثنى لأن له صلاحية إدارية.
-- ============================================================

-- 1) مشغّل منع حذف سجل موثق (للمستخدمين العاديين فقط)
CREATE OR REPLACE FUNCTION prevent_delete_verified()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_verified = true AND auth.uid() IS NOT NULL THEN
    -- نمنع حذف الموثق هنا كدفاع ثانٍ بعد RLS حسب القسم 3 من المواصفات
    RAISE EXCEPTION 'لا يمكن حذف سجل تم توثيقه مسبقا. معرف السجل: %', OLD.id
      USING HINT = 'التوثيق عملية لا رجعة فيها من واجهة المستخدم العادية';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_delete_verified ON child_vaccination_records;
CREATE TRIGGER trigger_prevent_delete_verified
  BEFORE DELETE ON child_vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION prevent_delete_verified();

-- 2) تسجيل الحذف في audit_log (للمستخدمين العاديين فقط)
--    (حذف service_role يسجّل نفسه يدويًا في route النظام، لذا نستثنيه لتفادي التكرار)
CREATE OR REPLACE FUNCTION log_delete_to_audit()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO audit_log (table_name, record_id, action, performed_by, old_value)
    VALUES (TG_TABLE_NAME, OLD.id, 'delete_attempt', auth.uid(), row_to_json(OLD)::jsonb);
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_delete_to_audit ON child_vaccination_records;
CREATE TRIGGER trigger_log_delete_to_audit
  AFTER DELETE ON child_vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION log_delete_to_audit();

-- 3) سياسة RLS: hospital_entry و hospital_verifier يحذفان سجلات مستشفاهما غير الموثقة فقط
CREATE POLICY "hospital_delete_unverified_records" ON child_vaccination_records
  FOR DELETE USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() IN ('hospital_entry', 'hospital_verifier')
    AND is_verified = false
  );
