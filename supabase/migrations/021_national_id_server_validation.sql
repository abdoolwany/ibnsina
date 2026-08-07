-- ============================================================
-- الترحيل 21: التحقق من صحة الأرقام القومية على مستوى قاعدة البيانات
-- المواصفات القسم 10: التحقق في الواجهة وحده غير كافٍ لأنه يمكن تجاوزه،
-- فتُعاد نفس قواعد التحقق إلزاميًا في الخادم عبر trigger على الإدراج/التعديل:
--   14 خانة، القرن (2/3)، الشهر، اليوم (مع الكبيسة)، وعدم تجاوز تاريخ اليوم
--   (مثال مرفوض: القرن 3 + سنة 95 = 2095 وهو مستقبل).
-- ملاحظة: مطابقة الجنس (الخانة 13) تنبيه فقط في الواجهة، لا تُفرض هنا.
-- ============================================================

-- دالة تحقق رقم قومي واحد (تُستخدم للآباء والأمهات)
CREATE OR REPLACE FUNCTION validate_single_national_id(p_id TEXT, p_field TEXT)
RETURNS VOID AS $$
DECLARE
  today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo')::date;
  v_century INT;
  v_birth_year INT;
  v_month INT;
  v_day INT;
  v_days_in_month INT;
BEGIN
  IF p_id IS NULL OR p_id = '' THEN
    RAISE EXCEPTION 'الرقم القومي لـ % مطلوب', p_field;
  END IF;

  IF p_id !~ '^[0-9]{14}$' THEN
    RAISE EXCEPTION 'الرقم القومي لـ % يجب أن يتكون من 14 خانة رقمية', p_field;
  END IF;

  v_century := substring(p_id FROM 1 FOR 1)::int;
  IF v_century <> 2 AND v_century <> 3 THEN
    RAISE EXCEPTION 'الخانة الأولى للرقم القومي لـ % يجب أن تكون 2 (1900-1999) أو 3 (2000-2099)', p_field;
  END IF;

  v_birth_year := (CASE WHEN v_century = 2 THEN 1900 ELSE 2000 END) + substring(p_id FROM 2 FOR 2)::int;

  v_month := substring(p_id FROM 4 FOR 2)::int;
  IF v_month < 1 OR v_month > 12 THEN
    RAISE EXCEPTION 'شهر الميلاد غير صحيح في الرقم القومي لـ %', p_field;
  END IF;

  -- عدد أيام الشهر مع مراعاة السنوات الكبيسة
  v_days_in_month := EXTRACT(DAY FROM (make_date(v_birth_year, v_month, 1) + INTERVAL '1 month' - INTERVAL '1 day'))::int;
  v_day := substring(p_id FROM 6 FOR 2)::int;
  IF v_day < 1 OR v_day > v_days_in_month THEN
    RAISE EXCEPTION 'يوم الميلاد غير صحيح في الرقم القومي لـ % (الشهر % في سنة % له % يوما)', p_field, v_month, v_birth_year, v_days_in_month;
  END IF;

  IF make_date(v_birth_year, v_month, v_day) > today THEN
    RAISE EXCEPTION 'تاريخ الميلاد المستنتج من الرقم القومي لـ % (%-%-%) بعد اليوم (%) — تأكد من صحة الرقم', p_field, v_birth_year, lpad(v_month::text, 2, '0'), lpad(v_day::text, 2, '0'), today;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger الرئيسي: يتحقق من الأب دائمًا ومن الأم إن أُدخل رقم قومي (جواز السفر بديل مسموح)
CREATE OR REPLACE FUNCTION validate_national_ids()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM validate_single_national_id(NEW.father_national_id, 'الأب');
  IF NEW.mother_national_id IS NOT NULL AND NEW.mother_national_id <> '' THEN
    PERFORM validate_single_national_id(NEW.mother_national_id, 'الأم');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_national_ids ON child_vaccination_records;
CREATE TRIGGER trigger_validate_national_ids
  BEFORE INSERT OR UPDATE ON child_vaccination_records
  FOR EACH ROW EXECUTE FUNCTION validate_national_ids();
