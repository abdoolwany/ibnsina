-- ============================================================
-- الترحيل الأول: الهيكل الأساسي لقاعدة البيانات
-- ============================================================

-- 1. إنشاء أنواع مخصصة (Enums)
CREATE TYPE user_role AS ENUM ('hospital_entry', 'hospital_verifier', 'moh_level1', 'moh_admin');
CREATE TYPE gender AS ENUM ('male', 'female');

-- 2. جدول المستشفيات
CREATE TABLE hospitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;

-- 3. جدول ملفات تعريف المستخدمين (يربط Supabase Auth بالأدوار)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  full_name TEXT NOT NULL
);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 4. جدول الربط many-to-many بين المستخدمين والمستشفيات
CREATE TABLE user_hospital_links (
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, hospital_id)
);
ALTER TABLE user_hospital_links ENABLE ROW LEVEL SECURITY;

-- 5. جدول شحنات المخزن (اختياري)
CREATE TABLE warehouse_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
  received_by TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE warehouse_shipments ENABLE ROW LEVEL SECURITY;

-- 6. جدول دفعات اللقاح المسلمة لكل مستشفى
CREATE TABLE vaccine_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  delivery_date DATE NOT NULL,
  batch_number TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE vaccine_batches ENABLE ROW LEVEL SECURITY;

-- 7. جدول القائمين بالتطعيم (يديره الموثق فقط)
CREATE TABLE vaccinators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  added_by UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE vaccinators ENABLE ROW LEVEL SECURITY;

-- 8. جدول سجلات الأطفال (الجدول الأهم)
CREATE TABLE child_vaccination_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id),

  -- بيانات الطفل
  child_full_name TEXT NOT NULL,
  child_gender gender NOT NULL,
  birth_date DATE NOT NULL,
  child_nationality TEXT NOT NULL DEFAULT 'مصري',

  -- بيانات الأب (حقول منفصلة في الإدخال)
  father_first_name TEXT NOT NULL,
  father_grandfather_name TEXT NOT NULL,
  father_national_id TEXT NOT NULL,
  father_passport_number TEXT,
  father_id_image_key TEXT NOT NULL,

  -- بيانات الأم (حقول منفصلة في الإدخال)
  mother_first_name TEXT NOT NULL,
  mother_grandfather_name TEXT NOT NULL,
  mother_national_id TEXT NOT NULL,
  mother_passport_number TEXT,
  mother_id_image_key TEXT NOT NULL,

  -- بيانات التطعيم
  vaccination_date DATE NOT NULL,
  batch_id UUID NOT NULL REFERENCES vaccine_batches(id),
  vaccinator_id UUID NOT NULL REFERENCES vaccinators(id),

  -- تتبع وتوثيق
  entered_by UUID NOT NULL REFERENCES user_profiles(id),
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES user_profiles(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Soft delete
  is_deleted BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE child_vaccination_records ENABLE ROW LEVEL SECURITY;

-- 9. جدول سجل التدقيق (إلزامي لكل عملية حساسة)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'verify', 'delete_attempt')),
  performed_by UUID NOT NULL REFERENCES user_profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_value JSONB,
  new_value JSONB
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 10. إنشاء VIEW لحساب رصيد كل دفعة تلقائيا
-- ============================================================
CREATE VIEW batch_balance_view AS
SELECT
  vb.id AS batch_id,
  vb.hospital_id,
  vb.batch_number,
  vb.expiry_date,
  vb.quantity AS total_quantity,
  COUNT(cvr.id) FILTER (WHERE cvr.is_deleted = false) AS used_quantity,
  vb.quantity - COUNT(cvr.id) FILTER (WHERE cvr.is_deleted = false) AS remaining_balance
FROM vaccine_batches vb
LEFT JOIN child_vaccination_records cvr ON cvr.batch_id = vb.id AND cvr.is_deleted = false
GROUP BY vb.id, vb.hospital_id, vb.batch_number, vb.expiry_date, vb.quantity;

-- ============================================================
-- 11. Trigger: منع التعديل بعد التوثيق
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_update_after_verification()
RETURNS TRIGGER AS $$
BEGIN
  -- إذا كان السجل قد تم توثيقه مسبقا
  IF OLD.is_verified = true THEN
    -- السماح فقط إذا كان المستخدم من دور moh_admin (يتم التحقق من السياق)
    -- نتحقق من is_verified هنا لمنع التعديل بعد التوثيق حسب القسم 3 من المواصفات
    RAISE EXCEPTION 'لا يمكن تعديل سجل تم توثيقه مسبقا. معرف السجل: %', OLD.id
      USING HINT = 'اتصل بمسؤول النظام (moh_admin) إذا كان التصحيح ضروريا';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_update_after_verification
  BEFORE UPDATE ON child_vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION prevent_update_after_verification();

-- ============================================================
-- 12. Trigger: تسجيل عمليات التحديث في audit_log
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
    COALESCE(NEW.verified_by, NEW.entered_by),
    row_to_json(OLD)::jsonb,
    row_to_json(NEW)::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_update_to_audit
  AFTER UPDATE ON child_vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION log_update_to_audit();

-- ============================================================
-- 13. Trigger: تسجيل عمليات الإدراج في audit_log
-- ============================================================
CREATE OR REPLACE FUNCTION log_insert_to_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (table_name, record_id, action, performed_by, new_value)
  VALUES (TG_TABLE_NAME, NEW.id, 'insert', NEW.entered_by, row_to_json(NEW)::jsonb);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_insert_to_audit
  AFTER INSERT ON child_vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION log_insert_to_audit();

-- ============================================================
-- 14. Trigger: تحديث updated_at تلقائيا
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_updated_at
  BEFORE UPDATE ON child_vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 15. سياسات RLS (سيتم تفصيلها حسب الأدوار في مرحلة لاحقة)
-- ============================================================

-- سياسات hospitals: الجميع يستطيع قراءة أسماء المستشفيات
CREATE POLICY "allow_read_all" ON hospitals FOR SELECT USING (true);

-- سياسات user_profiles: يمكن للمستخدم قراءة ملفه فقط
CREATE POLICY "allow_read_own_profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

-- سياسة مؤقتة للمستخدمين المصادق عليهم (سيتم تفصيلها لاحقا)
CREATE POLICY "allow_select_own_links" ON user_hospital_links
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- 16. إنشاء دالة للحصول على معرفات المستشفيات المرتبطة بالمستخدم الحالي
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_hospital_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
AS $$
  SELECT hospital_id FROM user_hospital_links WHERE user_id = auth.uid()
$$;

-- ============================================================
-- 17. إنشاء دالة للحصول على دور المستخدم الحالي
-- ============================================================
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$;
