import { createServiceRoleClient } from '@/lib/supabase/server'
import { cairoDayStartUtc, shiftMonth } from '@/lib/time'
import {
  readArchiveFile,
  writeArchiveFile,
  enforceArchiveRotation,
} from './archive'

// ============================================================
// جلسات المراجعة المؤقتة (استرجاع شهر من الأرشيف للعرض/التعديل)
// ============================================================
// القاعدة: لا تُدرج أي بيانات في الجداول الحية أبدًا — تُنقل بيانات
// الأرشيف إلى جدولين مؤقتين (archive_review_sessions/archive_review_records)
// ثم عند إغلاق الشاشة يُعاد بناء ملف الأرشيف بالبيانات المعدلة ويُحذف
// محتوى الجدولين. (السبب: كسر FK للأرقام المسلسلة و batch_balance_view)

export interface OpenReviewSession {
  id: string
  month_key: string
  opened_at: string
  records: Array<{
    id: string
    record_id: string
    kind: 'child' | 'batch'
    original_data: Record<string, unknown>
    current_data: Record<string, unknown>
  }>
}

/** نتيجة بدء جلسة مراجعة لشهر معين */
export type StartReviewResult =
  | { status: 'in_db'; liveCount: number }
  | { status: 'no_file' }
  | { status: 'reviewing'; sessionId: string; monthKey: string; childrenCount: number; batchesCount: number }

/** حدود UTC الشهرية الدقيقة لشهر قاهرة معين (للتحقق من وجوده حيًّا في الداتا بيز) */
function monthUtcRange(year: number, month: number): { from: string; to: string } {
  const from = cairoDayStartUtc(`${year}-${String(month).padStart(2, '0')}-01`)
  const next = shiftMonth(year, month, 1)
  const to = cairoDayStartUtc(`${next.year}-${String(next.month).padStart(2, '0')}-01`)
  return { from, to }
}

/** بدء جلسة مراجعة: يفحص الشهر في الداتا بيز أولًا، ثم في الأرشيف */
export async function startArchiveReview(
  userId: string,
  year: number,
  month: number
): Promise<StartReviewResult> {
  const admin = await createServiceRoleClient()
  const monthKey = `${year}-${String(month).padStart(2, '0')}`

  // جلسة مفتوحة واحدة فقط على مستوى النظام (فهرس فريد جزئي)
  const { data: openSession } = await admin
    .from('archive_review_sessions')
    .select('id')
    .eq('status', 'open')
    .maybeSingle()
  if (openSession) {
    throw new Error('توجد جلسة مراجعة مفتوحة بالفعل — أغلقها أولًا')
  }

  // الشهر ما زال موجودًا في الداتا بيز؟ → يُعرض من التقارير العادية
  const { from, to } = monthUtcRange(year, month)
  const { count } = await admin
    .from('child_vaccination_records')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', from)
    .lt('created_at', to)
  if ((count ?? 0) > 0) {
    return { status: 'in_db', liveCount: count ?? 0 }
  }

  // غير موجود في الداتا بيز: اقرأ من الأرشيف
  const content = await readArchiveFile(monthKey)
  if (!content) {
    return { status: 'no_file' }
  }

  const { data: session, error: sessionErr } = await admin
    .from('archive_review_sessions')
    .insert({ month_key: monthKey, opened_by: userId } as never)
    .select('id')
    .single()
  if (sessionErr) throw new Error(sessionErr.message)

  const sessionId = session.id
  const records = [
    ...content.children.map((c) => ({ kind: 'child' as const, data: c })),
    ...content.batches.map((b) => ({ kind: 'batch' as const, data: b })),
  ]
  if (records.length > 0) {
    const { error: recErr } = await admin.from('archive_review_records').insert(
      records.map((r) => ({
        session_id: sessionId,
        record_id: String(r.data.id ?? ''),
        kind: r.kind,
        original_data: r.data,
        current_data: r.data,
      }))
    )
    if (recErr) throw new Error(recErr.message)
  }

  // تسجيل الاسترجاع المؤقت في سجل التدقيق
  await admin.from('audit_log').insert({
    table_name: 'archive_review_sessions',
    record_id: sessionId,
    action: 'archive_restore',
    performed_by: userId,
    new_value: { month: monthKey, records: records.length },
  } as never)

  return {
    status: 'reviewing',
    sessionId,
    monthKey,
    childrenCount: content.children.length,
    batchesCount: content.batches.length,
  }
}

/** تعديل سجل داخل جلسة مراجعة مفتوحة (يُسجَّل إجباريًا) */
export async function updateArchiveReviewRecord(
  sessionId: string,
  recordId: string,
  data: Record<string, unknown>,
  userId: string
): Promise<void> {
  const admin = await createServiceRoleClient()
  const { data: session } = await admin
    .from('archive_review_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .single()
  if (!session || session.status !== 'open') {
    throw new Error('جلسة المراجعة غير مفتوحة')
  }

  const { data: rec, error: selErr } = await admin
    .from('archive_review_records')
    .select('id, record_id, original_data, current_data')
    .eq('session_id', sessionId)
    .eq('record_id', recordId)
    .single()
  if (selErr) throw new Error('السجل غير موجود في جلسة المراجعة')

  const { error } = await admin
    .from('archive_review_records')
    .update({
      current_data: data,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', rec.id)
  if (error) throw new Error(error.message)

  await admin.from('audit_log').insert({
    table_name: 'archive_review_records',
    record_id: String(rec.record_id),
    action: 'archive_review_edit',
    performed_by: userId,
    old_value: rec.current_data,
    new_value: data,
  } as never)
}

/** إغلاق جلسة المراجعة: إعادة بناء ملف الشهر من البيانات المعدلة ثم حذف
 *  الجدولين المؤقتين — الأرشيف يبقى محفوظًا بالتعديلات، والداتا بيز لا تُلمس. */
export async function closeArchiveReview(
  userId: string,
  sessionId: string
): Promise<{ monthKey: string; children: number; batches: number }> {
  const admin = await createServiceRoleClient()

  const { data: session } = await admin
    .from('archive_review_sessions')
    .select('id, month_key, status')
    .eq('id', sessionId)
    .single()
  if (!session) throw new Error('جلسة المراجعة غير موجودة')
  if (session.status !== 'open') throw new Error('جلسة المراجعة مغلقة بالفعل')

  const { data: records } = await admin
    .from('archive_review_records')
    .select('kind, current_data')
    .eq('session_id', sessionId)

  const children = (records ?? [])
    .filter((r) => r.kind === 'child')
    .map((r) => r.current_data)
  const batches = (records ?? [])
    .filter((r) => r.kind === 'batch')
    .map((r) => r.current_data)

  await writeArchiveFile(session.month_key, {
    month: session.month_key,
    generated_at: new Date().toISOString(),
    children,
    batches,
  })

  // حذف محتوى الجلسة المؤقتة بعد حفظ الأرشيف
  await admin.from('archive_review_records').delete().eq('session_id', sessionId)
  await admin
    .from('archive_review_sessions')
    .update({ status: 'closed', closed_at: new Date().toISOString() } as never)
    .eq('id', sessionId)

  await admin.from('audit_log').insert({
    table_name: 'archive_review_sessions',
    record_id: sessionId,
    action: 'archive_review_close',
    performed_by: userId,
    new_value: { month: session.month_key, children: children.length, batches: batches.length },
  } as never)

  // فحص الدوران بعد الكتابة (يُرجع فورًا إن كان التخزين تحت العتبة)
  await enforceArchiveRotation(userId)

  return { monthKey: session.month_key, children: children.length, batches: batches.length }
}

/** جلب الجلسة المفتوحة حاليًا مع سجلاتها (لاستئناف العرض بعد إعادة التحميل) */
export async function getOpenArchiveReviewSession(): Promise<OpenReviewSession | null> {
  const admin = await createServiceRoleClient()
  const { data: session } = await admin
    .from('archive_review_sessions')
    .select('id, month_key, opened_at')
    .eq('status', 'open')
    .maybeSingle()
  if (!session) return null

  const { data: records } = await admin
    .from('archive_review_records')
    .select('id, record_id, kind, original_data, current_data')
    .eq('session_id', session.id)

  return {
    id: session.id,
    month_key: session.month_key,
    opened_at: session.opened_at,
    records: (records ?? []) as OpenReviewSession['records'],
  }
}
