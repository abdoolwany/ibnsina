-- ============================================================
-- الترحيل 13: منع عودة الجرعات المستهلكة إلى الرصيد عند حذف سجلات الأطفال
-- الجرعة التي استُهلكت لتطعيم طفل تظل مستهلكة نهائيًا حتى لو حُذف سجله
-- لاحقًا لأغراض إدارية (تنظيف التخزين). الحل:
--   جدول أرشيف بسيط (بدون أي بيانات هوية للطفل) يحفظ الدفعة المرتبطة فقط،
--   ويصبح الرصيد = الكمية - (السجلات الحية + السجلات المؤرشفة).
-- الحذف الفعلي لا يتم إلا عبر service_role (حساب system_operator).
-- ============================================================

-- 1) جدول أرشيف سجلات الأطفال المحذوفة نهائيًا
CREATE TABLE IF NOT EXISTS deleted_child_vaccination_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_record_id UUID NOT NULL UNIQUE,  -- يمنع عد نفس السجل مرتين
  batch_id UUID NOT NULL REFERENCES vaccine_batches(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by UUID REFERENCES user_profiles(id)
);
ALTER TABLE deleted_child_vaccination_records ENABLE ROW LEVEL SECURITY;

-- القراءة ضمن نطاق المستشفيات المرتبطة بالمستخدم فقط (عزل صارم)
CREATE POLICY "read_own_hospital_archive" ON deleted_child_vaccination_records
  FOR SELECT USING (
    hospital_id IN (SELECT get_user_hospital_ids())
    AND get_current_user_role() IN ('hospital_entry', 'hospital_verifier', 'moh_level1')
  );

-- moh_admin يقرأ كل الأرشفة (read-only)
CREATE POLICY "admin_read_all_archive" ON deleted_child_vaccination_records
  FOR SELECT USING (get_current_user_role() = 'moh_admin');

-- لا سياسات إدراج/تحديث/حذف: الكتابة عبر service_role فقط (يتجاوز RLS)

-- ============================================================
-- 2) تحديث batch_balance_view
--    used_quantity = سجلات حية + سجلات مؤرشفة (لنفس الدفعة)
--    نستخدم subqueries لتجنب تضخم العد الناتج عن JOIN متعدد الأطراف
-- ============================================================
CREATE OR REPLACE VIEW batch_balance_view
WITH (security_invoker = true)
AS
SELECT
  vb.id AS batch_id,
  vb.hospital_id,
  vb.batch_number,
  vb.expiry_date,
  vb.quantity AS total_quantity,
  COALESCE(
    (SELECT COUNT(*) FROM child_vaccination_records cvr
      WHERE cvr.batch_id = vb.id AND cvr.is_deleted = false), 0
  ) + COALESCE(
    (SELECT COUNT(*) FROM deleted_child_vaccination_records dc
      WHERE dc.batch_id = vb.id), 0
  ) AS used_quantity,
  vb.quantity - COALESCE(
    (SELECT COUNT(*) FROM child_vaccination_records cvr
      WHERE cvr.batch_id = vb.id AND cvr.is_deleted = false), 0
  ) - COALESCE(
    (SELECT COUNT(*) FROM deleted_child_vaccination_records dc
      WHERE dc.batch_id = vb.id), 0
  ) AS remaining_balance,
  vb.delivery_date
FROM vaccine_batches vb;
