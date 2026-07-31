-- ============================================================
-- الترحيل الرابع: إضافة عمود username لتسجيل الدخول باسم عادي
-- تسجيل الدخول يتم باسم مستخدم عادي بدلاً من البريد الإلكتروني،
-- والبريد الداخلي يصبح <username>@vaccine.local
-- ============================================================

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS username text;

-- مؤشر فريد (مع السماح بقيم NULL للمستخدمين غير المحددين)
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_unique
  ON user_profiles (username)
  WHERE username IS NOT NULL;
