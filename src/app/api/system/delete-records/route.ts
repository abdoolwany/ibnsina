import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getSystemPgClient } from '@/lib/db/pool'

// POST /api/system/delete-records
// حذف فعلي نهائي لبيانات الإدخال حسب نطاق زمني (created_at)
// body: { type: 'children' | 'batches', dateFrom, dateTo, preview? }
// مع تسجيل كل سجل محذوف في audit_log واستعادة المساحة بـ VACUUM FULL
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'system_operator') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  const { type, dateFrom, dateTo, preview } = await request.json()

  if (type !== 'children' && type !== 'batches') {
    return NextResponse.json({ error: 'نوع الحذف غير صالح' }, { status: 400 })
  }
  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'حدد تاريخي البداية والنهاية' }, { status: 400 })
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: 'تاريخ البداية بعد تاريخ النهاية' }, { status: 400 })
  }

  const client = await getSystemPgClient()
  if (!client) {
    return NextResponse.json({ error: 'DATABASE_URL غير مضبوطة في متغيرات البيئة' }, { status: 500 })
  }

  // نطاق زمني UTC يشمل اليوم الأخير كاملًا
  const fromTS = `${dateFrom}T00:00:00Z`
  const toEnd = new Date(`${dateTo}T00:00:00Z`)
  toEnd.setDate(toEnd.getDate() + 1)
  const toEndTS = toEnd.toISOString()

  try {
    if (type === 'children') {
      if (preview) {
        const r = await client.query(
          'SELECT count(*)::int AS c FROM child_vaccination_records WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz',
          [fromTS, toEndTS]
        )
        return NextResponse.json({ preview: true, children: r.rows[0].c })
      }

      const deleted = await client.query(
        `
        WITH deleted AS (
          DELETE FROM child_vaccination_records
          WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
          RETURNING id, to_jsonb(child_vaccination_records) AS old_value
        )
        INSERT INTO audit_log (table_name, record_id, action, performed_by, old_value)
        SELECT 'child_vaccination_records', id, 'delete_attempt', $3, old_value FROM deleted
        RETURNING 1
        `,
        [fromTS, toEndTS, user.id]
      )

      const vacuum = await runVacuum(client, ['child_vaccination_records'])
      return NextResponse.json({
        deleted: deleted.rowCount ?? 0,
        spaceReclaimed: vacuum.ok,
        vacuumError: vacuum.error,
      })
    }

    // حذف الدفعات: حذف سجلات الأطفال المرتبطة أولًا ثم الدفعات نفسها
    if (preview) {
      const r = await client.query(
        `
        SELECT
          (SELECT count(*)::int FROM vaccine_batches
            WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz) AS batches,
          (SELECT count(*)::int FROM child_vaccination_records
            WHERE batch_id IN (
              SELECT id FROM vaccine_batches
              WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
            )) AS children
        `,
        [fromTS, toEndTS]
      )
      return NextResponse.json({ preview: true, batches: r.rows[0].batches, children: r.rows[0].children })
    }

    const childRows = await client.query(
      `
      WITH deleted AS (
        DELETE FROM child_vaccination_records
        WHERE batch_id IN (
          SELECT id FROM vaccine_batches
          WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
        )
        RETURNING id, to_jsonb(child_vaccination_records) AS old_value
      )
      INSERT INTO audit_log (table_name, record_id, action, performed_by, old_value)
      SELECT 'child_vaccination_records', id, 'delete_attempt', $3, old_value FROM deleted
      RETURNING 1
      `,
      [fromTS, toEndTS, user.id]
    )

    const batchRows = await client.query(
      `
      WITH deleted AS (
        DELETE FROM vaccine_batches
        WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
        RETURNING id, to_jsonb(vaccine_batches) AS old_value
      )
      INSERT INTO audit_log (table_name, record_id, action, performed_by, old_value)
      SELECT 'vaccine_batches', id, 'delete_attempt', $3, old_value FROM deleted
      RETURNING 1
      `,
      [fromTS, toEndTS, user.id]
    )

    const vacuum = await runVacuum(client, ['child_vaccination_records', 'vaccine_batches'])
    return NextResponse.json({
      deleted_children: childRows.rowCount ?? 0,
      deleted_batches: batchRows.rowCount ?? 0,
      spaceReclaimed: vacuum.ok,
      vacuumError: vacuum.error,
    })
  } finally {
    await client.end()
  }
}

interface VacuumResult {
  ok: boolean
  error: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runVacuum(client: any, tables: string[]): Promise<VacuumResult> {
  try {
    for (const t of tables) {
      await client.query(`VACUUM FULL public.${t}`)
    }
    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'فشل VACUUM' }
  }
}
