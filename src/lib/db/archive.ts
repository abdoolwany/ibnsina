import { createHash } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'
import {
  archiveCutoffMonthKey,
  cairoMonthKey,
} from '@/lib/time'

// واجهة مصغرة لخدمة التخزين (supabase-js Storage API) نستخدمها للتحويل
// من النوع الفعلي إلى واجهة محدودة بدون أي — لتجنّب كشف `any` هنا.
interface ArchiveStorage {
  createBucket: (name: string, opts?: { public?: boolean }) => Promise<{ error: { message?: string } | null }>
  from: (bucket: string) => {
    list: (folder: string, opts?: { sortBy?: { column: string; order: 'asc' | 'desc' } }) => Promise<{
      data: Array<{ name: string; metadata: { size?: number } | null; updated_at?: string | null }> | null
      error: { message?: string } | null
    }>
    download: (path: string) => Promise<{ data: Blob | null; error: { message?: string } | null }>
    upload: (path: string, body: string, opts?: { contentType: string; upsert: boolean }) => Promise<{
      error: { message?: string } | null
    }>
    remove: (paths: string[]) => Promise<{ error: { message?: string } | null }>
  }
}

// ============================================================
// طبقة الوصول للأرشيف الشهري (عبر service role — كلها من الخادم)
// ============================================================
// المبدأ المعتمد (القسم 3/7 من المواصفات + قرار المراجعة):
//   الداتا بيز هي المرجع أثناء وجود النسختين، والملف لا يُكتب إلا
//   في لحظات نادرة: الأرشفة الشهرية، لحظة الحذف (تسليم آخر حالة)،
//   وحفظ تعديلات شاشة المراجعة. لا مزامنة عند كل تعديل إطلاقًا
//   حتى لا نستنزف موارد الخطة المجانية.
//
// الكتابة دائماً upsert لكل سجل حسب id، ولا نعيد بناء ملف شهر كاملًا
// من الداتا بيز بعد أن يبدأ الحذف منه (وإلا فُقدت سجلات محذوفة بصمت).

export const ARCHIVE_BUCKET = 'monthly-archives'
export const ARCHIVE_FOLDER = 'archives'
// جدول ملفات الأرشيف: الداتا بيز هي مصدر الحقيقة للمزج (قراءة/كتابة
// فورية متسقة)، والملف في التخزين نسخة طبقية (mirror) للنسخ الاحتياطي.
// راجع الترحيل 38 — سبب هذا القرار موثق هناك.
export const ARCHIVE_FILES_TABLE = 'archive_month_files'
export const ARCHIVE_ROTATION_THRESHOLD_KEY = 'archive_rotation_threshold_bytes'
export const DEFAULT_ARCHIVE_ROTATION_THRESHOLD_BYTES = 900 * 1024 * 1024

export type ArchiveRecordKind = 'child' | 'batch'

/** بنية ملف الأرشيف الشهري (واحد لكل شهر بصيغة YYYY-MM) */
export interface ArchiveFileContent {
  month: string
  generated_at: string
  children: Record<string, unknown>[]
  batches: Record<string, unknown>[]
}

export interface ArchiveFileInfo {
  name: string // archives/YYYY-MM.json
  month: string // YYYY-MM
  sizeBytes: number
  updatedAt: string | null
}

/** مسار ملف شهر داخل الحاوية */
export function archiveFilePath(monthKey: string): string {
  return `${ARCHIVE_FOLDER}/${monthKey}.json`
}

/** اشتقاق UUID ثابت من مفتاح نصي (لأحداث التدقيق المتعلقة بالملفات
 *  حيث record_id إلزامي في audit_log وغير nullable). */
export function uuidFromKey(key: string): string {
  const h = createHash('md5').update(key).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** إنشاء الحاوية عند غيابها (عبر service role) — خاصة (private) بلا روابط عامة */
export async function ensureArchiveBucket(storage: ArchiveStorage): Promise<void> {
  const { error } = await storage.createBucket(ARCHIVE_BUCKET, { public: false })
  if (error && !/already exists/i.test(error.message ?? '')) {
    throw new Error(`فشل إنشاء حاوية الأرشيف: ${error.message}`)
  }
}

/** قراءة حجم التخزين الإجمالي من مقاييس النظام (دالة get_system_metrics) */
export async function getStorageUsageBytes(): Promise<number> {
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.rpc('get_system_metrics')
  if (error) throw new Error(`فشل قراءة حجم التخزين: ${error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any)?.storage_bytes ?? 0
}

/** قائمة ملفات الأرشيف مرتبة من الأقدم (FIFO للدوران).
 *  تُقرأ من جدول archive_month_files (مصدر الحقيقة) وليس من قائمة
 *  التخزين — لأن أسماء كائنات التخزين تُعاد نسبيًا بلا البادئة،
 *  ولتفادي التناسق المؤجل في القراءة من S3. */
export async function listArchiveFiles(): Promise<ArchiveFileInfo[]> {
  const admin = await createServiceRoleClient()
  const { data, error } = await admin
    .from(ARCHIVE_FILES_TABLE)
    .select('month_key, content, updated_at')
    .order('month_key', { ascending: true })
  if (error) throw new Error(`فشل قراءة ملفات الأرشيف: ${error.message}`)

  const files: ArchiveFileInfo[] = []
  for (const row of data ?? []) {
    const content = (row.content ?? {}) as Partial<ArchiveFileContent>
    const sizeBytes = JSON.stringify(content).length
    files.push({
      name: archiveFilePath(row.month_key),
      month: row.month_key,
      sizeBytes,
      updatedAt: row.updated_at ?? null,
    })
  }
  return files
}

/** قراءة محتوى ملف شهر (أو null إن لم يوجد).
 *  مصدر الحقيقة هو جدول archive_month_files. الرجوع إلى نسخة التخزين
 *  يكون فقط للأشهر القديمة (قبل الترحيل 38) التي لا يوجد لها صف بعد. */
export async function readArchiveFile(monthKey: string): Promise<ArchiveFileContent | null> {
  const admin = await createServiceRoleClient()
  const { data, error } = await admin
    .from(ARCHIVE_FILES_TABLE)
    .select('content')
    .eq('month_key', monthKey)
    .maybeSingle()
  if (error) throw new Error(`فشل قراءة ملف الأرشيف: ${error.message}`)

  if (data?.content) {
    const parsed = data.content as Partial<ArchiveFileContent>
    return {
      month: monthKey,
      generated_at: parsed.generated_at ?? new Date().toISOString(),
      children: Array.isArray(parsed.children) ? (parsed.children as Record<string, unknown>[]) : [],
      batches: Array.isArray(parsed.batches) ? (parsed.batches as Record<string, unknown>[]) : [],
    }
  }

  // رجوع احتياطي لنسخة التخزين القديمة (قبل 38)
  const storage = admin.storage as unknown as ArchiveStorage
  const path = archiveFilePath(monthKey)
  const dl = await storage.from(ARCHIVE_BUCKET).download(path)
  if (dl.error) {
    if (/not found|does not exist|404/i.test(dl.error.message ?? '')) return null
    throw new Error(`فشل قراءة ملف الأرشيف: ${dl.error.message}`)
  }
  if (!dl.data) return null
  const text = await dl.data.text()
  if (!text) return null
  const parsed = JSON.parse(text) as Partial<ArchiveFileContent>
  return {
    month: monthKey,
    generated_at: parsed.generated_at ?? new Date().toISOString(),
    children: Array.isArray(parsed.children) ? (parsed.children as Record<string, unknown>[]) : [],
    batches: Array.isArray(parsed.batches) ? (parsed.batches as Record<string, unknown>[]) : [],
  }
}

/** كتابة محتوى ملف شهر: أولًا في جدول archive_month_files (مصدر الحقيقة —
 *  فشلها يوقف العملية)، ثم تحديث نسخة التخزين الطبقية (فشلها لا يمنع
 *  الحفظ لأن الداتا بيز متسقة فوريًا). */
export async function writeArchiveFile(monthKey: string, content: ArchiveFileContent): Promise<void> {
  const admin = await createServiceRoleClient()
  const { error: dbErr } = await admin.from(ARCHIVE_FILES_TABLE).upsert(
    {
      month_key: monthKey,
      content: content as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'month_key' }
  )
  if (dbErr) throw new Error(`فشل حفظ ملف الأرشيف (${monthKey}): ${dbErr.message}`)

  // نسخة طبقية خارجية — تُرفع بعد حفظ الداتا بيز، ولا تُفشل العملية
  const storage = admin.storage as unknown as ArchiveStorage
  try {
    await ensureArchiveBucket(storage)
    const path = archiveFilePath(monthKey)
    const { error } = await storage.from(ARCHIVE_BUCKET).upload(path, JSON.stringify(content), {
      contentType: 'application/json',
      upsert: true,
    })
    if (error) throw new Error(error.message)
  } catch (e) {
    console.error(`فشل تحديث نسخة التخزين للأرشيف (${monthKey}):`, e)
  }
}

/** إدراج/استبدال إدخالات سجلات في ملفات أشهرها حسب created_at.
 *  تُستخدم في: الأرشفة الشهرية، تسليم الحالة النهائية عند الحذف، المراجعة.
 *  الصفوف المتوقعة: كائنات كاملة (الصف من الداتا بيز). */
export async function upsertArchiveEntries(
  rows: Record<string, unknown>[],
  kind: ArchiveRecordKind
): Promise<void> {
  if (rows.length === 0) return

  // تجميع الصفوف حسب شهر created_at (توقيت القاهرة)
  const byMonth = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    const created = String(row.created_at ?? '')
    const month = created ? cairoMonthKey(created) : ''
    if (!month) continue
    const list = byMonth.get(month) ?? []
    list.push(row)
    byMonth.set(month, list)
  }

  for (const [month, monthRows] of byMonth) {
    const content = (await readArchiveFile(month)) ?? {
      month,
      generated_at: new Date().toISOString(),
      children: [],
      batches: [],
    }
    const target = kind === 'child' ? content.children : content.batches
    const byId = new Map(target.map((e) => [String(e.id), e]))
    for (const row of monthRows) {
      if (!row.id) continue
      byId.set(String(row.id), row)
    }
    if (kind === 'child') content.children = Array.from(byId.values())
    else content.batches = Array.from(byId.values())
    content.generated_at = new Date().toISOString()
    await writeArchiveFile(month, content)
  }
}

/** إثراء صفوف الأطفال بأسماء العرض (المستشفى، القائم بالتطعيم، الدفعة)
 *  حتى يحمل ملف الأرشيف كل ما تحتاجه شاشة المراجعة دون وصلات لاحقة. */
export async function enrichChildRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[]
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return []
  const admin = await createServiceRoleClient()
  const ids = rows.map((r) => r.id)
  const { data } = await (admin
    .from('child_vaccination_records')
    .select('id, hospitals(name), vaccine_batches(batch_number, delivery_date, expiry_date), vaccinators(full_name)')
    .in('id', ids) as unknown as Promise<{
    data: Array<{
      id: string
      hospitals: { name: string | null } | null
      vaccine_batches: { batch_number: string | null; delivery_date: string | null; expiry_date: string | null } | null
      vaccinators: { full_name: string | null } | null
    }> | null
  }>)
  const extra = new Map<string, { _hospital_name: string | null; _batch_number: string | null; _batch_delivery_date: string | null; _batch_expiry_date: string | null; _vaccinator_name: string | null }>()
  for (const row of data ?? []) {
    extra.set(row.id, {
      _hospital_name: row.hospitals?.name ?? null,
      _batch_number: row.vaccine_batches?.batch_number ?? null,
      _batch_delivery_date: row.vaccine_batches?.delivery_date ?? null,
      _batch_expiry_date: row.vaccine_batches?.expiry_date ?? null,
      _vaccinator_name: row.vaccinators?.full_name ?? null,
    })
  }
  return rows.map((r) => ({ ...r, ...(extra.get(r.id) ?? {}) }))
}

/** تسليم الحالة النهائية قبل الحذف: لأي صف مؤهل (مؤرشف مسبقًا أو أقدم
 *  من حد الأقدمية) يُدرج آخر حالته في ملف شهره. عند فشل أي رفع تُرمى
 *  Exception فيُلغى الحذف كاملًا (لا يُحذف سجل بلا نسخة محدثة). */
export async function archiveBeforeDelete(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  kind: ArchiveRecordKind
): Promise<void> {
  if (rows.length === 0) return
  const cutoffKey = archiveCutoffMonthKey()
  const eligible = rows.filter((r) => {
    if (!r?.created_at) return false
    return r.archived_at != null || cairoMonthKey(r.created_at) <= cutoffKey
  })
  if (eligible.length === 0) return

  // إثراء سجلات الأطفال باسماء العرض قبل التخزين
  const enriched = kind === 'child' ? await enrichChildRows(eligible) : eligible
  await upsertArchiveEntries(enriched, kind)
}

/** الدوران التلقائي FIFO: عند تجاوز حد التخزين يحذف أقدم ملفات الأشهر
 *  حتى النزول تحت العتبة، مع تسجيل كل عملية في audit_log. */
export async function enforceArchiveRotation(
  performedBy: string | null
): Promise<{ rotated: string[]; current_usage_bytes: number; threshold_bytes: number }> {
  const admin = await createServiceRoleClient()
  const { data: settingsRows } = await admin.from('system_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) settings[row.key] = row.value

  const rawThreshold = settings[ARCHIVE_ROTATION_THRESHOLD_KEY]
  const threshold = Number.isFinite(Number(rawThreshold)) && Number(rawThreshold) > 0
    ? Number(rawThreshold)
    : DEFAULT_ARCHIVE_ROTATION_THRESHOLD_BYTES

  let usage = await getStorageUsageBytes()
  if (usage <= threshold) {
    return { rotated: [], current_usage_bytes: usage, threshold_bytes: threshold }
  }

  const files = await listArchiveFiles()
  const rotated: string[] = []
  const storage = admin.storage as unknown as ArchiveStorage
  for (const f of files) {
    if (usage <= threshold) break
    const { error } = await storage.from(ARCHIVE_BUCKET).remove([f.name])
    if (error) throw new Error(`فشل حذف ملف أرشيف قديم (${f.name}): ${error.message}`)
    // حذف صف مصدر الحقيقة المقابل في الداتا بيز
    const { error: dbErr } = await admin.from(ARCHIVE_FILES_TABLE).delete().eq('month_key', f.month)
    if (dbErr) throw new Error(`فشل حذف سجل الأرشيف (${f.month}): ${dbErr.message}`)
    usage = Math.max(0, usage - f.sizeBytes)
    rotated.push(f.name)
    await admin.from('audit_log').insert({
      table_name: 'storage.objects',
      record_id: uuidFromKey(f.name),
      action: 'archive_rotate',
      performed_by: performedBy,
      new_value: { file: f.name, month: f.month, reason: 'تجاوز حد التخزين' },
    } as never)
  }

  return { rotated, current_usage_bytes: usage, threshold_bytes: threshold }
}

/** حذف ملف شهر يدويًا (system_operator) مع فحص "النسخة الوحيدة".
 *  يرجع { warnedOnlyCopy } ليحذر الواجهة قبل التأكيد. */
export async function deleteArchiveFileManually(
  monthKey: string,
  performedBy: string | null
): Promise<{ deleted: boolean; onlyCopy: boolean }> {
  const admin = await createServiceRoleClient()

  // هل يتبقى في الداتا بيز أي سجلات حية من هذا الشهر؟
  const fromTS = `${monthKey}-01T00:00:00Z`
  const toTS = `${monthKey}-31T23:59:59Z`
  const { count } = await admin
    .from('child_vaccination_records')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', fromTS)
    .lt('created_at', toTS)
  const onlyCopy = (count ?? 0) === 0

  // حذف نسخة التخزين الطبقية ثم صف مصدر الحقيقة في الداتا بيز
  const path = archiveFilePath(monthKey)
  const storage = admin.storage as unknown as ArchiveStorage
  const { error } = await storage.from(ARCHIVE_BUCKET).remove([path])
  if (error) throw new Error(`فشل حذف ملف الأرشيف: ${error.message}`)

  const { error: dbErr } = await admin.from(ARCHIVE_FILES_TABLE).delete().eq('month_key', monthKey)
  if (dbErr) throw new Error(`فشل حذف سجل الأرشيف (${monthKey}): ${dbErr.message}`)

  await admin.from('audit_log').insert({
    table_name: 'storage.objects',
    record_id: uuidFromKey(path),
    action: 'archive_delete',
    performed_by: performedBy,
    new_value: { file: path, month: monthKey, only_copy: onlyCopy },
  } as never)

  return { deleted: true, onlyCopy }
}

/** التحقق من صحة مفتاح شهر (YYYY-MM) — حماية من إدخال مسارات عشوائية */
export function isValidMonthKey(monthKey: string): boolean {
  return /^\d{4}-\d{2}$/.test(monthKey)
}
