import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

// GET /api/system/storage — مراقبة استهلاك التخزين في قاعدة البيانات
// يعمل عبر دوال RPC بالـ service role (لا يحتاج DATABASE_URL)
export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'system_operator') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const admin = await createServiceRoleClient()

  const [totalRes, tablesRes] = await Promise.all([
    admin.rpc('get_database_total_size'),
    admin.rpc('get_database_table_sizes'),
  ])

  if (totalRes.error || tablesRes.error) {
    return NextResponse.json(
      { error: `فشل قراءة حجم التخزين: ${totalRes.error?.message ?? tablesRes.error?.message}` },
      { status: 500 }
    )
  }

  const bytes = totalRes.data as number
  // tablesRes.data: Array<{ schemaname, table_name, approx_rows, size_bytes, size_pretty }>
  const tables = tablesRes.data as unknown as {
    schemaname: string
    table_name: string
    approx_rows: number
    size_bytes: number
    size_pretty: string
  }[]

  const MB = 1024 * 1024
  return NextResponse.json({
    total_pretty: `${(bytes / MB).toFixed(1)} MB`,
    total_bytes: bytes,
    tables,
  })
}
