-- ============================================================
-- الترحيل 17:
-- 1) صلاحية moh_level1 تعديل/حذف الدفعات التي أرسلها للمستشفيات المرتبطة
--    بشرط ألا تكون أي جرعة منها قد استُخدمت إطلاقًا (سجل حي أو مؤرشف).
--    (من يحذف جرعة طفل غير موثق تعود الجرعة للرصيد، فيصبح التعديل متاحًا)
-- 2) تسجيل عمليات الدفعات (إدراج/تعديل/حذف) في audit_log
-- 3) منع التواريخ غير المنطقية في سجلات الأطفال (ثغرة التواريخ المستقبلية)
--    بتوقيت القاهرة (Africa/Cairo)
-- ============================================================

-- ============================================================
-- 1) سياسات RLS: تعديل وحذف الدفعات من moh_level1
--    الشرط: الدفعة ضمن مستشفيات المستخدم + لم يُطعّم منها أي طفل (حي أو مؤرشف)
-- ============================================================
CREATE POLICY "moh_level1_update_batches" ON vaccine_batches
  FOR UPDATE USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'moh_level1'
    AND NOT EXISTS (
      SELECT 1 FROM child_vaccination_records c
      WHERE c.batch_id = vaccine_batches.id AND c.is_deleted = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM deleted_child_vaccination_records d
      WHERE d.batch_id = vaccine_batches.id
    )
  );

CREATE POLICY "moh_level1_delete_batches" ON vaccine_batches
  FOR DELETE USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'moh_level1'
    AND NOT EXISTS (
      SELECT 1 FROM child_vaccination_records c
      WHERE c.batch_id = vaccine_batches.id AND c.is_deleted = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM deleted_child_vaccination_records d
      WHERE d.batch_id = vaccine_batches.id
    )
  );

-- ============================================================
-- 2) تسجيل عمليات الدفعات في audit_log
-- ============================================================
CREATE OR REPLACE FUNCTION log_batch_insert_to_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, performed_by, new_value)
  VALUES (TG_TABLE_NAME, NEW.id, 'insert', COALESCE(auth.uid(), NEW.created_by), row_to_json(NEW)::jsonb);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_batch_insert_to_audit ON vaccine_batches;
CREATE TRIGGER trigger_log_batch_insert_to_audit
  AFTER INSERT ON vaccine_batches
  FOR EACH ROW EXECUTE FUNCTION log_batch_insert_to_audit();

CREATE OR REPLACE FUNCTION log_batch_update_to_audit()
RETURNS TRIGGER AS $$
BEGIN
  -- تسجيل التعديل من قبل المستخدمين العاديين فقط (حذف service_role يُسجَّل يدويًا في route النظام)
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO audit_log (table_name, record_id, action, performed_by, old_value, new_value)
    VALUES (TG_TABLE_NAME, NEW.id, 'update', auth.uid(), row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_batch_update_to_audit ON vaccine_batches;
CREATE TRIGGER trigger_log_batch_update_to_audit
  AFTER UPDATE ON vaccine_batches
  FOR EACH ROW EXECUTE FUNCTION log_batch_update_to_audit();

CREATE OR REPLACE FUNCTION log_batch_delete_to_audit()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO audit_log (table_name, record_id, action, performed_by, old_value)
    VALUES (TG_TABLE_NAME, OLD.id, 'delete_attempt', auth.uid(), row_to_json(OLD)::jsonb);
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_batch_delete_to_audit ON vaccine_batches;
CREATE TRIGGER trigger_log_batch_delete_to_audit
  AFTER DELETE ON vaccine_batches
  FOR EACH ROW EXECUTE FUNCTION log_batch_delete_to_audit();

-- ============================================================
-- 3) منع التواريخ غير المنطقية في سجلات الأطفال
--    (تاريخ ميلاد/تطعيم مستقبلي، تطعيم قبل الميلاد، تطعيم قبل دخول الدفعة)
-- ============================================================
CREATE OR REPLACE FUNCTION validate_child_dates()
RETURNS TRIGGER AS $$
DECLARE
  cairo_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo')::date;
  batch_delivery DATE;
BEGIN
  IF NEW.birth_date > cairo_today THEN
    RAISE EXCEPTION 'تاريخ ميلاد الطفل (%) لا يمكن أن يكون بعد اليوم (%)', NEW.birth_date, cairo_today;
  END IF;
  IF NEW.vaccination_date > cairo_today THEN
    RAISE EXCEPTION 'تاريخ التطعيم (%) لا يمكن أن يكون بعد اليوم (%)', NEW.vaccination_date, cairo_today;
  END IF;
  IF NEW.vaccination_date < NEW.birth_date THEN
    RAISE EXCEPTION 'تاريخ التطعيم (%) لا يمكن أن يسبق تاريخ ميلاد الطفل (%)', NEW.vaccination_date, NEW.birth_date;
  END IF;
  SELECT delivery_date INTO batch_delivery FROM vaccine_batches WHERE id = NEW.batch_id;
  IF batch_delivery IS NOT NULL AND NEW.vaccination_date < batch_delivery THEN
    RAISE EXCEPTION 'تاريخ التطعيم (%) لا يمكن أن يسبق تاريخ دخول الدفعة (%)', NEW.vaccination_date, batch_delivery;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_child_dates ON child_vaccination_records;
CREATE TRIGGER trigger_validate_child_dates
  BEFORE INSERT OR UPDATE ON child_vaccination_records
  FOR EACH ROW EXECUTE FUNCTION validate_child_dates();
