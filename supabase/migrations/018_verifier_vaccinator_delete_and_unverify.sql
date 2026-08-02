-- ============================================================
-- الترحيل 18:
--  1) حذف القائم بالتطعيم من موثّق المستشفى (بشرط ألا يكون مطعّمًا سابقًا)
--  2) فك التوثيق (إعادة فتح مرحلة ما قبل التوثيق) من moh_level1 أو moh_admin
--  3) إعادة تسمية رسالة "تاريخ دخول الدفعة" إلى "تاريخ دخول الطلبية"
-- ============================================================

-- 1) سياسة حذف القائمين بالتطعيم للموثّق:
--    فقط ضمن مستشفاه، وبشرط ألا توجد أي سجلات أطفال حية مطعّمة باسمه.
--    لو وُجدت سجلات، يتعامل معها العميل بالإيقاف (is_active=false) دون حذف.
CREATE POLICY "verifier_delete_vaccinators" ON vaccinators
  FOR DELETE USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'hospital_verifier'
    AND NOT EXISTS (
      SELECT 1 FROM child_vaccination_records cvr
      WHERE cvr.vaccinator_id = vaccinators.id AND cvr.is_deleted = false
    )
  );

-- 2) توسيع قيود action في audit_log لإضافة 'unverify'
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN ('insert', 'update', 'verify', 'delete_attempt', 'unverify'));

-- 3) تحديث trigger منع التعديل بعد التوثيق:
--    يسمح بفك التوثيق فقط عندما يكون الفاعل moh_admin (لكل النظام) أو
--    moh_level1 مرتبطًا بمستشفى السجل، مع تصفير حقول التوثيق إلزاميًا.
CREATE OR REPLACE FUNCTION prevent_update_after_verification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_verified = true THEN
    IF NEW.is_verified = false
       AND (
         EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'moh_admin')
         OR (
           EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'moh_level1')
           AND OLD.hospital_id IN (SELECT get_user_hospital_ids())
         )
       )
    THEN
      NEW.verified_by := NULL;
      NEW.verified_at := NULL;
      RETURN NEW;
    END IF;
    -- نتحقق من is_verified هنا لمنع التعديل بعد التوثيق حسب القسم 3 من المواصفات
    RAISE EXCEPTION 'لا يمكن تعديل سجل تم توثيقه مسبقا. معرف السجل: %', OLD.id
      USING HINT = 'يتم فك التوثيق فقط من حساب الوزارة (moh_level1 أو moh_admin)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4) تحديث trigger تسجيل التحديثات:
--    تسجيل action='unverify' عند فك التوثيق، وتسجيل الفاعل الحقيقي (auth.uid())
CREATE OR REPLACE FUNCTION log_update_to_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, performed_by, old_value, new_value)
  VALUES (
    TG_TABLE_NAME,
    NEW.id,
    CASE
      WHEN OLD.is_verified = false AND NEW.is_verified = true THEN 'verify'
      WHEN OLD.is_verified = true AND NEW.is_verified = false THEN 'unverify'
      ELSE 'update'
    END,
    COALESCE(auth.uid(), NEW.entered_by),
    row_to_json(OLD)::jsonb,
    row_to_json(NEW)::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5) سياسات RLS لفك التوثيق:
--    moh_level1: فقط سجلات المستشفيات المرتبطة، فقط الموثّقة حاليًا،
--                والنتيجة يجب أن تكون غير موثّقة بحقول توثيق فارغة.
CREATE POLICY "moh_level1_unverify_records" ON child_vaccination_records
  FOR UPDATE USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'moh_level1'
    AND is_verified = true
  )
  WITH CHECK (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'moh_level1'
    AND is_verified = false
    AND verified_by IS NULL
    AND verified_at IS NULL
  );

--    moh_admin: لكل النظام، نفس الشروط (يبقى قراءة فقط فيما عدا فك التوثيق)
CREATE POLICY "admin_unverify_records" ON child_vaccination_records
  FOR UPDATE USING (
    get_current_user_role() = 'moh_admin'
    AND is_verified = true
  )
  WITH CHECK (
    get_current_user_role() = 'moh_admin'
    AND is_verified = false
    AND verified_by IS NULL
    AND verified_at IS NULL
  );

-- 6) إعادة إنشاء validate_child_dates برسالة "تاريخ دخول الطلبية" الموحّدة
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
    RAISE EXCEPTION 'تاريخ التطعيم (%) لا يمكن أن يسبق تاريخ دخول الطلبية (%)', NEW.vaccination_date, batch_delivery;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_child_dates ON child_vaccination_records;
CREATE TRIGGER trigger_validate_child_dates
  BEFORE INSERT OR UPDATE ON child_vaccination_records
  FOR EACH ROW EXECUTE FUNCTION validate_child_dates();
