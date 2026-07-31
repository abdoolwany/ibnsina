-- إضافة تاريخ دخول التشغيلة إلى batch_balance_view
-- حتى تعرض لوحات المستويات تاريخ التسليم مع الرصيد
CREATE OR REPLACE VIEW batch_balance_view
WITH (security_invoker = true)
AS
SELECT
  vb.id AS batch_id,
  vb.hospital_id,
  vb.batch_number,
  vb.expiry_date,
  vb.quantity AS total_quantity,
  COUNT(cvr.id) FILTER (WHERE cvr.is_deleted = false) AS used_quantity,
  vb.quantity - COUNT(cvr.id) FILTER (WHERE cvr.is_deleted = false) AS remaining_balance,
  vb.delivery_date
FROM vaccine_batches vb
LEFT JOIN child_vaccination_records cvr ON cvr.batch_id = vb.id AND cvr.is_deleted = false
GROUP BY vb.id, vb.hospital_id, vb.batch_number, vb.expiry_date, vb.quantity, vb.delivery_date;
