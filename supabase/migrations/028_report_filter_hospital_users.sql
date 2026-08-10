-- ============================================================
-- الترحيل 028: قراءة مستخدمي المستشفى لأغراض فلاتر التقارير
-- ============================================================
-- يسمح للأدوار المرتبطة بالمستشفيات (hospital_entry / hospital_verifier /
-- moh_level1) بقراءة روابط وملفات المستخدمين المرتبطين بمستشفياتهم فقط،
-- حتى تعمل قائمتا فلتر "المدخل" و"القائم بالتطعيم" في التقارير لكل مستشفى
-- دون كسر عزل المستشفيات (لا تظهر بيانات مستخدمي مستشفى آخر أبدًا).
-- ============================================================

-- user_hospital_links: hospital_entry/verifier يقرؤون روابط مستشفاهم فقط
DROP POLICY IF EXISTS "hospital_users_read_hospital_links" ON user_hospital_links;
CREATE POLICY "hospital_users_read_hospital_links" ON user_hospital_links
  FOR SELECT USING (
    get_current_user_role() IN ('hospital_entry', 'hospital_verifier')
    AND hospital_id IN (SELECT get_user_hospital_ids())
  );

-- user_hospital_links: moh_level1 يقرأ روابط المستشفيات المرتبطة به فقط
DROP POLICY IF EXISTS "moh_level1_read_linked_hospital_links" ON user_hospital_links;
CREATE POLICY "moh_level1_read_linked_hospital_links" ON user_hospital_links
  FOR SELECT USING (
    get_current_user_role() = 'moh_level1'
    AND hospital_id IN (SELECT get_user_hospital_ids())
  );

-- user_profiles: hospital_entry/verifier يقرؤون ملفات مستخدمي مستشفاهم فقط
DROP POLICY IF EXISTS "hospital_users_read_hospital_profiles" ON user_profiles;
CREATE POLICY "hospital_users_read_hospital_profiles" ON user_profiles
  FOR SELECT USING (
    get_current_user_role() IN ('hospital_entry', 'hospital_verifier')
    AND id IN (
      SELECT user_id FROM user_hospital_links
      WHERE hospital_id IN (SELECT get_user_hospital_ids())
    )
  );

-- user_profiles: moh_level1 يقرأ ملفات مستخدمي مستشفياته المرتبطة فقط
DROP POLICY IF EXISTS "moh_level1_read_linked_hospital_profiles" ON user_profiles;
CREATE POLICY "moh_level1_read_linked_hospital_profiles" ON user_profiles
  FOR SELECT USING (
    get_current_user_role() = 'moh_level1'
    AND id IN (
      SELECT user_id FROM user_hospital_links
      WHERE hospital_id IN (SELECT get_user_hospital_ids())
    )
  );
