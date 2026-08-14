"use client"

import { useEffect, useState, useCallback } from "react"
import { FolderArchive, Trash2, Save, X, Loader2 } from "lucide-react"
import { cairoToday } from "@/lib/time"
import { formatCairoDate } from "@/lib/time"

// مكوّن شاشة الأرشيف الشهري (يُستدعى من /archives):
//  - moh_admin: مراجعة شهر (إن كان حيًّا في الداتا بيز يُنبه بالعرض من التقارير)،
//    وعند غيابه يُسترجَع من الأرشيف مؤقتًا للعرض/التعديل، ويُحفظ عند الإغلاق.
//  - system_operator: نفس ذلك + حذف ملفات الأشهر يدويًا.

interface ArchiveFileInfo {
  name: string
  month: string
  sizeBytes: number
  updatedAt: string | null
  month_has_live_rows: boolean
}

interface ReviewRecord {
  id: string
  record_id: string
  kind: "child" | "batch"
  original_data: Record<string, unknown>
  current_data: Record<string, unknown>
}

interface OpenReviewSession {
  id: string
  month_key: string
  opened_at: string
  records: ReviewRecord[]
}

// الحقول القابلة للتعديل في شاشة المراجعة (ضمن نطاق الأرشيف فقط)
const CHILD_EDITABLE: Array<{ key: string; label: string }> = [
  { key: "child_full_name", label: "اسم الطفل" },
  { key: "father_first_name", label: "اسم الأب" },
  { key: "father_grandfather_name", label: "اسم الجد (الأب)" },
  { key: "father_national_id", label: "الرقم القومي للأب" },
  { key: "mother_first_name", label: "اسم الأم" },
  { key: "mother_grandfather_name", label: "اسم الجد (الأم)" },
  { key: "mother_national_id", label: "الرقم القومي للأم" },
  { key: "birth_date", label: "تاريخ الميلاد" },
  { key: "vaccination_date", label: "تاريخ التطعيم" },
]

const BATCH_EDITABLE: Array<{ key: string; label: string }> = [
  { key: "batch_number", label: "رقم التشغيلة" },
  { key: "quantity", label: "الكمية" },
  { key: "delivery_date", label: "تاريخ الدخول" },
  { key: "expiry_date", label: "تاريخ الصلاحية" },
  { key: "notes", label: "ملاحظات" },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function todayParts(): { year: number; month: number } {
  const [y, m] = cairoToday().split("-")
  return { year: Number(y), month: Number(m) }
}

export default function ArchiveBrowser({ role }: { role: string }) {
  const canDelete = role === "system_operator"
  const [files, setFiles] = useState<ArchiveFileInfo[]>([])
  const [session, setSession] = useState<OpenReviewSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null)
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const today = todayParts()
  const [year, setYear] = useState(today.year)
  const [month, setMonth] = useState(today.month)

  const refreshFiles = useCallback(() => {
    return fetch("/api/system/archive/files")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        setFiles(j?.files ?? [])
      })
      .catch(() => undefined)
  }, [])

  // استئناف أي جلسة مراجعة مفتوحة (بعد إعادة التحميل)
  const loadOpenSession = useCallback(() => {
    return fetch("/api/archive/review")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.session) {
          setSession(j.session)
          setYear(Number(j.session.month_key.slice(0, 4)))
          setMonth(Number(j.session.month_key.slice(5, 7)))
        }
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    refreshFiles()
    loadOpenSession()
  }, [refreshFiles, loadOpenSession])

  function fieldValue(rec: ReviewRecord, key: string): string {
    const v = edits[rec.id]?.[key]
    if (v !== undefined) return v
    const raw = rec.current_data[key]
    if (raw === null || raw === undefined) return ""
    return String(raw)
  }

  function setField(rec: ReviewRecord, key: string, value: string) {
    setEdits((prev) => ({ ...prev, [rec.id]: { ...(prev[rec.id] ?? {}), [key]: value } }))
  }

  async function handleStartReview() {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch("/api/archive/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month }),
      })
      const j = await res.json()
      if (!res.ok) {
        setMessage({ kind: "error", text: j.error ?? "فشل بدء المراجعة" })
        return
      }
      if (j.status === "in_db") {
        setMessage({
          kind: "info",
          text: `بيانات شهر ${j.liveCount} سجل ما زالت موجودة في النظام — لا حاجة لفتح الأرشيف، اطلّع عليها من شاشة التقارير العادية.`,
        })
      } else if (j.status === "no_file") {
        setMessage({ kind: "info", text: "لا توجد بيانات مؤرشف لهذا الشهر." })
      } else if (j.status === "reviewing") {
        setMessage(null)
        const sessionRes = await fetch("/api/archive/review")
        const s = await sessionRes.json()
        setSession(s.session ?? null)
        setEdits({})
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(rec: ReviewRecord) {
    if (!session) return
    setSavingId(rec.id)
    setMessage(null)
    try {
      const draft = { ...rec.current_data }
      for (const field of rec.kind === "child" ? CHILD_EDITABLE : BATCH_EDITABLE) {
        const v = edits[rec.id]?.[field.key]
        if (v !== undefined) draft[field.key] = v
      }
      const res = await fetch(`/api/archive/review/${rec.record_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, data: draft }),
      })
      const j = await res.json()
      if (!res.ok) {
        setMessage({ kind: "error", text: j.error ?? "فشل حفظ التعديل" })
        return
      }
      // تحديث البيانات المحلية ومسح التعديلات المحفوظة
      setSession((prev) =>
        prev
          ? {
              ...prev,
              records: prev.records.map((r) => (r.id === rec.id ? { ...r, current_data: draft } : r)),
            }
          : prev
      )
      setEdits((prev) => {
        const next = { ...prev }
        delete next[rec.id]
        return next
      })
      setMessage({ kind: "info", text: "تم حفظ التعديل في الأرشيف." })
    } finally {
      setSavingId(null)
    }
  }

  async function handleCloseReview() {
    if (!session) return
    if (!window.confirm("إغلاق جلسة المراجعة؟ سيُحفظ الأرشيف بالتعديلات وتُغلق الشاشة.")) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch("/api/archive/review/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      })
      const j = await res.json()
      if (!res.ok) {
        setMessage({ kind: "error", text: j.error ?? "فشل إغلاق الجلسة" })
        return
      }
      setSession(null)
      setEdits({})
      setMessage({ kind: "info", text: `حُفظ الأرشيف (${j.children} طفل، ${j.batches} دفعة).` })
      await refreshFiles()
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteFile(file: ArchiveFileInfo) {
    const firstConfirm = window.confirm(`حذف ملف أرشيف شهر ${file.month} نهائيًا؟`)
    if (!firstConfirm) return
    let confirmFlag = true
    // إن كان الملف النسخة الوحيدة يُطلب تأكيد ثانٍ صريح
    const res0 = await fetch("/api/system/archive/file", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: file.month }),
    })
    if (res0.status === 409) {
      const j0 = await res0.json()
      setMessage({ kind: "error", text: j0.error ?? "" })
      confirmFlag = window.confirm(
        `تحذير: هذا الملف هو النسخة الوحيدة لبيانات شهر ${file.month}. هل أنت متأكد تمامًا من حذفه؟`
      )
      if (!confirmFlag) return
    }
    const res = await fetch("/api/system/archive/file", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: file.month, confirm: confirmFlag }),
    })
    const j = await res.json()
    if (!res.ok) {
      setMessage({ kind: "error", text: j.error ?? "فشل حذف الملف" })
      return
    }
    setMessage({ kind: "info", text: `حُذف ملف شهر ${file.month}.` })
    await refreshFiles()
  }

  const childCount = session?.records.filter((r) => r.kind === "child").length ?? 0
  const batchCount = session?.records.filter((r) => r.kind === "batch").length ?? 0

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.kind === "error" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* اختيار الشهر للمراجعة */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">السنة</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {Array.from({ length: today.year - 2019 }, (_, i) => today.year - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">الشهر</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>
        <button onClick={handleStartReview} disabled={loading} className="btn btn-primary">
          {loading ? <Loader2 className="animate-spin" size={16} /> : <FolderArchive size={16} />}
          {session ? "فتح شهر آخر" : "مراجعة الأرشيف"}
        </button>
      </div>

      {/* قائمة ملفات الأرشيف */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">ملفات الأرشيف الشهري</h3>
          <span className="text-sm text-gray-500">{files.length} شهر</span>
        </div>
        {files.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">لا توجد ملفات أرشيف بعد (تُنشأ تلقائيًا شهريًا).</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-right">
                  <th className="py-3 px-4 font-semibold">الشهر</th>
                  <th className="py-3 px-4 font-semibold">الحجم</th>
                  <th className="py-3 px-4 font-semibold">آخر تحديث</th>
                  <th className="py-3 px-4 font-semibold">الحالة</th>
                  {canDelete && <th className="py-3 px-4 font-semibold">إدارة</th>}
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.month} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{f.month}</td>
                    <td className="py-3 px-4">{formatBytes(f.sizeBytes)}</td>
                    <td className="py-3 px-4">{formatCairoDate(f.updatedAt)}</td>
                    <td className="py-3 px-4">
                      {f.month_has_live_rows ? (
                        <span className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">سجلات ما زالت في النظام</span>
                      ) : (
                        <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">النسخة الوحيدة</span>
                      )}
                    </td>
                    {canDelete && (
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleDeleteFile(f)}
                          className="btn btn-danger px-2 py-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* جلسة المراجعة المفتوحة */}
      {session && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">
              مراجعة شهر {session.month_key} — {childCount} طفل، {batchCount} دفعة
            </h3>
            <button onClick={handleCloseReview} disabled={loading} className="btn btn-danger">
              {loading ? <Loader2 className="animate-spin" size={16} /> : <X size={16} />}
              إغلاق وحفظ
            </button>
          </div>

          {session.records.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">لا توجد سجلات في هذا الشهر.</div>
          ) : (
            <div className="space-y-6 p-4">
              {/* الأطفال */}
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">سجلات الأطفال</h4>
                <div className="space-y-3">
                  {session.records.filter((r) => r.kind === "child").map((rec) => (
                    <div key={rec.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          {String(rec.current_data.child_full_name ?? "") || "طفل"}
                        </span>
                        <button
                          onClick={() => handleSave(rec)}
                          disabled={savingId === rec.id}
                          className="btn btn-primary px-2 py-1"
                        >
                          {savingId === rec.id ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                          حفظ
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {CHILD_EDITABLE.map((f) => (
                          <div key={f.key}>
                            <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                            <input
                              value={fieldValue(rec, f.key)}
                              onChange={(e) => setField(rec, f.key, e.target.value)}
                              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* الدفعات */}
              {session.records.some((r) => r.kind === "batch") && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">الدفعات</h4>
                  <div className="space-y-3">
                    {session.records.filter((r) => r.kind === "batch").map((rec) => (
                      <div key={rec.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">
                            {String(rec.current_data.batch_number ?? "") || "دفعة"}
                          </span>
                          <button
                            onClick={() => handleSave(rec)}
                            disabled={savingId === rec.id}
                            className="btn btn-primary px-2 py-1"
                          >
                            {savingId === rec.id ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                            حفظ
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {BATCH_EDITABLE.map((f) => (
                            <div key={f.key}>
                              <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                              <input
                                value={fieldValue(rec, f.key)}
                                onChange={(e) => setField(rec, f.key, e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
