-- إضافة أسماء الجد الأب (جد الأب وجد الأم) حسب طلب العميل
ALTER TABLE child_vaccination_records
  ADD COLUMN IF NOT EXISTS father_great_grandfather_name text,
  ADD COLUMN IF NOT EXISTS mother_great_grandfather_name text;

-- الرقم القومي للأم أصبح اختياريا (يكفي جواز السفر) حسب طلب العميل
ALTER TABLE child_vaccination_records
  ALTER COLUMN mother_national_id DROP NOT NULL;
