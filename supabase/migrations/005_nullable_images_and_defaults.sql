-- ============================================================
-- الترحيل الخامس: 
-- 1) جعل حقول صور الهويات nullable (مؤجلة لمرحلة الصور - القسم 4)
-- 2) افتراضية auth.uid() لحقول التتبع لمنع التلاعب بها من الواجهة
-- ============================================================

-- صور الهويات: مؤجلة، لذا قابلة للفارغ
ALTER TABLE child_vaccination_records ALTER COLUMN father_id_image_key DROP NOT NULL;
ALTER TABLE child_vaccination_records ALTER COLUMN mother_id_image_key DROP NOT NULL;

-- حقول التتبع: تُملأ تلقائيًا من المستخدم المصادق (لا يقدر العميل تزويرها)
ALTER TABLE vaccine_batches ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE vaccinators ALTER COLUMN added_by SET DEFAULT auth.uid();
ALTER TABLE child_vaccination_records ALTER COLUMN entered_by SET DEFAULT auth.uid();
