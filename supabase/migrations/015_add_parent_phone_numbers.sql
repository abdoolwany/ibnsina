-- أرقام تليفون الأب والأم — اختيارية، تُعرض في نموذج التسجيل/التعديل
alter table public.child_vaccination_records
  add column if not exists father_phone_number text,
  add column if not exists mother_phone_number text;
