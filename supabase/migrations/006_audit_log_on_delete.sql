-- ============================================================
-- الترحيل السادس: السماح بحذف الحسابات التي لها سجل تدقيق
-- المشكلة: audit_log.performed_by كان RESTRICT فيمنع حذف مستخدم
-- له أي سجل تدقيق (مثل مدخل بيانات سجل أطفال).
-- الحل: SET NULL مع إبقاء السجل نفسه (للحفاظ على مسار التدقيق).
-- ============================================================

ALTER TABLE audit_log ALTER COLUMN performed_by DROP NOT NULL;

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_performed_by_fkey;

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_performed_by_fkey
  FOREIGN KEY (performed_by) REFERENCES user_profiles(id)
  ON DELETE SET NULL;
