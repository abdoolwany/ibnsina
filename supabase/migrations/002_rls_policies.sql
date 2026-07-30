-- ============================================================
-- الترحيل الثاني: سياسات RLS الكاملة لكل الأدوار الأربعة
-- ============================================================

-- إزالة السياسات المؤقتة السابقة
DROP POLICY IF EXISTS "allow_read_all" ON hospitals;
DROP POLICY IF EXISTS "allow_read_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "allow_select_own_links" ON user_hospital_links;

-- ============================================================
-- 1. سياسات جدول hospitals
-- ============================================================
-- hospital_entry/verifier: يرى فقط المستشفى المرتبط به
CREATE POLICY "hospital_users_select_own" ON hospitals
  FOR SELECT USING (
    id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() IN ('hospital_entry', 'hospital_verifier')
  );

-- moh_level1: يرى المستشفيات المرتبطة به فقط
CREATE POLICY "moh_level1_select_linked" ON hospitals
  FOR SELECT USING (
    id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'moh_level1'
  );

-- moh_admin: يرى كل المستشفيات
CREATE POLICY "moh_admin_select_all" ON hospitals
  FOR SELECT USING (
    get_current_user_role() = 'moh_admin'
  );

-- ============================================================
-- 2. سياسات جدول user_profiles
-- ============================================================
-- المستخدم يقرأ ملفه فقط
CREATE POLICY "users_read_own_profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

-- moh_admin يقرأ كل الملفات (لإدارة المستخدمين)
CREATE POLICY "admin_read_all_profiles" ON user_profiles
  FOR SELECT USING (get_current_user_role() = 'moh_admin');

-- منع الإدراج والتحديث المباشر عبر RLS للمستخدمين العاديين
-- تتم إدارة الملفات عبر service_role فقط
CREATE POLICY "no_insert_for_users" ON user_profiles
  FOR INSERT WITH CHECK (false);

CREATE POLICY "no_update_for_users" ON user_profiles
  FOR UPDATE USING (false);

-- ============================================================
-- 3. سياسات جدول user_hospital_links
-- ============================================================
-- المستخدم يقرا روابطه فقط
CREATE POLICY "users_read_own_links" ON user_hospital_links
  FOR SELECT USING (user_id = auth.uid());

-- moh_admin يقرا كل الروابط
CREATE POLICY "admin_read_all_links" ON user_hospital_links
  FOR SELECT USING (get_current_user_role() = 'moh_admin');

-- ============================================================
-- 4. سياسات جدول vaccine_batches
-- ============================================================
-- hospital_entry/verifier: يقرا دفعات مستشفاه فقط
CREATE POLICY "hospital_read_batches" ON vaccine_batches
  FOR SELECT USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() IN ('hospital_entry', 'hospital_verifier')
  );

-- moh_level1: يقرا ويدرج دفعات للمستشفيات المرتبطة به
CREATE POLICY "moh_level1_select_batches" ON vaccine_batches
  FOR SELECT USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'moh_level1'
  );

CREATE POLICY "moh_level1_insert_batches" ON vaccine_batches
  FOR INSERT WITH CHECK (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'moh_level1'
  );

-- moh_admin: يقرا كل الدفعات (read-only)
CREATE POLICY "admin_read_all_batches" ON vaccine_batches
  FOR SELECT USING (get_current_user_role() = 'moh_admin');

-- ============================================================
-- 5. سياسات جدول vaccinators
-- ============================================================
-- hospital_entry: يقرا القائمين النشطين فقط في مستشفاه
CREATE POLICY "entry_read_active_vaccinators" ON vaccinators
  FOR SELECT USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'hospital_entry'
    AND is_active = true
  );

-- hospital_verifier: يقرا ويدرج ويحدث قائمة مستشفاه
CREATE POLICY "verifier_select_vaccinators" ON vaccinators
  FOR SELECT USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'hospital_verifier'
  );

CREATE POLICY "verifier_insert_vaccinators" ON vaccinators
  FOR INSERT WITH CHECK (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'hospital_verifier'
  );

CREATE POLICY "verifier_update_vaccinators" ON vaccinators
  FOR UPDATE USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'hospital_verifier'
  );

-- moh_level1: يقرا القائمين للمستشفيات المرتبطة
CREATE POLICY "moh_level1_read_vaccinators" ON vaccinators
  FOR SELECT USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'moh_level1'
  );

-- moh_admin: يقرا كل القائمين
CREATE POLICY "admin_read_all_vaccinators" ON vaccinators
  FOR SELECT USING (get_current_user_role() = 'moh_admin');

-- ============================================================
-- 6. سياسات جدول child_vaccination_records (الجدول الأهم)
-- ============================================================
-- hospital_entry: يقرا ويدرج ويحدث سجلات مستشفاه فقط (قبل التوثيق)
CREATE POLICY "entry_select_records" ON child_vaccination_records
  FOR SELECT USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'hospital_entry'
  );

CREATE POLICY "entry_insert_records" ON child_vaccination_records
  FOR INSERT WITH CHECK (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'hospital_entry'
  );

CREATE POLICY "entry_update_records" ON child_vaccination_records
  FOR UPDATE USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'hospital_entry'
  );

-- hospital_verifier: يقرا ويثبت سجلات مستشفاه
CREATE POLICY "verifier_select_records" ON child_vaccination_records
  FOR SELECT USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'hospital_verifier'
  );

CREATE POLICY "verifier_verify_records" ON child_vaccination_records
  FOR UPDATE USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'hospital_verifier'
  );

-- moh_level1: يقرا سجلات المستشفيات المرتبطة
CREATE POLICY "moh_level1_select_records" ON child_vaccination_records
  FOR SELECT USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() = 'moh_level1'
  );

-- moh_admin: يقرا كل السجلات (read-only)
CREATE POLICY "admin_select_all_records" ON child_vaccination_records
  FOR SELECT USING (get_current_user_role() = 'moh_admin');

-- ============================================================
-- 7. سياسات جدول audit_log
-- ============================================================
-- الإدراج: مسموح للمستخدمين المصادق عليهم (للتريجر)
CREATE POLICY "auth_insert_audit" ON audit_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- القراءة: فقط moh_admin
CREATE POLICY "admin_read_audit" ON audit_log
  FOR SELECT USING (get_current_user_role() = 'moh_admin');

-- ============================================================
-- 8. سياسات جدول warehouse_shipments
-- ============================================================
-- الكل يقرا (لا توجد بيانات حساسة)
CREATE POLICY "all_read_shipments" ON warehouse_shipments
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- 9. تحديث دالة التحقق من الدور لدعم التحقق المباشر
-- ============================================================
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$;
