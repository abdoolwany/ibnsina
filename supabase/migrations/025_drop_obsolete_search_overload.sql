-- ============================================================
-- الترحيل 25: إزالة التحميل الزائد القديم لدالة search_child_records
-- المشكلة: الترحيل 22 أضاف معاملات جديدة للدالة لكن CREATE OR REPLACE
-- لا يغيّر قائمة المعاملات، فأنشأ تحميلًا زائدًا ثانيًا بنفس الاسم،
-- فأصبح PostgREST يعيد خطأ 300 (غموض) عند استدعاء البحث من التقارير.
-- الحل: حذف التحميل القديم (17 معاملًا من الترحيل 20) والاحتفاظ
-- بالجديد (22 معاملًا) الذي يستدعيه خادم Next.js فعلًا.
-- ============================================================

DROP FUNCTION IF EXISTS search_child_records(
  p_birth_from date,
  p_birth_to date,
  p_created_from timestamptz,
  p_created_to timestamptz,
  p_hospital_id uuid,
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

-- التحقق: يجب أن تبقى دالة واحدة فقط بالاسم
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'search_child_records') <> 1 THEN
    RAISE EXCEPTION 'يجب أن توجد دالة search_child_records واحدة فقط بعد الترحيل';
  END IF;
END;
$$;
