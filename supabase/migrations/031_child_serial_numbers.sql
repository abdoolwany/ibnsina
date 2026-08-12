-- ============================================================
-- الترحيل 31: الرقم المسلسل الشهري لكل سجل طفل
--  المواصفات (الاتفاق مع المستخدم):
--  1) كل مستشفى يرقّم أطفاله مسلسلاً على حدة (1، 2، 3...) ويبدأ من 1
--     في أول كل شهر — حسب تاريخ التسجيل الفعلي (created_at).
--  2) الشهر والسنة يُستخرجان بتوقيت القاهرة (Africa/Cairo) لأن إنشاء
--     السجل يحدث في مصر، فيجب أن يطابق الشهر إدراك المستخدم له.
--  3) الرقم لا يُعاد أبدًا حتى لو حُذف السجل لاحقًا — عبر جدول عدادات
--     مستقل (child_serial_counters) يتقدم بشكل لا رجعة فيه.
--  4) يُولَّد الرقم داخل قاعدة البيانات (Trigger BEFORE INSERT) لضمان
--     عدم تكرار رقمين لنفس المستشفى/الشهر حتى مع الإدراج المتزامن
--     (ON CONFLICT ... DO UPDATE يقفل الصف أثناء الزيادة).
--  5) حقلان للتخزين فقط (serial_number/month/year) — لا يُحسب الرصيد
--     أو أي قيمة أخرى من هذه الحقول؛ فهي للعرض والتوثيق فقط.
--  6) تُضاف الحقول الثلاثة إلى مخرجات search_child_records لتبدو في
--     صفوف تقرير الأطفال (شاشة وطباعة وتصدير) كما في المواصفة 9.
-- ============================================================

-- 1) الأعمدة الجديدة (قابلة للفارغة — يملؤها الـ Trigger لحظة الإدراج)
ALTER TABLE child_vaccination_records
  ADD COLUMN IF NOT EXISTS serial_number integer,
  ADD COLUMN IF NOT EXISTS serial_month integer,
  ADD COLUMN IF NOT EXISTS serial_year integer;

-- 2) جدول العدادات الشهرية لكل مستشفى — مصدر الحقيقة الوحيد للتسلسل.
--    لا يُحذف من هذا الجدول أي صف حتى لا يُعاد رقم مستخدم من قبل.
CREATE TABLE IF NOT EXISTS child_serial_counters (
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  serial_month integer NOT NULL,
  serial_year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (hospital_id, serial_month, serial_year)
);
ALTER TABLE child_serial_counters ENABLE ROW LEVEL SECURITY;

-- 3) دالة منح الرقم المسلسل — SECURITY DEFINER لتجاوز RLS على جدول
--    العدادات (المالك يتجاوز RLS أصلاً، وهنا صريحة وموثقة).
--    ON CONFLICT ... DO UPDATE يزيد العداد ذاتياً مع قفل صف
--    (سطر) ليمنع حصول إدراجين متزامنين على نفس الرقم.
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

CREATE TRIGGER trigger_assign_child_serial_number
  BEFORE INSERT ON child_vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION assign_child_serial_number();

-- 4) إعادة ترقيم السجلات الموجودة (Backfill): يُرقَّم كل سجل حسب
--    مستشفاه وشهر/سنة تسجيله، مرتباً بتاريخ الإدخال ثم المعرف.
WITH numbered AS (
  SELECT
    id,
    EXTRACT(MONTH FROM created_at AT TIME ZONE 'Africa/Cairo')::int AS m,
    EXTRACT(YEAR FROM created_at AT TIME ZONE 'Africa/Cairo')::int AS y,
    ROW_NUMBER() OVER (
      PARTITION BY hospital_id,
        EXTRACT(MONTH FROM created_at AT TIME ZONE 'Africa/Cairo')::int,
        EXTRACT(YEAR FROM created_at AT TIME ZONE 'Africa/Cairo')::int
      ORDER BY created_at, id
    ) AS rn
  FROM child_vaccination_records
  WHERE is_deleted = false
)
UPDATE child_vaccination_records c
SET serial_number = n.rn,
    serial_month = n.m,
    serial_year = n.y
FROM numbered n
WHERE c.id = n.id;

-- 5) تهيئة العدادات لتبدأ من آخر رقم مستخدم لكل (مستشفى، شهر، سنة)
INSERT INTO child_serial_counters (hospital_id, serial_month, serial_year, last_number)
SELECT hospital_id, serial_month, serial_year, MAX(serial_number)
FROM child_vaccination_records
WHERE serial_number IS NOT NULL
GROUP BY hospital_id, serial_month, serial_year;

-- ============================================================
-- 6) إعادة إنشاء search_child_records مع الحقول الثلاثة في المخرجات
--    (DROP+CREATE ضروري لأن PostgreSQL لا يسمح بتغيير RETURNS TABLE
--    عبر CREATE OR REPLACE — نفس نمط الترحيل 25/27، ويُحافظ على نفس
--    المعاملات الـ22 لمنع غموض PostgREST).
-- ============================================================
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

-- 7) التحقق: يجب أن تبقى دالة search_child_records واحدة فقط بالاسم
--    (نفس فحص الترحيل 25/27 لمنع غموض PostgREST)
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'search_child_records') <> 1 THEN
    RAISE EXCEPTION 'يجب أن توجد دالة search_child_records واحدة فقط بعد الترحيل';
  END IF;
END;
$$;
