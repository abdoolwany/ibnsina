-- ============================================================
-- الترحيل 32: البحث بالرقم المسلسل الشهري في شاشة التقارير
--  الإضافة:
--  1) معامل جديد p_serial_number integer لدالة search_child_records
--     يفلتر بـ serial_number المساوي تمامًا (الرقم ليس فريدًا عالميًا،
--     بل فريد لكل (مستشفى، شهر، سنة) — لذا يلزم تحديد مستشفى لحسابات
--     الوزارة عند البحث به كما في واجهة التقارير).
--  2) DROP+CREATE ضروري لأن PostgreSQL لا يسمح بتغيير RETURNS TABLE
--     عبر CREATE OR REPLACE — نفس نمط الترحيلات 25/27/29/31.
--  مخرجات الدالة وحقولها الأخرى لم تتغير إطلاقًا.
-- ============================================================

-- إعادة تعريف search_child_records مع المعامل الجديد في نهاية القائمة
-- (يُحافظ على كل المعاملات الـ22 السابقة لمنع كسر استدعاءات PostgREST).
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
    AND (p_created_from IS NULL OR c.created_at >= p_created_from)
    AND (p_created_to IS NULL OR c.created_at < p_created_to)
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
  ORDER BY c.vaccination_date DESC, c.created_at DESC;
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
-- (نفس فحص الترحيلات 25/27/31 لمنع غموض PostgREST)
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'search_child_records') <> 1 THEN
    RAISE EXCEPTION 'يجب أن توجد دالة search_child_records واحدة فقط بعد الترحيل';
  END IF;
END;
$$;
