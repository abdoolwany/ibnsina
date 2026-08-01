-- ============================================================
-- الترحيل 14: استرجاع أثر الجرعات المستهلكة لسجلات الأطفال المحذوفة سابقًا
-- تُنفَّذ مرة واحدة لملء جدول الأرشيف من سجل التدقيق، حتى لا تعود
-- جرعات الأطفال الذين حُذفت سجلاتهم قبل تفعيل الأرشفة إلى الرصيد.
-- آمنة لإعادة التشغيل: ON CONFLICT DO NOTHING + فحص أن السجل لم يعد موجودًا
-- ============================================================

INSERT INTO deleted_child_vaccination_records
  (original_record_id, batch_id, hospital_id, deleted_by, deleted_at)
SELECT
  (old_value->>'id')::uuid,
  (old_value->>'batch_id')::uuid,
  (old_value->>'hospital_id')::uuid,
  performed_by,
  performed_at
FROM audit_log
WHERE table_name = 'child_vaccination_records'
  AND action = 'delete_attempt'
  AND old_value IS NOT NULL
  AND (old_value->>'id') IS NOT NULL
  AND (old_value->>'batch_id') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM child_vaccination_records cvr
    WHERE cvr.id = (old_value->>'id')::uuid
  )
ON CONFLICT (original_record_id) DO NOTHING;
