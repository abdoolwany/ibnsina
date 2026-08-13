-- ============================================================
-- الترحيل 34: التراجع الكامل عن "إدارة الأرقام المسلسلة" (الترحيل 33)
--  حسب قرار المستخدم: التعامل العملي السابق أفضل، فيكون:
--  1) حذف سجل الطفل = اختفاء الرقم المسلسل نهائيًا (العداد لا يتقدم
--     للوراء أبدًا، ولا توجد أي إعادة فتح للأرقام المحذوفة).
--  2) تعديل بيانات الطفل (من المُدخل أو الموثّق) قبل التوثيق أو بعد
--     فتحه يحتفظ بنفس الرقم المسلسل — وهو السلوك الأصلي منذ 031/030.
--  يُحذف هنا: حمّامة الأرقام المعاد فتحها، دالة الإدارة SECURITY DEFINER،
--  فهرس التفرد، سياسة قراءة العدادات، واستثناء GUC من Trigger المنع.
-- ============================================================

-- 1) حذف دالة الإدارة (الكتابة الوحيدة على الأرقام كانت تمر بها)
DROP FUNCTION IF EXISTS admin_manage_serial_number(text, uuid, integer, integer, integer, uuid, text);

-- 2) حذف جدول الأرقام المعاد فتحها (يحذف معه سياساته وقيد UNIQUE)
DROP TABLE IF EXISTS child_serial_releases;

-- 3) حذف سياسة قراءة العدادات الخاصة بالمشرف (كانت لدالة GET للواجهة)
DROP POLICY IF EXISTS moh_admin_read_serial_counters ON child_serial_counters;

-- 4) حذف فهرس التفرد (العداد وحده يضمن التفرد: ON CONFLICT ... DO UPDATE
--    يقفل صف العداد أثناء الزيادة فيمنع تكرار الأرقام المتزامن)
DROP INDEX IF EXISTS uq_child_serial_active;

-- 5) استعادة منح الرقم المسلسل بالعداد فقط: رقم سجل محذوف رقم مفقود
--    نهائيًا — لا يُعاد استخدامه أبدًا (سلوك الترحيل 31 الأصلي)
CREATE OR REPLACE FUNCTION assign_child_serial_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month integer;
  v_year integer;
  v_serial integer;
BEGIN
  -- الشهر/السنة حسب تاريخ التسجيل الفعلي بتوقيت القاهرة (مواصفة الرقم المسلسل)
  v_month := EXTRACT(MONTH FROM COALESCE(NEW.created_at, now()) AT TIME ZONE 'Africa/Cairo')::integer;
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()) AT TIME ZONE 'Africa/Cairo')::integer;

  INSERT INTO child_serial_counters (hospital_id, serial_month, serial_year)
  VALUES (NEW.hospital_id, v_month, v_year)
  ON CONFLICT (hospital_id, serial_month, serial_year)
  DO UPDATE SET last_number = child_serial_counters.last_number + 1
  RETURNING last_number INTO v_serial;

  NEW.serial_number := v_serial;
  NEW.serial_month := v_month;
  NEW.serial_year := v_year;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_assign_child_serial_number ON child_vaccination_records;
CREATE TRIGGER trigger_assign_child_serial_number
  BEFORE INSERT ON child_vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION assign_child_serial_number();

-- 6) استعادة منع التعديل بعد التوثيق (نسخة الترحيل 30 — بدون استثناء
--    الأرقام المسلسلة الذي أُضيف في 33)
DROP TRIGGER IF EXISTS trigger_prevent_update_after_verification ON child_vaccination_records;
DROP FUNCTION IF EXISTS prevent_update_after_verification();

CREATE OR REPLACE FUNCTION prevent_update_after_verification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_verified = true THEN
    -- (أ) فك التوثيق: moh_admin أو moh_level1 المرتبط بمستشفى السجل.
    --     يُسمح فقط بتغيير حقول التوثيق والميكنة (التي تُصفَّر إجباريًا)؛
    --     أي تغيير آخر في نفس العملية يُرفض من قاعدة البيانات مباشرة.
    IF NEW.is_verified = false
       AND (
         EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'moh_admin')
         OR (
           EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'moh_level1')
           AND OLD.hospital_id IN (SELECT get_user_hospital_ids())
         )
       )
       AND NEW.hospital_id = OLD.hospital_id
       AND NEW.child_full_name = OLD.child_full_name
       AND NEW.child_gender = OLD.child_gender
       AND NEW.birth_date = OLD.birth_date
       AND NEW.child_nationality = OLD.child_nationality
       AND NEW.father_first_name = OLD.father_first_name
       AND NEW.father_grandfather_name = OLD.father_grandfather_name
       AND NEW.father_great_grandfather_name IS NOT DISTINCT FROM OLD.father_great_grandfather_name
       AND NEW.father_national_id = OLD.father_national_id
       AND NEW.father_passport_number IS NOT DISTINCT FROM OLD.father_passport_number
       AND NEW.father_phone_number IS NOT DISTINCT FROM OLD.father_phone_number
       AND NEW.father_id_image_key IS NOT DISTINCT FROM OLD.father_id_image_key
       AND NEW.mother_first_name = OLD.mother_first_name
       AND NEW.mother_grandfather_name = OLD.mother_grandfather_name
       AND NEW.mother_great_grandfather_name IS NOT DISTINCT FROM OLD.mother_great_grandfather_name
       AND NEW.mother_national_id IS NOT DISTINCT FROM OLD.mother_national_id
       AND NEW.mother_passport_number IS NOT DISTINCT FROM OLD.mother_passport_number
       AND NEW.mother_phone_number IS NOT DISTINCT FROM OLD.mother_phone_number
       AND NEW.mother_id_image_key IS NOT DISTINCT FROM OLD.mother_id_image_key
       AND NEW.vaccination_date = OLD.vaccination_date
       AND NEW.batch_id = OLD.batch_id
       AND NEW.vaccinator_id = OLD.vaccinator_id
       AND NEW.entered_by = OLD.entered_by
       AND NEW.is_deleted IS NOT DISTINCT FROM OLD.is_deleted
    THEN
      NEW.verified_by := NULL;
      NEW.verified_at := NULL;
      NEW.ministry_registered := false;
      NEW.ministry_registered_by := NULL;
      NEW.ministry_registered_at := NULL;
      RETURN NEW;
    END IF;

    -- (ب) تسجيل/إلغاء تسجيل الميكنة — فقط moh_level1 المرتبط بالمستشفى،
    --     فقط تغيير حقول الميكنة، مع اتساق الحقول الثلاثة معًا
    IF NEW.is_verified = true
       AND NEW.hospital_id = OLD.hospital_id
       AND EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'moh_level1')
       AND OLD.hospital_id IN (SELECT get_user_hospital_ids())
       AND NEW.child_full_name = OLD.child_full_name
       AND NEW.child_gender = OLD.child_gender
       AND NEW.birth_date = OLD.birth_date
       AND NEW.child_nationality = OLD.child_nationality
       AND NEW.father_first_name = OLD.father_first_name
       AND NEW.father_grandfather_name = OLD.father_grandfather_name
       AND NEW.father_great_grandfather_name IS NOT DISTINCT FROM OLD.father_great_grandfather_name
       AND NEW.father_national_id = OLD.father_national_id
       AND NEW.father_passport_number IS NOT DISTINCT FROM OLD.father_passport_number
       AND NEW.father_phone_number IS NOT DISTINCT FROM OLD.father_phone_number
       AND NEW.father_id_image_key IS NOT DISTINCT FROM OLD.father_id_image_key
       AND NEW.mother_first_name = OLD.mother_first_name
       AND NEW.mother_grandfather_name = OLD.mother_grandfather_name
       AND NEW.mother_great_grandfather_name IS NOT DISTINCT FROM OLD.mother_great_grandfather_name
       AND NEW.mother_national_id IS NOT DISTINCT FROM OLD.mother_national_id
       AND NEW.mother_passport_number IS NOT DISTINCT FROM OLD.mother_passport_number
       AND NEW.mother_phone_number IS NOT DISTINCT FROM OLD.mother_phone_number
       AND NEW.mother_id_image_key IS NOT DISTINCT FROM OLD.mother_id_image_key
       AND NEW.vaccination_date = OLD.vaccination_date
       AND NEW.batch_id = OLD.batch_id
       AND NEW.vaccinator_id = OLD.vaccinator_id
       AND NEW.entered_by = OLD.entered_by
       AND NEW.verified_by IS NOT DISTINCT FROM OLD.verified_by
       AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at
       AND NEW.is_deleted IS NOT DISTINCT FROM OLD.is_deleted
       AND (
         (NEW.ministry_registered = true
          AND NEW.ministry_registered_by IS NOT NULL
          AND NEW.ministry_registered_at IS NOT NULL)
         OR (NEW.ministry_registered = false
             AND NEW.ministry_registered_by IS NULL
             AND NEW.ministry_registered_at IS NULL)
       )
    THEN
      IF NEW.ministry_registered = true THEN
        NEW.ministry_registered_by := auth.uid();
      END IF;
      RETURN NEW;
    END IF;

    -- نتحقق من is_verified هنا لمنع التعديل بعد التوثيق حسب القسم 3 من المواصفات
    RAISE EXCEPTION 'لا يمكن تعديل سجل تم توثيقه مسبقا. معرف السجل: %', OLD.id
      USING HINT = 'يتم فك التوثيق فقط من حساب الوزارة (moh_level1 أو moh_admin)، وتسجيل الميكنة من moh_level1 المرتبط فقط';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_update_after_verification
  BEFORE UPDATE ON child_vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION prevent_update_after_verification();

-- 7) استعادة إسناد سجل التدقيق الأصلي (الترحيل 1): يُنسب التحديث لمن
--    وثّق/أدخل السجل بدلًا من المُنفذ الفعلي — لإزالة تغيير 33 تمامًا
CREATE OR REPLACE FUNCTION log_update_to_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, performed_by, old_value, new_value)
  VALUES (
    TG_TABLE_NAME,
    NEW.id,
    CASE
      WHEN OLD.is_verified = false AND NEW.is_verified = true THEN 'verify'
      ELSE 'update'
    END,
    COALESCE(NEW.verified_by, NEW.entered_by),
    row_to_json(OLD)::jsonb,
    row_to_json(NEW)::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
