import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSystemPgClient } from '@/lib/db/pool'
import { archiveBeforeDelete } from '@/lib/db/archive'
import { cairoDayStartUtc, cairoDayEndExclusiveUtc } from '@/lib/time'

// POST /api/system/delete-records
// حذف فعلي نهائي لبيانات الإدخال حسب نطاق زمني (created_at)
// body: { type: 'children' | 'batches', dateFrom, dateTo, preview? }
// الحذف والتسجيل في audit_log عبر service role (لا يحتاج DATABASE_URL)
// أما استعادة المساحة VACUUM FULL فتتم عبر DATABASE_URL إن وُجدت
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

  const admin = await createServiceRoleClient()

  // نطاق زمني بتوقيت القاهرة (بداية اليوم ونهايته = 12 منتصف الليل)
  const fromTS = cairoDayStartUtc(dateFrom)
  const toEndTS = cairoDayEndExclusiveUtc(dateTo)

  if (type === 'children') {
    if (preview) {
      const { count, error } = await admin
        .from('child_vaccination_records')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', fromTS)
        .lt('created_at', toEndTS)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ preview: true, children: count ?? 0 })
    }

    const { data: rows, error: selErr } = await admin
      .from('child_vaccination_records')
      .select('*')
      .gte('created_at', fromTS)
      .lt('created_at', toEndTS)
    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })
    if (!rows || rows.length === 0) {
      return NextResponse.json({ deleted: 0, spaceReclaimed: true, vacuumError: null })
    }

    const ids = rows.map((r) => r.id)
    // ضمانة التسليم قبل الحذف: تُدرج آخر حالة للسجلات المؤهلة في الأرشيف
    // أولًا، وإن فشلت الأرشفة يُلغى الحذف كاملًا (لا يُحذف سجل بلا نسخة محدثة)
    try {
      await archiveBeforeDelete(rows, 'child')
    } catch (archiveErr) {
      return NextResponse.json(
        { error: `تعذرت الأرشفة قبل الحذف — أُلغي الحذف: ${archiveErr instanceof Error ? archiveErr.message : 'خطأ'}` },
        { status: 500 }
      )
    }
    const { error: delErr } = await admin
      .from('child_vaccination_records')
      .delete()
      .in('id', ids)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    await writeAuditEntries(admin, 'child_vaccination_records', rows, user.id)
    // أرشفة الجرعات المستهلكة حتى لا تعود إلى الرصيد بعد الحذف
    await writeArchiveEntries(admin, rows, user.id)

    const vacuum = await runVacuum(['child_vaccination_records'])
    return NextResponse.json({
      deleted: rows.length,
      spaceReclaimed: vacuum.ok,
      vacuumError: vacuum.error,
    })
  }

  // حذف الدفعات: حذف سجلات الأطفال المرتبطة أولًا ثم الدفعات نفسها
  const { data: batchRows, error: batchSelErr } = await admin
    .from('vaccine_batches')
    .select('id')
    .gte('created_at', fromTS)
    .lt('created_at', toEndTS)
  if (batchSelErr) return NextResponse.json({ error: batchSelErr.message }, { status: 500 })

  if (preview) {
    const batchIds = (batchRows ?? []).map((b) => b.id)
    let childrenCount = 0
    if (batchIds.length > 0) {
      const { count, error } = await admin
        .from('child_vaccination_records')
        .select('id', { count: 'exact', head: true })
        .in('batch_id', batchIds)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      childrenCount = count ?? 0
    }
    return NextResponse.json({
      preview: true,
      batches: (batchRows ?? []).length,
      children: childrenCount,
    })
  }

  const batchIds = (batchRows ?? []).map((b) => b.id)
  let deletedChildren = 0
  if (batchIds.length > 0) {
    const { data: childRows, error: childSelErr } = await admin
      .from('child_vaccination_records')
      .select('*')
      .in('batch_id', batchIds)
    if (childSelErr) return NextResponse.json({ error: childSelErr.message }, { status: 500 })
    if (childRows && childRows.length > 0) {
      const childIds = childRows.map((r) => r.id)
      // ضمانة التسليم: أرشفة أطفال الدفعة قبل حذفهم
      try {
        await archiveBeforeDelete(childRows, 'child')
      } catch (archiveErr) {
        return NextResponse.json(
          { error: `تعذرت الأرشفة قبل الحذف — أُلغي حذف الأطفال: ${archiveErr instanceof Error ? archiveErr.message : 'خطأ'}` },
          { status: 500 }
        )
      }
      const { error: childDelErr } = await admin
        .from('child_vaccination_records')
        .delete()
        .in('id', childIds)
      if (childDelErr) return NextResponse.json({ error: childDelErr.message }, { status: 500 })
      await writeAuditEntries(admin, 'child_vaccination_records', childRows, user.id)
      deletedChildren = childRows.length
    }
  }

  // جلب كامل سجلات الدفعات المطلوب حذفها للتسجيل في audit_log
  const { data: fullBatchRows, error: fullBatchErr } = await admin
    .from('vaccine_batches')
    .select('*')
    .in('id', batchIds.length > 0 ? batchIds : ['00000000-0000-0000-0000-000000000000'])
  if (fullBatchErr) return NextResponse.json({ error: fullBatchErr.message }, { status: 500 })

  let deletedBatches = 0
  if (batchIds.length > 0) {
    // ضمانة التسليم: أرشفة الدفعات قبل حذفها
    try {
      await archiveBeforeDelete(fullBatchRows ?? [], 'batch')
    } catch (archiveErr) {
      return NextResponse.json(
        { error: `تعذرت الأرشفة قبل حذف الدفعات — أُلغي الحذف: ${archiveErr instanceof Error ? archiveErr.message : 'خطأ'}` },
        { status: 500 }
      )
    }
    const { error: batchDelErr } = await admin
      .from('vaccine_batches')
      .delete()
      .in('id', batchIds)
    if (batchDelErr) return NextResponse.json({ error: batchDelErr.message }, { status: 500 })
    deletedBatches = batchIds.length
  }

  if (fullBatchRows && fullBatchRows.length > 0) {
    await writeAuditEntries(admin, 'vaccine_batches', fullBatchRows, user.id)
  }

  const vacuum = await runVacuum(['child_vaccination_records', 'vaccine_batches'])
  return NextResponse.json({
    deleted_children: deletedChildren,
    deleted_batches: deletedBatches,
    spaceReclaimed: vacuum.ok,
    vacuumError: vacuum.error,
  })
}

// تسجيل عمليات الحذف في audit_log عبر service role (تتجاوز RLS)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeAuditEntries(admin: any, tableName: string, rows: any[], performedBy: string) {
  const entries = rows.map((r) => ({
    table_name: tableName,
    record_id: r.id,
    action: 'delete_attempt',
    performed_by: performedBy,
    old_value: r,
  }))
  await admin.from('audit_log').insert(entries)
}

// أرشفة الجرعات المستهلكة: يحفظ الجدول الدفعة والمستشفى فقط (بدون بيانات هوية)
// حتى تظل الجرعة محسوبة كمستهلكة ولا تعود إلى رصيد الدفعة بعد حذف السجل
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeArchiveEntries(admin: any, rows: any[], performedBy: string) {
  const entries = rows.map((r) => ({
    original_record_id: r.id,
    batch_id: r.batch_id,
    hospital_id: r.hospital_id,
    deleted_by: performedBy,
  }))
  await admin.from('deleted_child_vaccination_records').insert(entries)
}

interface VacuumResult {
  ok: boolean
  error: string | null
}

// استعادة المساحة اختيارية: تعمل فقط إن وُجد DATABASE_URL
async function runVacuum(tables: string[]): Promise<VacuumResult> {
  const client = await getSystemPgClient()
  if (!client) {
    return {
      ok: false,
      error: 'DATABASE_URL غير مضبوطة — الحذف تم لكن استعادة المساحة ستُؤجل (أو تُنفّذ من Supabase يدويًا)',
    }
  }
  try {
    for (const t of tables) {
      await client.query(`VACUUM FULL public.${t}`)
    }
    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'فشل VACUUM' }
  } finally {
    await client.end()
  }
}
