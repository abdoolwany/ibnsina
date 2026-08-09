-- ============================================================
-- الترحيل 024: صلاحيات قراءة إدارية لدور system_operator
-- يتيح لمدير النظام رؤية كل المستشفيات والملفات والروابط
-- حتى يتمكن من إدارة المستخدمين بكل الأدوار (القسم: فصل الصلاحيات)
-- ============================================================

-- hospitals: system_operator يرى كل المستشفيات
CREATE POLICY "system_operator_select_all_hospitals" ON hospitals
  FOR SELECT USING (
    get_current_user_role() = 'system_operator'
  );

-- user_profiles: system_operator يقرأ كل الملفات (لإدارة المستخدمين)
CREATE POLICY "system_operator_read_all_profiles" ON user_profiles
  FOR SELECT USING (get_current_user_role() = 'system_operator');

-- user_hospital_links: system_operator يقرأ كل الروابط
CREATE POLICY "system_operator_read_all_links" ON user_hospital_links
  FOR SELECT USING (get_current_user_role() = 'system_operator');
