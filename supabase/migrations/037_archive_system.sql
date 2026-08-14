-- ============================================================
-- الترحيل 37: نظام الأرشفة الشهرية التلقائية
-- ============================================================
-- الفكرة (المتفق عليها): الداتا بيز هي المرجع أثناء وجود النسختين،
-- والأرشيف يُكتب فقط في لحظات نادرة (الأرشفة الشهرية، لحظة الحذف،
-- حفظ تعديلات شاشة المراجعة). لا مزامنة عند كل تعديل — فيُكتب الملف
-- بأحدث حالة فقط عند انتقال السجل من الداتا بيز إلى الأرشيف نهائيًا.
--
-- الملخص:
--  1) عمودا archived_at على child_vaccination_records و vaccine_batches
--     (علامة دخول السجل إلى الأرشيف؛ السجل يبقى في الداتا بيز وظاهرًا)
--  2) فهارس على created_at لاستعلامات الأرشفة الشهرية
--  3) توسيع قيود action في audit_log لإضافة أحداث الأرشفة
--  4) جدولا المراجعة المؤقتة (استرجاع شهر من الأرشيف لعرضه/تعديله)
--     — وصولهما عبر service_role فقط (بلا سياسات RLS)، ويُحذفان عند الإغلاق
-- ============================================================

-- 1) عمودا الأرشفة (الجدولان يبقيان كما هما، السجلات المؤرشفة لا تُحذف)
ALTER TABLE child_vaccination_records
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE vaccine_batches
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 2) فهارس أقدمية: استعلامات الأرشفة الشهرية تفرز/تنتقي حسب created_at
CREATE INDEX IF NOT EXISTS idx_child_records_created_at
  ON child_vaccination_records(created_at);
CREATE INDEX IF NOT EXISTS idx_batches_created_at
  ON vaccine_batches(created_at);

-- 3) توسيع قيود action في audit_log لأحداث الأرشفة
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN (
    'insert', 'update', 'verify', 'delete_attempt', 'unverify',
    'request_create', 'request_resolve',
    'ministry_register', 'ministry_unregister',
    'archive', 'archive_rotate', 'archive_delete', 'archive_restore',
    'archive_review_edit', 'archive_review_close'
  ));

-- 4) جدولا المراجعة المؤقتة
--    الغرض: عند استرجاع شهر من الأرشيف (لم يعد في الداتا بيز) تُنقل
--    بياناته إلى جدولين مؤقتين للعرض/التعديل، ثم عند إغلاق الشاشة
--    يُعاد بناء ملف الأرشيف بالبيانات المعدلة ويُحذف محتوى الجدولين.
--    لا تُدرج أي بيانات في الجداول الحية أبدًا (تفادي كسر FK والأرقام
--    المسلسلة و batch_balance_view).
CREATE TABLE IF NOT EXISTS archive_review_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key text NOT NULL,                      -- صيغة YYYY-MM
  opened_by uuid REFERENCES user_profiles(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  closed_at timestamptz
);

-- جلسة مراجعة مفتوحة واحدة فقط على مستوى النظام (منع تضارب الكتابة)
CREATE UNIQUE INDEX IF NOT EXISTS one_open_archive_review_session
  ON archive_review_sessions(status)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS archive_review_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL
    REFERENCES archive_review_sessions(id) ON DELETE CASCADE,
  record_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('child', 'batch')),
  original_data jsonb NOT NULL,                 -- الصورة الأصلية من الأرشيف
  current_data jsonb NOT NULL,                  -- الصورة الحالية (بعد أي تعديل)
  updated_by uuid,
  updated_at timestamptz
);

-- وصول حصري عبر service_role (يتم تمكين RLS دون سياسات)
ALTER TABLE archive_review_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive_review_records ENABLE ROW LEVEL SECURITY;
