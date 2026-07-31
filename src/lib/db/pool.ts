import { Client } from 'pg'

// اتصال مباشر بقاعدة البيانات (عبر pooler) لدوال إدارة النظام
// مثل: مراقبة الحجم، الحذف الفعلي، واستعادة المساحة بـ VACUUM
// يستخدم DATABASE_URL من متغيرات البيئة (يُضبط في Vercel)
export async function getSystemPgClient(): Promise<Client | null> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) return null

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  return client
}
