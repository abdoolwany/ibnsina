-- ============================================================
-- الترحيل 27: تسجيل الجرعات على ميكنة التطعيمات (moh_level1)
--  خطوة إضافية بعد التوثيق: يحتفظ moh_level1 "تم التسجيل على الميكنة"
--  لكل سجل موثّق، مع إمكانية التراجع. لا يستطيع moh_admin (قراءة فقط)
--  ولا مستشفى بأي دور تعديل هذه الحقول. القيد محمي على مستوى قاعدة
--  البيانات (Trigger + RLS) وليس فقط في الواجهة — القسم 3/8 من المواصفات.
--
--  الملخص:
--  1) أعمدة جديدة في child_vaccination_records:
--     ministry_registered + ministry_registered_by + ministry_registered_at
--  2) توسيع قيود action في audit_log لإضافة
--     ministry_register / ministry_unregister
--  3) تحديث prevent_update_after_verification: يسمح لـ moh_level1 المرتبط
--     بالمستشفى فقط بتغيير حقول الميكنة الثلاثة (لا غيرها) بعد التوثيق
--  4) سياسة RLS جديدة لتحديث حقول الميكنة من moh_level1
--  5) إعادة إنشاء search_child_records (نفس المعاملات + حقول الميكنة
--     في الناتج) و vaccinated_count_report (+ عدّادات مسجّل/غير مسجّل)
-- ============================================================

-- 1) الأعمدة الجديدة (مؤجلة القيم الصفرية حتى التسجيل الفعلي)
ALTER TABLE child_vaccination_records
  ADD COLUMN IF NOT EXISTS ministry_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ministry_registered_by uuid REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS ministry_registered_at timestamptz;

-- 2) توسيع قيود action في audit_log
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN (
    'insert', 'update', 'verify', 'delete_attempt', 'unverify',
    'request_create', 'request_resolve',
    'ministry_register', 'ministry_unregister'
  ));

-- 3) تحديث trigger منع التعديل بعد التوثيق:
--    (أ) فك التوثيق من moh_admin أو moh_level1 المرتبط (كما كان)
--    (ب) تسجيل/إلغاء تسجيل الميكنة: moh_level1 المرتبط بمستشفى السجل فقط،
--        وبشرط ألا تتغير أي حقول أخرى غير حقول الميكنة الثلاثة.
--        updated_at مستثنى من المقارنة لأنه يُحدَّث تلقائيًا بواسطة
--        trigger_update_updated_at. هذا يمنع أي تعديل غير مصرّح به حتى لو
--        استُدعي الـ API مباشرة متجاوزًا الواجهة (القسم 7 بند 3).
CREATE OR REPLACE FUNCTION prevent_update_after_verification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_verified = true THEN
    -- (أ) فك التوثيق (إعادة فتح مرحلة ما قبل التوثيق)
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
      RETURN NEW;
    END IF;

    -- نتحقق من is_verified هنا لمنع التعديل بعد التوثيق حسب القسم 3 من المواصفات
    RAISE EXCEPTION 'لا يمكن تعديل سجل تم توثيقه مسبقا. معرف السجل: %', OLD.id
      USING HINT = 'يتم فك التوثيق فقط من حساب الوزارة (moh_level1 أو moh_admin)، وتسجيل الميكنة من moh_level1 المرتبط فقط';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4) تسجيل الأحداث الجديدة في سجل التدقيق (مهم: تُسجَّل العمليات الحساسة إجباريًا)
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
      WHEN (OLD.ministry_registered IS DISTINCT FROM NEW.ministry_registered)
           AND NEW.ministry_registered = true THEN 'ministry_register'
      WHEN (OLD.ministry_registered IS DISTINCT FROM NEW.ministry_registered)
           AND NEW.ministry_registered = false THEN 'ministry_unregister'
      ELSE 'update'
    END,
    COALESCE(auth.uid(), NEW.entered_by),
    row_to_json(OLD)::jsonb,
    row_to_json(NEW)::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5) سياسة RLS: moh_level1 يحدّث حقول الميكنة فقط في سجلات مستشفياته المرتبطة
--    التي بقيت موثّقة. تُقيّد الأعمدة نفسها عبر trigger (بند 3) فوق هذه السياسة.
DROP POLICY IF EXISTS "moh_level1_ministry_register_records" ON child_vaccination_records;
CREATE POLICY "moh_level1_ministry_register_records" ON child_vaccination_records
  FOR UPDATE USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'moh_level1'
    AND is_verified = true
  )
  WITH CHECK (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'moh_level1'
    AND is_verified = true
  );

-- 6) إعادة إنشاء search_child_records بنفس قائمة المعاملات (22 معاملًا) —
--    الإخراج أضيف إليه حقلا الميكنة. DROP+CREATE ضروري لأن PostgreSQL لا
--    يسمح بتغيير RETURNS TABLE عبر CREATE OR REPLACE. الحفاظ على نفس
--    المعاملات يمنع تكرار مشكلة الغموض (300) التي حُلّت في الترحيل 25.
DROP FUNCTION IF EXISTS search_child_records(
  p_birth_from date,
  p_birth_to date,
  p_created_from timestamptz,
  p_created_to timestamptz,
  p_vaccination_from date,
  p_vaccination_to date,
  p_hospital_id uuid,
  p_nationality text,
  p_vaccinator_id uuid,
  p_entered_by uuid,
  p_child_name text,
  p_father_name text,
  p_father_grandfather text,
  p_mother_name text,
  p_mother_grandfather text,
  p_father_national_id text,
  p_mother_national_id text,
  p_father_passport text,
  p_mother_passport text,
  p_father_phone text,
  p_mother_phone text,
  p_batch_number text
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
  p_batch_number text DEFAULT NULL
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
    AND (p_created_from IS NULL OR c.created_at >= p_created_from)
    AND (p_created_to IS NULL OR c.created_at < p_created_to)
    AND (p_vaccination_from IS NULL OR c.vaccination_date >= p_vaccination_from)
    AND (p_vaccination_to IS NULL OR c.vaccination_date <= p_vaccination_to)
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
  ORDER BY c.vaccination_date DESC, c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION search_child_records(
  date, date, timestamptz, timestamptz, date, date, uuid, text, uuid, uuid,
  text, text, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION search_child_records(
  date, date, timestamptz, timestamptz, date, date, uuid, text, uuid, uuid,
  text, text, text, text, text, text, text, text, text, text, text, text
) TO authenticated;

-- 7) إعادة إنشاء vaccinated_count_report بإضافة عدّادي الميكنة
DROP FUNCTION IF EXISTS vaccinated_count_report(
  p_from date,
  p_to date,
  p_hospital_id uuid,
  p_nationality text,
  p_vaccinator_id uuid,
  p_entered_by uuid
);

CREATE OR REPLACE FUNCTION vaccinated_count_report(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_hospital_id uuid DEFAULT NULL,
  p_nationality text DEFAULT NULL,
  p_vaccinator_id uuid DEFAULT NULL,
  p_entered_by uuid DEFAULT NULL
)
RETURNS TABLE (
  total bigint,
  verified bigint,
  unverified bigint,
  male bigint,
  female bigint,
  egyptian bigint,
  non_egyptian bigint,
  ministry_registered bigint,
  ministry_unregistered bigint,
  nationality_breakdown jsonb
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT c.*
    FROM child_vaccination_records c
    WHERE c.is_deleted = false
      AND (p_hospital_id IS NULL OR c.hospital_id = p_hospital_id)
      AND (p_from IS NULL OR c.vaccination_date >= p_from)
      AND (p_to IS NULL OR c.vaccination_date <= p_to)
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
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE is_verified = true)::bigint,
    COUNT(*) FILTER (WHERE is_verified = false)::bigint,
    COUNT(*) FILTER (WHERE child_gender = 'male')::bigint,
    COUNT(*) FILTER (WHERE child_gender = 'female')::bigint,
    COUNT(*) FILTER (WHERE COALESCE(normalize_arabic(child_nationality), '') LIKE 'مصر%')::bigint,
    COUNT(*) FILTER (WHERE COALESCE(normalize_arabic(child_nationality), '') NOT LIKE 'مصر%')::bigint,
    COUNT(*) FILTER (WHERE base.ministry_registered = true)::bigint,
    COUNT(*) FILTER (WHERE base.ministry_registered = false)::bigint,
    COALESCE(
      (
        SELECT jsonb_agg(j ORDER BY j->>'count' DESC, j->>'nationality' ASC)
        FROM (
          SELECT jsonb_build_object(
            'nationality', COALESCE(NULLIF(child_nationality, ''), 'غير محدد'),
            'count', COUNT(*)
          ) AS j
          FROM base
          GROUP BY child_nationality
        ) t
      ),
      '[]'::jsonb
    )
  FROM base;
END;
$$;

REVOKE ALL ON FUNCTION vaccinated_count_report(date, date, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vaccinated_count_report(date, date, uuid, text, uuid, uuid) TO authenticated;

-- 8) التحقق: يجب أن تبقى دالة search_child_records واحدة فقط بالاسم
--    (نفس فحص الترحيل 25 لمنع غموض PostgREST)
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'search_child_records') <> 1 THEN
    RAISE EXCEPTION 'يجب أن توجد دالة search_child_records واحدة فقط بعد الترحيل';
  END IF;
END;
$$;
