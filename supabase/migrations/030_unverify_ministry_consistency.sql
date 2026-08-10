-- ============================================================
-- الترحيل 30: إصلاحات منطقية على تسجيل الميكنة وفك التوثيق
--  1) prevent_update_after_verification:
--     (أ) فك التوثيق: يُلزم بقاء كل الأعمدة الأخرى دون تغيير (عدا
--         is_verified/verified_by/verified_at) ويُصفّر حقول الميكنة
--         تلقائيًا — يمنع استغلال فك التوثيق لتعديل بيانات موثّقة
--         في نفس العملية (بند 7/3 من المواصفات: حماية على مستوى DB).
--     (ب) تسجيل الميكنة: يفرض ministry_registered_by = الفاعل الفعلي
--         لمنع إسناد التسجيل لمستخدم آخر غير من نفّذ العملية.
--  2) resolve_unverify_request: عند الاعتماد يُصفّر حقول الميكنة أيضًا
--     (لا يبقى السجل "مسجّلا على الميكنة" وهو غير موثّق)، وإزالة إدراج
--     audit اليدوي لأن trigger log_update_to_audit يسجّل الحدث نفسه
--     (كان ينتج سجلّان مكرران بنفس table/record/action).
-- ============================================================

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
      -- السجل بعد فك التوثيق لم يعد "مسجلا على الميكنة": تُصفَّر حقول الميكنة
      -- لأن بياناته قد تُعدَّل من المستشفى بعد فتحه (اتساق منطقي — مراجعة اليوم)
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
      -- فرض الفاعل الفعلي: يمنع إسناد التسجيل لمستخدم آخر غير من نفّذ العملية
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

-- ============================================================
-- تحديث resolve_unverify_request:
--  - تصفير حقول الميكنة عند الاعتماد (فك التوثيق)
--  - إزالة إدراج audit اليدوي (يسجّله trigger log_update_to_audit مرة واحدة)
-- ============================================================
DROP FUNCTION IF EXISTS resolve_unverify_request(UUID, TEXT);

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
    RAISE EXCEPTION 'الطلب غير موجود أو لم يعد معلقا';
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
    -- فك التوثيق الفعلي: يعود السجل غير موثّق بحقول توثيق فارغة،
    -- وتُصفَّر حقول الميكنة أيضًا (لا يبقى "مسجلا على الميكنة" وهو غير موثّق)
    SELECT is_verified INTO child_verified FROM child_vaccination_records WHERE id = req_record_id;
    IF child_verified IS NOT TRUE THEN
      UPDATE unverify_requests SET status = 'rejected', resolved_by = v_checked_actor_id, resolved_at = now()
      WHERE id = req_id;
      RETURN FALSE;
    END IF;

    UPDATE child_vaccination_records
    SET is_verified = false,
        verified_by = NULL,
        verified_at = NULL,
        ministry_registered = false,
        ministry_registered_by = NULL,
        ministry_registered_at = NULL
    WHERE id = req_record_id;

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
