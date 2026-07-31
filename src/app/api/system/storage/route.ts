import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getSystemPgClient } from '@/lib/db/pool'

// GET /api/system/storage — مراقبة استهلاك التخزين في قاعدة البيانات
export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'system_operator') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const client = await getSystemPgClient()
  if (!client) {
    return NextResponse.json({ error: 'DATABASE_URL غير مضبوطة في متغيرات البيئة' }, { status: 500 })
  }

  try {
    const total = await client.query(
      "SELECT pg_size_pretty(pg_database_size(current_database())) AS pretty, pg_database_size(current_database())::bigint AS bytes"
    )

    const tables = await client.query(`
      SELECT schemaname, relname AS table_name,
             n_live_tup AS approx_rows,
             pg_total_relation_size(relid)::bigint AS size_bytes,
             pg_size_pretty(pg_total_relation_size(relid)) AS size_pretty
      FROM pg_stat_user_tables
      WHERE schemaname IN ('public', 'auth', 'storage')
      ORDER BY pg_total_relation_size(relid) DESC
    `)

    return NextResponse.json({
      total_pretty: total.rows[0].pretty,
      total_bytes: total.rows[0].bytes,
      tables: tables.rows,
    })
  } finally {
    await client.end()
  }
}
