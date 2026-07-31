-- تأمين batch_balance_view: الالتزام بسياسات RLS للجداول الأساسية
-- (security_invoker = true تجعل الاستعلام يعمل بصلاحيات المستخدم نفسه،
--  فيُفلتر تلقائيًا حسب مستشفاه بدل كشف بيانات كل المستشفيات)
ALTER VIEW batch_balance_view SET (security_invoker = true);
