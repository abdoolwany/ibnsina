"use client"

import { useState, useEffect, useCallback } from "react"
import type { Hospital } from "@/types/database"

interface SerialCounter { hospital_id: string; serial_month: number; serial_year: number; last_number: number }
interface SerialRelease { hospital_id: string; serial_month: number; serial_year: number; serial_number: number; reason: string | null }
interface SerialRecord { id: string; serial_number: number; child_full_name: string; is_verified: boolean }

type Modal =
  | { type: 'release'; number: number }
  | { type: 'change'; record: SerialRecord }
  | null

const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

function monthKey(y: number, m: number) { return `${y}-${m}` }

// دالة جلب تُرمي الأخطاء فيرسلها المستدعي؛ ولا تستدعي setState حتى تبقى
// المؤثرات خالية من التحديث المتزامن (نمط UserManager في نفس المشروع)
async function apiGet(url: string) {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'خطأ في التحميل')
  return data
}

export default function SerialManager({ hospitals }: { hospitals: Hospital[] }) {
  const [counters, setCounters] = useState<SerialCounter[]>([])
  const [releases, setReleases] = useState<SerialRelease[]>([])
  const [records, setRecords] = useState<SerialRecord[]>([])
  const [selectedHospital, setSelectedHospital] = useState<string>('')
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [loadingMonth, setLoadingMonth] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [modal, setModal] = useState<Modal>(null)

  // سبب إعادة الفتح (اختياري) وتغيير الرقم (إجباري)
  const [releaseReason, setReleaseReason] = useState("")
  const [changeReason, setChangeReason] = useState("")
  const [changeNumber, setChangeNumber] = useState("")

  const loadBasics = useCallback(() => {
    return apiGet('/api/admin/serials')
      .then(data => {
        setCounters(data.counters ?? [])
        setReleases(data.releases ?? [])
      })
  }, [])

  const loadRecords = useCallback((hospitalId: string, k: string) => {
    const [y, m] = k.split('-')
    return apiGet(`/api/admin/serials?hospital_id=${hospitalId}&month=${m}&year=${y}`)
      .then(data => setRecords(data.records ?? []))
  }, [])

  useEffect(() => {
    loadBasics()
      .catch(err => setError(err instanceof Error ? err.message : 'خطأ في التحميل'))
      .finally(() => setLoading(false))
  }, [loadBasics])

  // المؤثر لا يُحدِّث الحالة تزامنيًا: كل setState داخل .then/.catch/.finally
  useEffect(() => {
    if (!selectedHospital || !selectedMonth) return
    loadRecords(selectedHospital, selectedMonth)
      .catch(err => setError(err instanceof Error ? err.message : 'خطأ في تحميل الشهر'))
      .finally(() => setLoadingMonth(false))
  }, [selectedHospital, selectedMonth, loadRecords])

  const hospitalCounters = counters.filter(c => c.hospital_id === selectedHospital)
  const months = [...hospitalCounters].sort((a, b) => monthKey(b.serial_year, b.serial_month).localeCompare(monthKey(a.serial_year, a.serial_month)))
  const currentCounter = months.find(m => monthKey(m.serial_year, m.serial_month) === selectedMonth)

  function handleHospitalChange(id: string) {
    setSelectedHospital(id)
    setRecords([])
    setError("")
    setInfo("")
    const monthExists = counters.some(c => c.hospital_id === id && monthKey(c.serial_year, c.serial_month) === selectedMonth)
    if (!monthExists) setSelectedMonth('')
    setLoadingMonth(Boolean(id && selectedMonth && monthExists))
  }

  function handleMonthChange(k: string) {
    setSelectedMonth(k)
    setRecords([])
    setError("")
    setInfo("")
    setLoadingMonth(Boolean(k))
  }

  const releasedNumbers = new Set(
    releases
      .filter(r => r.hospital_id === selectedHospital && monthKey(r.serial_year, r.serial_month) === selectedMonth)
      .map(r => r.serial_number)
  )

  function recordFor(n: number): SerialRecord | undefined {
    return records.find(r => r.serial_number === n)
  }

  // الأرقام الحرة المتاحة للاختيار عند تغيير رقم (ضمن نطاق التسلسل + رقم تالٍ واحد)
  const freeNumbers: number[] = []
  if (currentCounter) {
    const taken = new Set(records.map(r => r.serial_number))
    for (let n = 1; n <= currentCounter.last_number + 1; n++) {
      if (!taken.has(n) && !releasedNumbers.has(n)) freeNumbers.push(n)
    }
  }

  async function runAction(body: Record<string, unknown>) {
    setError("")
    setInfo("")
    const res = await fetch('/api/admin/serials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'فشلت العملية')
    return data
  }

  async function reloadAll() {
    await Promise.all([
      loadBasics(),
      selectedHospital && selectedMonth ? loadRecords(selectedHospital, selectedMonth) : Promise.resolve(),
    ])
  }

  async function handleRelease(e: React.FormEvent) {
    e.preventDefault()
    if (!modal || modal.type !== 'release') return
    const [y, m] = selectedMonth.split('-')
    try {
      const data = await runAction({
        action: 'release',
        hospitalId: selectedHospital,
        serialMonth: Number(m),
        serialYear: Number(y),
        serialNumber: modal.number,
        reason: releaseReason.trim() || null,
      })
      setInfo(`تم إعادة فتح الرقم ${data.serial_number} — سيُسند تلقائيًا لأول سجل قادم`)
      setModal(null)
      setReleaseReason("")
      await reloadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت العملية')
    }
  }

  async function handleChange(e: React.FormEvent) {
    e.preventDefault()
    if (!modal || modal.type !== 'change') return
    const target = Number(changeNumber)
    if (!target || target <= 0 || !Number.isInteger(target)) { setError('أدخل رقمًا صحيحًا موجبًا'); return }
    if (!changeReason.trim()) { setError('سبب التغيير إجباري'); return }
    try {
      const data = await runAction({
        action: 'change',
        recordId: modal.record.id,
        serialNumber: target,
        reason: changeReason.trim(),
      })
      setInfo(`تم تغيير رقم السجل من ${data.from} إلى ${data.to} — الرقم القديم أصبح متاحًا تلقائيًا`)
      setModal(null)
      setChangeReason("")
      setChangeNumber("")
      await reloadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت العملية')
    }
  }

  async function handleCancelRelease(number: number) {
    if (!confirm(`هل تريد إلغاء إعادة فتح الرقم ${number}؟ سيصبح غير متاح للإدراج القادم.`)) return
    const [y, m] = selectedMonth.split('-')
    try {
      await runAction({
        action: 'cancel_release',
        hospitalId: selectedHospital,
        serialMonth: Number(m),
        serialYear: Number(y),
        serialNumber: number,
      })
      setInfo(`تم إلغاء إعادة فتح الرقم ${number}`)
      await reloadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت العملية')
    }
  }

  if (loading) return <p className="text-gray-500">جاري التحميل...</p>

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 p-3 text-sm text-red-700 rounded">{error}</div>}
      {info && <div className="bg-green-50 p-3 text-sm text-green-700 rounded">{info}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-gray-700">المستشفى</label>
          <select value={selectedHospital} onChange={e => handleHospitalChange(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">— اختر المستشفى —</option>
            {hospitals.map(h => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">الشهر</label>
          <select value={selectedMonth} onChange={e => handleMonthChange(e.target.value)}
            disabled={!selectedHospital}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100">
            <option value="">— اختر الشهر —</option>
            {months.map(m => (
              <option key={monthKey(m.serial_year, m.serial_month)} value={monthKey(m.serial_year, m.serial_month)}>
                {monthNames[m.serial_month - 1]} {m.serial_year}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedHospital && !selectedMonth && (
        <p className="text-sm text-gray-500">اختر شهرًا لعرض شبكة الأرقام المسلسلة.</p>
      )}

      {selectedHospital && selectedMonth && (
        <>
          {loadingMonth ? (
            <p className="text-gray-500">جاري تحميل الشهر...</p>
          ) : currentCounter ? (
            <>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span className="font-medium">آخر رقم مستخدم في هذا الشهر:</span>
                <span className="badge badge-info">{currentCounter.last_number}</span>
                <span className="text-xs text-gray-400">(تظهر الفراغات كأرقام غير مسندة لسجل نشط)</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {Array.from({ length: currentCounter.last_number }, (_, i) => i + 1).map(n => {
                  const rec = recordFor(n)
                  if (rec) {
                    return (
                      <div key={n} className="card p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-primary">{n}</span>
                          {rec.is_verified ? <span className="badge badge-success">موثق</span> : <span className="badge badge-warning">غير موثق</span>}
                        </div>
                        <p className="text-sm text-gray-700 truncate" title={rec.child_full_name}>{rec.child_full_name}</p>
                        <button onClick={() => { setChangeNumber(""); setChangeReason(""); setModal({ type: 'change', record: rec }) }}
                          className="btn btn-secondary w-full text-xs py-1">
                          تغيير الرقم
                        </button>
                      </div>
                    )
                  }
                  if (releasedNumbers.has(n)) {
                    return (
                      <div key={n} className="card p-3 space-y-1 bg-green-50">
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{n}</span>
                          <span className="badge badge-success">متاح</span>
                        </div>
                        <p className="text-sm text-gray-600">سيُسند لأول سجل قادم</p>
                        <button onClick={() => handleCancelRelease(n)}
                          className="btn btn-secondary w-full text-xs py-1">
                          إلغاء إعادة الفتح
                        </button>
                      </div>
                    )
                  }
                  return (
                    <div key={n} className="card p-3 space-y-1 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-400">{n}</span>
                        <span className="badge badge-secondary">فراغ</span>
                      </div>
                      <p className="text-sm text-gray-500">لا يوجد سجل نشط</p>
                      <button onClick={() => { setReleaseReason(""); setModal({ type: 'release', number: n }) }}
                        className="btn btn-primary w-full text-xs py-1">
                        إعادة فتح
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">لا يوجد تسلسل مسجل لهذا الشهر.</p>
          )}
        </>
      )}

      {modal?.type === 'release' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={() => setModal(null)}>
          <form onSubmit={handleRelease} onClick={e => e.stopPropagation()} className="bg-white rounded-xl p-5 w-full max-w-md space-y-3">
            <h3 className="text-lg font-bold">إعادة فتح الرقم {modal.number}</h3>
            <p className="text-sm text-gray-600">
              سيكون الرقم <span className="font-bold">{modal.number}</span> متاحًا ليُسند تلقائيًا لأول سجل جديد في هذا المستشفى/الشهر.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700">السبب (اختياري)</label>
              <textarea value={releaseReason} onChange={e => setReleaseReason(e.target.value)} rows={2}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-success flex-1">تأكيد إعادة الفتح</button>
              <button type="button" onClick={() => setModal(null)} className="btn btn-secondary">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {modal?.type === 'change' && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={() => setModal(null)}>
          <form onSubmit={handleChange} onClick={e => e.stopPropagation()} className="bg-white rounded-xl p-5 w-full max-w-md space-y-3">
            <h3 className="text-lg font-bold">تغيير رقم السجل</h3>
            <p className="text-sm text-gray-600">
              السجل: <span className="font-semibold">{modal.record.child_full_name}</span> — الرقم الحالي{' '}
              <span className="font-bold">{modal.record.serial_number}</span>
              {modal.record.is_verified && <span className="text-amber-600"> (سجل موثق)</span>}
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700">الرقم الجديد (من الأرقام الحرة)</label>
              <select value={changeNumber} onChange={e => setChangeNumber(e.target.value)} required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">— اختر رقمًا حرًا —</option>
                {freeNumbers.filter(n => n !== modal.record.serial_number).map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {freeNumbers.filter(n => n !== modal.record.serial_number).length === 0 && (
                <p className="text-xs text-red-600 mt-1">لا توجد أرقام حرة متاحة حاليًا.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">سبب التغيير <span className="text-red-600">*</span></label>
              <textarea value={changeReason} onChange={e => setChangeReason(e.target.value)} rows={2} required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <p className="text-xs text-gray-400 mt-1">يُسجَّل السبب إلزاميًا في سجل التدقيق، ويصبح الرقم القديم متاحًا تلقائيًا.</p>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-success flex-1">تأكيد التغيير</button>
              <button type="button" onClick={() => setModal(null)} className="btn btn-secondary">إلغاء</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
