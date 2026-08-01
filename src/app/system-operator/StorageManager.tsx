"use client"

import { useState, useEffect, useCallback } from "react"

interface TableStat {
  schemaname: string
  table_name: string
  approx_rows: number
  size_bytes: number
  size_pretty: string
}

interface StorageData {
  total_pretty: string
  total_bytes: number
  tables: TableStat[]
}

interface Settings {
  auto_cleanup_enabled: boolean
  auto_cleanup_threshold_bytes: number
  auto_cleanup_delete_amount: number
}

const FREE_TIER_BYTES = 500 * 1024 * 1024

export default function StorageManager() {
  const [storage, setStorage] = useState<StorageData | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // حقول حذف سجلات الأطفال
  const [childFrom, setChildFrom] = useState("")
  const [childTo, setChildTo] = useState("")
  // حقول حذف الدفعات
  const [batchFrom, setBatchFrom] = useState("")
  const [batchTo, setBatchTo] = useState("")

  // إعدادات التنظيف التلقائي
  const [enabled, setEnabled] = useState(false)
  const [thresholdMb, setThresholdMb] = useState("")
  const [deleteAmount, setDeleteAmount] = useState("")

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [stRes, stRes2] = await Promise.all([
        fetch('/api/system/storage'),
        fetch('/api/system/settings'),
      ])
      if (!stRes.ok) throw new Error((await stRes.json()).error ?? 'فشل في جلب بيانات التخزين')
      if (!stRes2.ok) throw new Error((await stRes2.json()).error ?? 'فشل في جلب الإعدادات')
      const st = await stRes.json()
      const s = await stRes2.json()
      setStorage(st)
      setSettings(s)
      setEnabled(s.auto_cleanup_enabled)
      setThresholdMb(Math.round(s.auto_cleanup_threshold_bytes / (1024 * 1024)).toString())
      setDeleteAmount(s.auto_cleanup_delete_amount.toString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function previewDelete(type: 'children' | 'batches', from: string, to: string) {
    setMessage(null)
    const res = await fetch('/api/system/delete-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, dateFrom: from, dateTo: to, preview: true }),
    })
    const data = await res.json()
    if (!res.ok) { setMessage({ ok: false, text: data.error ?? 'خطأ' }); return }
    if (type === 'children') {
      setMessage({ ok: true, text: `عدد سجلات الأطفال في الفترة المحددة: ${data.children}` })
    } else {
      setMessage({ ok: true, text: `عدد الدفعات: ${data.batches} — عدد سجلات الأطفال المرتبطة بها: ${data.children}` })
    }
  }

  async function doDelete(type: 'children' | 'batches', from: string, to: string, label: string) {
    if (!window.confirm(`تحذير: سيتم حذف ${label} نهائيًا (لا يمكن التراجع). هل أنت متأكد؟`)) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/system/delete-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, dateFrom: from, dateTo: to }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage({ ok: false, text: data.error ?? 'خطأ' }); return }
      if (type === 'children') {
        setMessage({
          ok: true,
          text: `تم حذف ${data.deleted} سجلًا. ${data.spaceReclaimed ? 'تم استعادة المساحة.' : `تعذر استعادة المساحة: ${data.vacuumError ?? ''}`}`,
        })
      } else {
        setMessage({
          ok: true,
          text: `تم حذف ${data.deleted_children} سجل طفل و ${data.deleted_batches} دفعة. ${data.spaceReclaimed ? 'تم استعادة المساحة.' : `تعذر استعادة المساحة: ${data.vacuumError ?? ''}`}`,
        })
      }
      await loadAll()
    } finally {
      setBusy(false)
    }
  }

  async function saveSettings() {
    const mb = Number(thresholdMb)
    const amount = Number(deleteAmount)
    if (!Number.isFinite(mb) || mb <= 0) { setMessage({ ok: false, text: 'أدخل حد تخزين موجب بالميجابايت' }); return }
    if (!Number.isFinite(amount) || amount <= 0) { setMessage({ ok: false, text: 'أدخل عدد سجلات موجب' }); return }
    setBusy(true)
    setMessage(null)
    const res = await fetch('/api/system/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auto_cleanup_enabled: enabled,
        auto_cleanup_threshold_bytes: mb * 1024 * 1024,
        auto_cleanup_delete_amount: amount,
      }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setMessage({ ok: false, text: data.error ?? 'خطأ' }); return }
    setMessage({ ok: true, text: 'تم حفظ الإعدادات بنجاح' })
  }

  async function runCleanupNow() {
    setBusy(true)
    setMessage(null)
    const res = await fetch('/api/system/auto-cleanup')
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setMessage({ ok: false, text: data.error ?? 'خطأ' }); return }
    if (data.status === 'cleaned') {
      setMessage({ ok: true, text: `تم حذف ${data.deleted_records} سجلًا قديمًا. ${data.vacuum_ok ? 'تم استعادة المساحة.' : ''}` })
    } else if (data.status === 'skipped') {
      setMessage({ ok: true, text: 'الحجم الحالي أقل من الحد المحدد — لا حاجة للتنظيف' })
    } else {
      setMessage({ ok: true, text: 'التنظيف التلقائي معطّل حاليًا' })
    }
    await loadAll()
  }

  if (loading) return <p className="text-gray-500">جاري تحميل البيانات...</p>

  const usedPercent = storage ? Math.min(100, Math.round((storage.total_bytes / FREE_TIER_BYTES) * 1000) / 10) : 0

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 p-3 text-sm text-red-700 rounded-lg">{error}</div>}
      {message && (
        <div className={`p-3 text-sm rounded-lg ${message.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* 1) مراقبة التخزين */}
      {storage && (
        <div className="card p-4">
          <h3 className="font-semibold text-lg mb-3">استهلاك التخزين في قاعدة البيانات</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-teal-50 rounded-lg p-3">
              <div className="text-sm text-gray-500">إجمالي قاعدة البيانات</div>
              <div className="text-2xl font-bold">{storage.total_pretty}</div>
            </div>
            <div className="bg-teal-50 rounded-lg p-3">
              <div className="text-sm text-gray-500">النسبة من حد الباقة (500 ميجا)</div>
              <div className="text-2xl font-bold">{usedPercent}%</div>
            </div>
            <div className="bg-teal-50 rounded-lg p-3">
              <div className="text-sm text-gray-500">المتبقي تقريبًا</div>
              <div className="text-2xl font-bold">{((FREE_TIER_BYTES - storage.total_bytes) / (1024 * 1024)).toFixed(0)} ميجا</div>
            </div>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
            <div className={`h-full ${usedPercent > 80 ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${usedPercent}%` }} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-right">
                  <th className="py-2 px-3">الجدول</th>
                  <th className="py-2 px-3">الصفوف (تقريبي)</th>
                  <th className="py-2 px-3">الحجم</th>
                </tr>
              </thead>
              <tbody>
                {storage.tables.map(t => (
                  <tr key={`${t.schemaname}.${t.table_name}`} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3 font-mono text-xs">{t.schemaname}.{t.table_name}</td>
                    <td className="py-2 px-3">{t.approx_rows}</td>
                    <td className="py-2 px-3">{t.size_pretty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2) حذف سجلات الأطفال بنطاق زمني */}
      <div className="card p-4">
        <h3 className="font-semibold text-lg mb-1">حذف سجلات الأطفال بنطاق زمني</h3>
        <p className="text-xs text-gray-500 mb-3">يُحذف نهائيًا ما تم إدخاله في الفترة المحددة (على أساس تاريخ الإدخال) مع تسجيله في سجل التدقيق</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">من تاريخ</label>
            <input type="date" value={childFrom} onChange={e => setChildFrom(e.target.value)}
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">إلى تاريخ</label>
            <input type="date" value={childTo} onChange={e => setChildTo(e.target.value)}
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <button disabled={busy || !childFrom || !childTo}
            onClick={() => previewDelete('children', childFrom, childTo)}
            className="btn btn-secondary">
            معاينة العدد
          </button>
          <button disabled={busy || !childFrom || !childTo}
            onClick={() => doDelete('children', childFrom, childTo, 'سجلات الأطفال')}
            className="btn btn-danger">
            حذف نهائي
          </button>
        </div>
      </div>

      {/* 3) حذف الدفعات بنطاق زمني */}
      <div className="card p-4">
        <h3 className="font-semibold text-lg mb-1">حذف دفعات اللقاح بنطاق زمني</h3>
        <p className="text-xs text-gray-500 mb-3">يُحذف نهائيًا ما تمت إضافته في الفترة المحددة مع سجلات الأطفال المرتبطة بهذه الدفعات</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">من تاريخ</label>
            <input type="date" value={batchFrom} onChange={e => setBatchFrom(e.target.value)}
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">إلى تاريخ</label>
            <input type="date" value={batchTo} onChange={e => setBatchTo(e.target.value)}
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <button disabled={busy || !batchFrom || !batchTo}
            onClick={() => previewDelete('batches', batchFrom, batchTo)}
            className="btn btn-secondary">
            معاينة العدد
          </button>
          <button disabled={busy || !batchFrom || !batchTo}
            onClick={() => doDelete('batches', batchFrom, batchTo, 'الدفعات')}
            className="btn btn-danger">
            حذف نهائي
          </button>
        </div>
      </div>

      {/* 4) التنظيف التلقائي */}
      <div className="card p-4">
        <h3 className="font-semibold text-lg mb-3">التنظيف التلقائي</h3>
        <div className="space-y-3 max-w-lg">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}
              className="rounded border-gray-300" />
            تفعيل الحذف التلقائي عند تجاوز حد التخزين
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">حد التخزين (ميجابايت)</label>
              <input type="number" min="1" value={thresholdMb} onChange={e => setThresholdMb(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">عدد السجلات المحذوفة في كل تشغيل</label>
              <input type="number" min="1" value={deleteAmount} onChange={e => setDeleteAmount(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            عند تجاوز الحد، تُحذف أقدم سجلات الأطفال بالعدد المحدد في كل تشغيل للمؤقت اليومي (Vercel Cron).
          </p>
          <div className="flex gap-3">
            <button disabled={busy} onClick={saveSettings}
              className="btn btn-primary">
              حفظ الإعدادات
            </button>
            <button disabled={busy} onClick={runCleanupNow}
              className="btn btn-warning">
              تشغيل التنظيف الآن
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
