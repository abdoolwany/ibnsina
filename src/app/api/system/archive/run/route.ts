import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import {
  archiveCutoffExclusiveUtc,
  archiveCutoffMonthKey,
  cairoMonthKey,
} from '@/lib/time'
import {
  upsertArchiveEntries,
  enrichChildRows,
  enforceArchiveRotation,
  archiveFilePath,
} from '@/lib/db/archive'

// POST /api/system/archive/run
// التشغيل الشهري للأرشفة: يرصد كل سجلات الأطفال والدفعات الأقدم من
// حد الأقدمية (شهر القاهرة الحالي − 3) وغير المؤرشفة، يدرجها في ملفات
// أشهرها ثم يضبط archived_at. السجلات تبقى في الداتا بيز وظاهرة للتقارير.
// يُستدعى من: مؤقت GitHub Actions الشهري (عبر رأس x-cron-secret) أو يدويًا
// من حساب system_operator.

// جلب كل الصفوف المطابقة في شرائح (يتجاوز حد الصفوف الافتراضي 1000)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(query: any): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let start = 0; ; start += 1000) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (query.range(start, start + 999) as any)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertAuditChunks(admin: any, entries: any[]) {
  for (let i = 0; i < entries.length; i += 500) {
    await admin.from('audit_log').insert(entries.slice(i, i + 500))
  }
}

export async function POST(request: Request) {
  const admin = await createServiceRoleClient()

  // التحقق من الهوية: رأس المؤقت أو جلسة system_operator
  const user = await getCurrentUser()
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = request.headers.get('x-cron-secret')

  let performedBy: string | null = null
  if (user && user.role === 'system_operator') {
    performedBy = user.id
  } else if (cronSecret && headerSecret && headerSecret === cronSecret) {
    const { data } = await admin
      .from('user_profiles')
      .select('id')
      .eq('role', 'system_operator')
      .order('id', { ascending: true })
      .limit(1)
    performedBy = data?.[0]?.id ?? null
  } else {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  try {
    // 1) الدوران التلقائي قبل الكتابة الجديدة (يُرجع فورًا تحت العتبة)
    const rotation = await enforceArchiveRotation(performedBy)

    // 2) حد الأقدمية: أرشفة شهر الحالي − 3 فما قبل
    const cutoff = archiveCutoffExclusiveUtc()
    const cutoffMonthKey = archiveCutoffMonthKey()

    // 3) سجلات الأطفال غير المؤرشفة بعد
    const childQuery = admin
      .from('child_vaccination_records')
      .select('*')
      .lt('created_at', cutoff)
      .is('archived_at', null)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const childRows: any[] = await fetchAll(childQuery as any)

    // 4) الدفعات غير المؤرشفة بعد
    const batchQuery = admin
      .from('vaccine_batches')
      .select('*')
      .lt('created_at', cutoff)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batchRows: any[] = await fetchAll(batchQuery as any)

    let archivedChildren = 0
    let archivedBatches = 0

    if (childRows.length > 0) {
      // 5) إثراء بأسماء العرض ثم الإدراج في ملفات الأشهر
      const enriched = await enrichChildRows(childRows)
      await upsertArchiveEntries(enriched, 'child')
      await insertAuditChunks(
        admin,
        childRows.map((r) => ({
          table_name: 'child_vaccination_records',
          record_id: r.id,
          action: 'archive',
          performed_by: performedBy,
          new_value: {
            file: archiveFilePath(cairoMonthKey(r.created_at)),
            cutoff_month: cutoffMonthKey,
          },
        }))
      )
      // 6) ضبط علامة الأرشفة (بعد نجاح الرفع والتسجيل)
      await admin
        .from('child_vaccination_records')
        .update({ archived_at: new Date().toISOString() } as never)
        .lt('created_at', cutoff)
        .is('archived_at', null)
        .eq('is_deleted', false)
      archivedChildren = childRows.length
    }

    if (batchRows.length > 0) {
      await upsertArchiveEntries(batchRows, 'batch')
      await insertAuditChunks(
        admin,
        batchRows.map((r) => ({
          table_name: 'vaccine_batches',
          record_id: r.id,
          action: 'archive',
          performed_by: performedBy,
          new_value: {
            file: archiveFilePath(cairoMonthKey(r.created_at)),
            cutoff_month: cutoffMonthKey,
          },
        }))
      )
      await admin
        .from('vaccine_batches')
        .update({ archived_at: new Date().toISOString() } as never)
        .lt('created_at', cutoff)
        .is('archived_at', null)
      archivedBatches = batchRows.length
    }

    return NextResponse.json({
      success: true,
      cutoff: archiveCutoffExclusiveUtc(),
      cutoff_month: cutoffMonthKey,
      archived_children: archivedChildren,
      archived_batches: archivedBatches,
      rotated_files: rotation.rotated,
      storage_usage_bytes: rotation.current_usage_bytes,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
