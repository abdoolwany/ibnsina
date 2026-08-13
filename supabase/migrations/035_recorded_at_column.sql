-- ============================================================
-- الترحيل 35: عمود "تاريخ القيد" (recorded_at) — تاريخ آخر إدخال فعلي لبيانات الطفل
--
--  القاعدة الجديدة (حسب قرار المستخدم):
--  - تاريخ القيد يبدأ مساويًا لتاريخ الإدخال الأصلي (created_at).
--  - أي تعديل فعلي في بيانات الطفل (قبل التوثيق أو بعد فك التوثيق)
--    يحدّث تاريخ القيد إلى لحظة التعديل — أي أن العمود يعكس آخر مرة
--    حُفظت فيها بيانات الطفل من حساب المُدخل/الموثّق.
--  - عمليات التوثيق/فك التوثيق/تسجيل الميكنة لا تمسّ تاريخ القيد لأنها
--    ليست تعديلًا في بيانات الطفل (لا تُغيّر أي حقل بيانات).
--
--  تُستخدم recorded_at في: عمود «تاريخ القيد» بالتقارير، تصدير Excel/PDF،
--  وفلتر «تاريخ الإدخال الفعلي» (بحث search_child_records) للاتساق التام
--  بين العمود المعروض وفلتر الفترة.
-- ============================================================

-- 1) إضافة العمود مع تعبئة السجلات القديمة من created_at ثم منع الفراغ
ALTER TABLE child_vaccination_records
  ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

UPDATE child_vaccination_records SET recorded_at = created_at WHERE recorded_at IS NULL;

ALTER TABLE child_vaccination_records
  ALTER COLUMN recorded_at SET NOT NULL,
  ALTER COLUMN recorded_at SET DEFAULT now();

-- 2) Trigger: تحديث تاريخ القيد فقط عند تعديل فعلي في بيانات الطفل.
--    نقارن كل حقول البيانات (وليس حقول التوثيق/الميكنة/النظام) بـ IS DISTINCT FROM
--    لتغطية التغييرات إلى NULL أيضًا. العمليات النظامية (توثيق، فك، ميكنة، أرقام
--    مسلسلة، updated_at) لا تُمرَّر ولا تُغيّر تاريخ القيد.
CREATE OR REPLACE FUNCTION update_recorded_at_on_data_edit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.child_full_name IS DISTINCT FROM OLD.child_full_name
     OR NEW.child_gender IS DISTINCT FROM OLD.child_gender
     OR NEW.birth_date IS DISTINCT FROM OLD.birth_date
     OR NEW.child_nationality IS DISTINCT FROM OLD.child_nationality
     OR NEW.father_first_name IS DISTINCT FROM OLD.father_first_name
     OR NEW.father_grandfather_name IS DISTINCT FROM OLD.father_grandfather_name
     OR NEW.father_great_grandfather_name IS DISTINCT FROM OLD.father_great_grandfather_name
     OR NEW.father_national_id IS DISTINCT FROM OLD.father_national_id
     OR NEW.father_passport_number IS DISTINCT FROM OLD.father_passport_number
     OR NEW.father_phone_number IS DISTINCT FROM OLD.father_phone_number
     OR NEW.father_id_image_key IS DISTINCT FROM OLD.father_id_image_key
     OR NEW.mother_first_name IS DISTINCT FROM OLD.mother_first_name
     OR NEW.mother_grandfather_name IS DISTINCT FROM OLD.mother_grandfather_name
     OR NEW.mother_great_grandfather_name IS DISTINCT FROM OLD.mother_great_grandfather_name
     OR NEW.mother_national_id IS DISTINCT FROM OLD.mother_national_id
     OR NEW.mother_passport_number IS DISTINCT FROM OLD.mother_passport_number
     OR NEW.mother_phone_number IS DISTINCT FROM OLD.mother_phone_number
     OR NEW.mother_id_image_key IS DISTINCT FROM OLD.mother_id_image_key
     OR NEW.vaccination_date IS DISTINCT FROM OLD.vaccination_date
     OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.vaccinator_id IS DISTINCT FROM OLD.vaccinator_id
  THEN
    -- تعديل فعلي في بيانات الطفل → تحديث تاريخ القيد إلى لحظة الحفظ
    NEW.recorded_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_recorded_at ON child_vaccination_records;
CREATE TRIGGER trigger_update_recorded_at
  BEFORE UPDATE ON child_vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION update_recorded_at_on_data_edit();

-- 3) تحديث دالة البحث: فلتر «تاريخ الإدخال الفعلي» يعتمد recorded_at بدلًا من
--    created_at ليُطابق عمود «تاريخ القيد» المعروض، مع إعادة recorded_at في
--    النتيجة. لا يمكن تغيير شكل ناتج دالة قائمة عبر CREATE OR REPLACE
--    (code 42P13) لذا نُسقط الدالة أولًا ثم نعيد إنشاءها بنفس التوقيع.
DROP FUNCTION IF EXISTS search_child_records(
  date, date, timestamptz, timestamptz, date, date, uuid, text, uuid, uuid,
  text, text, text, text, text, text, text, text, text, text, text, text, integer
);

CREATE OR REPLACE FUNCTION search_child_records(
  p_birth_from date DEFAULT NULL,
  p_birth_to date DEFAULT NULL,
  p_created_from timestamptz DEFAULT NULL,
  p_created_to timestamptz DEFAULT NULL,
  p_vaccination_from date DEFAULT NULL,
  p_vaccination_to date DEFAULT NULL,
  p_hospital_id uuid DEFAULT NULL,
  p_nationality text DEFAULT NULL,
  p_vaccinator_id uuid DEFAULT NULL,
  p_entered_by uuid DEFAULT NULL,
  p_child_name text DEFAULT NULL,
  p_father_name text DEFAULT NULL,
  p_father_grandfather text DEFAULT NULL,
  p_mother_name text DEFAULT NULL,
  p_mother_grandfather text DEFAULT NULL,
  p_father_national_id text DEFAULT NULL,
  p_mother_national_id text DEFAULT NULL,
  p_father_passport text DEFAULT NULL,
  p_mother_passport text DEFAULT NULL,
  p_father_phone text DEFAULT NULL,
  p_mother_phone text DEFAULT NULL,
  p_batch_number text DEFAULT NULL,
  p_serial_number integer DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  hospital_id uuid,
  child_full_name text,
  child_gender text,
  birth_date date,
  child_nationality text,
  father_first_name text,
  father_grandfather_name text,
  father_national_id text,
  father_passport_number text,
  father_phone_number text,
  mother_first_name text,
  mother_grandfather_name text,
  mother_national_id text,
  mother_passport_number text,
  mother_phone_number text,
  vaccination_date date,
  batch_id uuid,
  vaccinator_id uuid,
  entered_by uuid,
  is_verified boolean,
  verified_at timestamptz,
  created_at timestamptz,
  recorded_at timestamptz,
  serial_number integer,
  serial_month integer,
  serial_year integer,
  hospital_name text,
  vaccinator_name text,
  entered_by_name text,
  batch_number text,
  batch_delivery_date date,
  batch_expiry_date date,
  ministry_registered boolean,
  ministry_registered_at timestamptz,
  request_status text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.hospital_id,
    c.child_full_name,
    c.child_gender::text,
    c.birth_date,
    c.child_nationality,
    c.father_first_name,
    c.father_grandfather_name,
    c.father_national_id,
    c.father_passport_number,
    c.father_phone_number,
    c.mother_first_name,
    c.mother_grandfather_name,
    c.mother_national_id,
    c.mother_passport_number,
    c.mother_phone_number,
    c.vaccination_date,
    c.batch_id,
    c.vaccinator_id,
    c.entered_by,
    c.is_verified,
    c.verified_at,
    c.created_at,
    c.recorded_at,
    c.serial_number,
    c.serial_month,
    c.serial_year,
    h.name,
    v.full_name,
    u.full_name,
    vb.batch_number,
    vb.delivery_date,
    vb.expiry_date,
    c.ministry_registered,
    c.ministry_registered_at,
    (
      SELECT ur.status FROM unverify_requests ur
      WHERE ur.record_id = c.id
      ORDER BY ur.requested_at DESC
      LIMIT 1
    )
  FROM child_vaccination_records c
  LEFT JOIN hospitals h ON h.id = c.hospital_id
  LEFT JOIN vaccinators v ON v.id = c.vaccinator_id
  LEFT JOIN vaccine_batches vb ON vb.id = c.batch_id
  LEFT JOIN user_profiles u ON u.id = c.entered_by
  WHERE c.is_deleted = false
    AND (p_hospital_id IS NULL OR c.hospital_id = p_hospital_id)
    AND (p_birth_from IS NULL OR c.birth_date >= p_birth_from)
    AND (p_birth_to IS NULL OR c.birth_date <= p_birth_to)
    AND (p_created_from IS NULL OR c.recorded_at >= p_created_from)
    AND (p_created_to IS NULL OR c.recorded_at < p_created_to)
    AND (p_vaccination_from IS NULL OR c.vaccination_date >= p_vaccination_from)
    AND (p_vaccination_to IS NULL OR c.vaccination_date <= p_vaccination_to)
    AND (p_serial_number IS NULL OR c.serial_number = p_serial_number)
    AND (
      p_nationality IS NULL OR p_nationality = ''
      OR (
        p_nationality = '__NON_EGYPTIAN__'
        AND COALESCE(normalize_arabic(c.child_nationality), '') NOT LIKE 'مصر%'
      )
      OR normalize_arabic(c.child_nationality) LIKE normalize_arabic(p_nationality) || '%'
    )
    AND (p_vaccinator_id IS NULL OR c.vaccinator_id = p_vaccinator_id)
    AND (p_entered_by IS NULL OR c.entered_by = p_entered_by)
    AND (p_child_name IS NULL OR normalize_arabic(c.child_full_name) LIKE '%' || normalize_arabic(p_child_name) || '%')
    AND (p_father_name IS NULL OR normalize_arabic(c.father_first_name) LIKE '%' || normalize_arabic(p_father_name) || '%')
    AND (p_father_grandfather IS NULL OR normalize_arabic(c.father_grandfather_name) LIKE '%' || normalize_arabic(p_father_grandfather) || '%')
    AND (p_mother_name IS NULL OR normalize_arabic(c.mother_first_name) LIKE '%' || normalize_arabic(p_mother_name) || '%')
    AND (p_mother_grandfather IS NULL OR normalize_arabic(c.mother_grandfather_name) LIKE '%' || normalize_arabic(p_mother_grandfather) || '%')
    AND (p_father_national_id IS NULL OR c.father_national_id LIKE '%' || p_father_national_id || '%')
    AND (p_mother_national_id IS NULL OR c.mother_national_id LIKE '%' || p_mother_national_id || '%')
    AND (p_father_passport IS NULL OR c.father_passport_number LIKE '%' || p_father_passport || '%')
    AND (p_mother_passport IS NULL OR c.mother_passport_number LIKE '%' || p_mother_passport || '%')
    AND (p_father_phone IS NULL OR c.father_phone_number LIKE '%' || p_father_phone || '%')
    AND (p_mother_phone IS NULL OR c.mother_phone_number LIKE '%' || p_mother_phone || '%')
    AND (p_batch_number IS NULL OR normalize_arabic(vb.batch_number) LIKE '%' || normalize_arabic(p_batch_number) || '%')
  ORDER BY c.vaccination_date DESC, c.recorded_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION search_child_records(
  date, date, timestamptz, timestamptz, date, date, uuid, text, uuid, uuid,
  text, text, text, text, text, text, text, text, text, text, text, text, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION search_child_records(
  date, date, timestamptz, timestamptz, date, date, uuid, text, uuid, uuid,
  text, text, text, text, text, text, text, text, text, text, text, text, integer
) TO authenticated;

-- التحقق: يجب أن تبقى دالة search_child_records واحدة فقط بالاسم
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'search_child_records') <> 1 THEN
    RAISE EXCEPTION 'يجب أن توجد دالة search_child_records واحدة فقط بعد الترحيل';
  END IF;
END;
$$;
