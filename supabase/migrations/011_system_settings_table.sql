-- ============================================================
-- الترحيل 11: جدول إعدادات النظام + سياسات RLS لدور system_operator
-- ============================================================

-- جدول إعدادات النظام (مثل عتبة الحذف التلقائي)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- سياسات RLS: فقط دور system_operator (و service_role للخوادم)
CREATE POLICY "system_operator_select_settings" ON system_settings
  FOR SELECT USING (get_current_user_role() = 'system_operator');

CREATE POLICY "system_operator_insert_settings" ON system_settings
  FOR INSERT WITH CHECK (get_current_user_role() = 'system_operator');

CREATE POLICY "system_operator_update_settings" ON system_settings
  FOR UPDATE USING (get_current_user_role() = 'system_operator');

CREATE POLICY "system_operator_delete_settings" ON system_settings
  FOR DELETE USING (get_current_user_role() = 'system_operator');
