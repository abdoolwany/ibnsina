-- ============================================================
-- الترحيل 33: إدارة الأرقام المسلسلة من حساب الإدارة العليا (moh_admin)
--  الاتفاق مع المستخدم:
--  1) "إعادة فتح رقم غير مستخدم": يظهر فراغ في تسلسل الشهر (مثلا حُذف
--     سجل) → يضيف moh_admin الرقم إلى قائمة "معاد فتحه" ليسند تلقائيا
--     لأول سجل قادم في نفس المستشفى/الشهر (يستهلكه Trigger الإدراج).
--  2) "تغيير رقم مستخدم": moh_admin يغيّر رقم سجل (موثق أو غير موثق)
--     إلى رقم حر آخر بشرط سبب إجباري يُسجل في audit_log؛ الرقم القديم
--     يُعاد فتحه تلقائيا ليسند لأول إدراج قادم.
--  3) "حذف رقم نهائي" في واجهة المستخدم = إلغاء إعادة الفتح فقط (حذف
--     الرقم من قائمة المتاح) — وليس حرقا دائما للأرقام.
--
--  ملاحظة توافق مع المواصفة: moh_admin قراءة فقط بلا سياسات UPDATE،
--  لذلك تتم كل عمليات الأرقام حصريا عبر دالة واحدة SECURITY DEFINER
--  (admin_manage_serial_number) تتحقق من الدور، وتمرير الاستثناء عبر
--  GUC جلسة (app.serial_admin_op) يُضبط داخل الدالة فقط — لا يستطيع أي
--  مستخدم آخر (ولا PostgREST) تعيينه، لأن PostgREST لا يقبل GUC اعتباطيا.
-- ============================================================

-- ============================================================
-- 1) جدول الأرقام المُعاد فتحها (حمّامة الأرقام المتاحة)
-- ============================================================
CREATE TABLE IF NOT EXISTS child_serial_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  serial_month integer NOT NULL,
  serial_year integer NOT NULL,
  serial_number integer NOT NULL,
  released_by uuid NOT NULL REFERENCES user_profiles(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, serial_month, serial_year, serial_number)
);
ALTER TABLE child_serial_releases ENABLE ROW LEVEL SECURITY;

-- القراءة حصرية لـ moh_admin (الكتابة تتم داخل دالة SECURITY DEFINER فقط)
CREATE POLICY "moh_admin_read_serial_releases" ON child_serial_releases
  FOR SELECT TO authenticated
  USING (get_current_user_role() = 'moh_admin');

-- ============================================================
-- 2) سياسة قراءة لجدول العدادات (مطلوبة لشاشة الإدارة)
--    دون أي حق كتابة عام — يظل التقدم داخل دالة/Trigger فقط
-- ============================================================
CREATE POLICY "moh_admin_read_serial_counters" ON child_serial_counters
  FOR SELECT TO authenticated
  USING (get_current_user_role() = 'moh_admin');

-- ============================================================
-- 3) قيد تفرد صريح على الأرقام النشطة (يمنع أي تكرار حتى مع
--    التعديل المباشر). قاعدة البيانات الحالية نظيفة (فحص: 0 تكرار)
--    لذلك أُضيف الفهرس بأمان.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_child_serial_active
  ON child_vaccination_records (hospital_id, serial_month, serial_year, serial_number)
  WHERE is_deleted = false;

-- ============================================================
-- 4) تحديث Trigger منح الرقم المسلسل: يستهلك أولًا أصغر رقم
--    "مُعاد فتحه" إن وُجد (حذف ذاتي ذري مع FOR UPDATE SKIP LOCKED
--    لمنع تصادم الإدراج المتزامن)، وإلا يعمل العداد كالمعتاد
-- ============================================================
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

  -- أولوية: أصغر رقم مُعاد فتحه (يستبعد أي رقم يستخدمه سجل حي —
  -- كطبقة حماية ثانية فوق قيود دالة الإدارة)
  DELETE FROM child_serial_releases r
  WHERE r.id = (
    SELECT r2.id
    FROM child_serial_releases r2
    WHERE r2.hospital_id = NEW.hospital_id
      AND r2.serial_month = v_month
      AND r2.serial_year = v_year
      AND NOT EXISTS (
        SELECT 1 FROM child_vaccination_records c
        WHERE c.hospital_id = r2.hospital_id
          AND c.serial_month = r2.serial_month
          AND c.serial_year = r2.serial_year
          AND c.serial_number = r2.serial_number
          AND c.is_deleted = false
      )
    ORDER BY r2.serial_number
    LIMIT 1
    FOR UPDATE OF r2 SKIP LOCKED
  )
  RETURNING r.serial_number INTO v_serial;

  -- لا أرقام مُعاد فتحها: العداد كالمعتاد (لا يُعاد رقم مستخدم من قبل)
  IF v_serial IS NULL THEN
    INSERT INTO child_serial_counters (hospital_id, serial_month, serial_year)
    VALUES (NEW.hospital_id, v_month, v_year)
    ON CONFLICT (hospital_id, serial_month, serial_year)
    DO UPDATE SET last_number = child_serial_counters.last_number + 1
    RETURNING last_number INTO v_serial;
  END IF;

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

-- ============================================================
-- 5) استثناء محصور في Trigger منع التعديل بعد التوثيق:
--    تغيير الرقم المسلسل فقط، من moh_admin فقط، عبر GUC الجلسة
--    الذي تُفعّله دالة admin_manage_serial_number وحدها
-- ============================================================
DROP TRIGGER IF EXISTS trigger_prevent_update_after_verification ON child_vaccination_records;
DROP FUNCTION IF EXISTS prevent_update_after_verification();

CREATE OR REPLACE FUNCTION prevent_update_after_verification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_verified = true THEN
    -- (أ) فك التوثيق: moh_admin أو moh_level1 المرتبط بمستشفى السجل.
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

    -- (ب) تسجيل/إلغاء تسجيل الميكنة — فقط moh_level1 المرتبط بالمستشفى
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

    -- (ج) تغيير الرقم المسلسل فقط من moh_admin عبر دالة
    --     admin_manage_serial_number (تضبط app.serial_admin_op داخل
    --     معاملتها — لا يستطيع أي مستخدم آخر تشغيل هذا الاستثناء).
    --     شرط صارم: نفس المستشفى/الشهر/السنة، لا يتغير إلا serial_number،
    --     ويبقى السجل موثّقا بحقول توثيق وميكنة ثابتة.
    IF NEW.is_verified = true
       AND current_setting('app.serial_admin_op', true) = 'true'
       AND EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.role = 'moh_admin')
       AND NEW.hospital_id = OLD.hospital_id
       AND NEW.serial_month = OLD.serial_month
       AND NEW.serial_year = OLD.serial_year
       AND NEW.serial_number IS DISTINCT FROM OLD.serial_number
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
       AND NEW.ministry_registered IS NOT DISTINCT FROM OLD.ministry_registered
       AND NEW.ministry_registered_by IS NOT DISTINCT FROM OLD.ministry_registered_by
       AND NEW.ministry_registered_at IS NOT DISTINCT FROM OLD.ministry_registered_at
       AND NEW.is_deleted IS NOT DISTINCT FROM OLD.is_deleted
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

CREATE TRIGGER trigger_prevent_update_after_verification
  BEFORE UPDATE ON child_vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION prevent_update_after_verification();

-- ============================================================
-- 6) دقة إسناد سجل التدقيق: يُفضَّل المستخدم المنفذ الفعلي
--    (auth.uid()) على من وثّق/أدخل — مطلوب لتغيّر الأرقام الذي
--    ينفذه moh_admin على سجلات موثّقة (كان يظهر الموثق بدلا منه)
-- ============================================================
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
    COALESCE(auth.uid(), NEW.verified_by, NEW.entered_by),
    row_to_json(OLD)::jsonb,
    row_to_json(NEW)::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 7) دالة الإدارة الوحيدة للأرقام المسلسلة (SECURITY DEFINER)
--    الإجراءات: release (إعادة فتح) / change (تغيير رقم سجل) /
--    cancel_release (إلغاء إعادة الفتح). تُسجل كل عملية في audit_log
-- ============================================================
CREATE OR REPLACE FUNCTION admin_manage_serial_number(
  p_action text,
  p_hospital_id uuid DEFAULT NULL,
  p_serial_month integer DEFAULT NULL,
  p_serial_year integer DEFAULT NULL,
  p_serial_number integer DEFAULT NULL,
  p_record_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_actor uuid;
  v_last integer;
  v_rec child_vaccination_records%ROWTYPE;
  v_taken boolean;
  v_released boolean;
BEGIN
  SELECT auth.uid() INTO v_actor;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;

  SELECT role INTO v_role FROM user_profiles WHERE id = v_actor;
  IF v_role IS DISTINCT FROM 'moh_admin' THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لحساب الإدارة العليا (moh_admin) فقط';
  END IF;

  IF p_action = 'release' THEN
    -- إعادة فتح رقم غير مستخدم (فراغ ناتج عن حذف/غياب سجل) ضمن نطاق التسلسل الفعلي
    IF p_hospital_id IS NULL OR p_serial_month IS NULL OR p_serial_year IS NULL OR p_serial_number IS NULL THEN
      RAISE EXCEPTION 'بيانات ناقصة لإعادة فتح رقم مسلسل';
    END IF;
    IF p_serial_number <= 0 THEN
      RAISE EXCEPTION 'الرقم المسلسل يجب أن يكون موجبا';
    END IF;

    SELECT last_number INTO v_last
    FROM child_serial_counters
    WHERE hospital_id = p_hospital_id AND serial_month = p_serial_month AND serial_year = p_serial_year;
    IF v_last IS NULL THEN
      RAISE EXCEPTION 'لا يوجد تسلسل مسجل لهذا المستشفى/الشهر — تعذر إعادة الفتح';
    END IF;
    IF p_serial_number > v_last THEN
      RAISE EXCEPTION 'الرقم % أكبر من آخر رقم مستخدم (%) في هذا الشهر', p_serial_number, v_last;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM child_vaccination_records c
      WHERE c.hospital_id = p_hospital_id
        AND c.serial_month = p_serial_month
        AND c.serial_year = p_serial_year
        AND c.serial_number = p_serial_number
        AND c.is_deleted = false
    ) INTO v_taken;
    IF v_taken THEN
      RAISE EXCEPTION 'الرقم % مستخدم حاليا بسجل نشط', p_serial_number;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM child_serial_releases r
      WHERE r.hospital_id = p_hospital_id
        AND r.serial_month = p_serial_month
        AND r.serial_year = p_serial_year
        AND r.serial_number = p_serial_number
    ) INTO v_released;
    IF v_released THEN
      RAISE EXCEPTION 'الرقم % مُعاد فتحه مسبقا', p_serial_number;
    END IF;

    INSERT INTO child_serial_releases (hospital_id, serial_month, serial_year, serial_number, released_by, reason)
    VALUES (p_hospital_id, p_serial_month, p_serial_year, p_serial_number, v_actor, p_reason);

    INSERT INTO audit_log (table_name, record_id, action, performed_by, new_value)
    VALUES ('child_serial_releases', gen_random_uuid(), 'update', v_actor,
      jsonb_build_object('serial_release', jsonb_build_object(
        'hospital_id', p_hospital_id,
        'serial_month', p_serial_month,
        'serial_year', p_serial_year,
        'serial_number', p_serial_number,
        'reason', p_reason
      )));

    RETURN jsonb_build_object('ok', true, 'action', 'release', 'serial_number', p_serial_number);

  ELSIF p_action = 'change' THEN
    -- تغيير رقم سجل إلى رقم حر آخر (السبب إجباري؛ القديم يُعاد فتحه تلقائيا)
    IF p_record_id IS NULL OR p_serial_number IS NULL THEN
      RAISE EXCEPTION 'بيانات ناقصة لتغيير الرقم المسلسل';
    END IF;
    IF p_serial_number <= 0 THEN
      RAISE EXCEPTION 'الرقم المسلسل يجب أن يكون موجبا';
    END IF;
    IF p_reason IS NULL OR trim(p_reason) = '' THEN
      RAISE EXCEPTION 'سبب التغيير إجباري ويُسجل في سجل التدقيق';
    END IF;

    SELECT * INTO v_rec
    FROM child_vaccination_records
    WHERE id = p_record_id AND is_deleted = false;
    IF v_rec.id IS NULL THEN
      RAISE EXCEPTION 'السجل غير موجود';
    END IF;
    IF p_serial_number = v_rec.serial_number THEN
      RAISE EXCEPTION 'الرقم هو نفس رقم السجل الحالي';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM child_vaccination_records c
      WHERE c.hospital_id = v_rec.hospital_id
        AND c.serial_month = v_rec.serial_month
        AND c.serial_year = v_rec.serial_year
        AND c.serial_number = p_serial_number
        AND c.is_deleted = false
        AND c.id <> p_record_id
    ) INTO v_taken;
    IF v_taken THEN
      RAISE EXCEPTION 'الرقم % مستخدم بالفعل بسجل آخر', p_serial_number;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM child_serial_releases r
      WHERE r.hospital_id = v_rec.hospital_id
        AND r.serial_month = v_rec.serial_month
        AND r.serial_year = v_rec.serial_year
        AND r.serial_number = p_serial_number
    ) INTO v_released;
    IF v_released THEN
      RAISE EXCEPTION 'الرقم % مُعاد فتحه وسيُسند لأول إدراج قادم — اختر رقما آخر', p_serial_number;
    END IF;

    -- تفعيل استثناء Trigger منع التعديل بعد التوثيق (يقرأ الـ GUC)
    PERFORM set_config('app.serial_admin_op', 'true', true);

    UPDATE child_vaccination_records
    SET serial_number = p_serial_number
    WHERE id = p_record_id;

    -- الرقم القديم يُعاد فتحه تلقائيا (اتفاق المستخدم) ليسند لأول إدراج قادم
    INSERT INTO child_serial_releases (hospital_id, serial_month, serial_year, serial_number, released_by, reason)
    VALUES (v_rec.hospital_id, v_rec.serial_month, v_rec.serial_year, v_rec.serial_number, v_actor,
            'أُعيد فتحه تلقائيا بعد تغيير رقم السجل ' || v_rec.id);

    -- تقدم العداد إذا كان الرقم الجديد أكبر (لا يُعاد أبدا)
    INSERT INTO child_serial_counters (hospital_id, serial_month, serial_year, last_number)
    VALUES (v_rec.hospital_id, v_rec.serial_month, v_rec.serial_year, p_serial_number)
    ON CONFLICT (hospital_id, serial_month, serial_year)
    DO UPDATE SET last_number = GREATEST(child_serial_counters.last_number, EXCLUDED.last_number);

    -- تدقيق صريح بالسبب (بالإضافة لسجل update التلقائي من trigger_log_update_to_audit)
    INSERT INTO audit_log (table_name, record_id, action, performed_by, old_value, new_value)
    VALUES ('child_vaccination_records', p_record_id, 'update', v_actor,
      jsonb_build_object('serial_number', v_rec.serial_number, 'serial_month', v_rec.serial_month, 'serial_year', v_rec.serial_year),
      jsonb_build_object('serial_number', p_serial_number, 'serial_month', v_rec.serial_month, 'serial_year', v_rec.serial_year, 'reason', p_reason));

    RETURN jsonb_build_object('ok', true, 'action', 'change',
      'record_id', p_record_id,
      'from', v_rec.serial_number,
      'to', p_serial_number);

  ELSIF p_action = 'cancel_release' THEN
    -- إلغاء إعادة فتح (حذف الرقم من قائمة المتاح) — ليس حرقا دائما
    IF p_hospital_id IS NULL OR p_serial_month IS NULL OR p_serial_year IS NULL OR p_serial_number IS NULL THEN
      RAISE EXCEPTION 'بيانات ناقصة لإلغاء إعادة فتح رقم';
    END IF;

    DELETE FROM child_serial_releases r
    WHERE r.hospital_id = p_hospital_id
      AND r.serial_month = p_serial_month
      AND r.serial_year = p_serial_year
      AND r.serial_number = p_serial_number;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'الرقم غير مُعاد فتحه أصلا';
    END IF;

    INSERT INTO audit_log (table_name, record_id, action, performed_by, new_value)
    VALUES ('child_serial_releases', gen_random_uuid(), 'update', v_actor,
      jsonb_build_object('serial_release_cancelled', jsonb_build_object(
        'hospital_id', p_hospital_id,
        'serial_month', p_serial_month,
        'serial_year', p_serial_year,
        'serial_number', p_serial_number
      )));

    RETURN jsonb_build_object('ok', true, 'action', 'cancel_release', 'serial_number', p_serial_number);

  ELSE
    RAISE EXCEPTION 'إجراء غير معروف: %', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_manage_serial_number(text, uuid, integer, integer, integer, uuid, text) TO authenticated;
