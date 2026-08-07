"use client"

import { useState, useCallback } from "react"
import type { UserRole, Hospital } from "@/types/database"
import { downloadExcel } from "@/lib/reports/exportUtils"
import { BatchesReportPdf, downloadPdf } from "@/lib/reports/pdfDocuments"
import { cairoToday } from "@/lib/time"
import { MAX_REPORT_RANGE_DAYS, dateRangeDays } from "@/lib/time"

interface BatchMovementRow {
  batch_id: string
  hospital_id: string
  hospital_name: string
  batch_number: string
  delivery_date: string
  expiry_date: string
  received: number
  used: number
  remaining: number
}

interface Props {
  hospitals: Hospital[]
  userRole: UserRole | null
}

export default function BatchMovementReport({ hospitals, userRole }: Props) {
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [hospitalId, setHospitalId] = useState("")
  const [batchNumber, setBatchNumber] = useState("")
  const [includeEmptied, setIncludeEmptied] = useState(false)
  const [rows, setRows] = useState<BatchMovementRow[]>([])
  const [totals, setTotals] = useState<{ received: number; used: number; remaining: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [exporting, setExporting] = useState<'' | 'excel' | 'pdf'>('')
  const [hasSearched, setHasSearched] = useState(false)

  const isMinistry = userRole === 'moh_admin' || userRole === 'moh_level1'

  const runSearch = useCallback(async (showEmptied: boolean) => {
    setError("")

    // إلزام نطاق تاريخ (بداية ونهاية) لكل بحث (القسم 9): يمنع جلب كل الدفعات دون تحديد زمني.
    // رقم التشغيلة والمستشفى فلاتر اختيارية إضافية.
    if (!dateFrom || !dateTo) {
      setError("يجب تحديد تاريخ البداية والنهاية للبحث")
      return
    }
    if (dateRangeDays(dateFrom, dateTo) > MAX_REPORT_RANGE_DAYS) {
      setError(`الحد الأقصى لمدة البحث شهر واحد (بحد أقصى ${MAX_REPORT_RANGE_DAYS} يومًا)`)
      return
    }

    setLoading(true)

    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (hospitalId) params.set('hospital_id', hospitalId)
    if (batchNumber.trim()) params.set('batch_number', batchNumber.trim())
    if (showEmptied) params.set('include_emptied', 'true')

    try {
      const res = await fetch(`/api/reports/batches?${params}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'فشل في تحميل التقرير')
      }
      const data = await res.json()
      setRows(data.rows ?? [])
      setTotals(data.totals ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ')
    }

    setLoading(false)
  }, [dateFrom, dateTo, hospitalId, batchNumber])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setHasSearched(true)
    runSearch(includeEmptied)
  }

  // إعادة التحميل فورًا عند تبديل إظهار/إخفاء التشغيلات التي فرغت من الطعوم
  function handleToggleEmptied(checked: boolean) {
    setIncludeEmptied(checked)
    if (hasSearched) runSearch(checked)
  }

  // تفريغ كل حقول البحث للبدء ببيانات جديدة
  function handleReset() {
    setDateFrom("")
    setDateTo("")
    setHospitalId("")
    setBatchNumber("")
  }

  const hospitalMap = Object.fromEntries(hospitals.map(h => [h.id, h.name]))
  const selectedHospitalName = hospitalId ? hospitalMap[hospitalId] : null
  const reportHospitalName = selectedHospitalName
    ?? (userRole !== 'moh_admin' ? hospitals.map(h => h.name).join('، ') : 'كل المستشفيات')
  const reportDateRange = dateFrom || dateTo ? `من ${dateFrom || '...'} إلى ${dateTo || '...'}` : ''

  // أعمدة Excel بنفس ترتيب الجدول المعروض
  const excelColumns = [
    ...(isMinistry ? [{ header: 'المستشفى', key: 'hospital_name', width: 20 }] : []),
    { header: 'رقم التشغيلة', key: 'batch_number', width: 16 },
    { header: 'تاريخ دخول الطلبية', key: 'delivery_date', width: 14 },
    { header: 'تاريخ الصلاحية', key: 'expiry_date', width: 14 },
    { header: 'الوارد', key: 'received', width: 10 },
    { header: 'المستخدم', key: 'used', width: 10 },
    { header: 'المتبقي', key: 'remaining', width: 10 },
  ]

  function handleExportExcel() {
    if (rows.length === 0) return
    setExporting('excel')
    try {
      downloadExcel(
        `حركة-الطعوم-${cairoToday()}.xlsx`,
        'حركة الطعوم',
        excelColumns,
        rows
      )
    } finally {
      setExporting('')
    }
  }

  async function handleExportPdf() {
    if (rows.length === 0) return
    setExporting('pdf')
    try {
      await downloadPdf(
        <BatchesReportPdf
          rows={rows}
          totals={totals}
          isMinistry={isMinistry}
          dateRange={reportDateRange}
          hospitalName={reportHospitalName}
        />,
        `حركة-الطعوم-${cairoToday()}.pdf`
      )
    } finally {
      setExporting('')
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">من تاريخ (دخول الطلبية) *</label>
            <input type="date" required value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">إلى تاريخ (دخول الطلبية) *</label>
            <input type="date" required value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">رقم التشغيلة (Lot)</label>
            <input type="text" value={batchNumber} onChange={e => setBatchNumber(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          {userRole === 'moh_admin' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">المستشفى</label>
              <select value={hospitalId} onChange={e => setHospitalId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">كل المستشفيات</option>
                {hospitals.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={includeEmptied} onChange={e => handleToggleEmptied(e.target.checked)}
              className="rounded border-gray-300" />
            إظهار التشغيلات التي فرغت منها الطعوم
          </label>
          <button type="submit" disabled={loading}
            className="btn btn-primary">
            {loading ? "جاري البحث..." : "عرض التقرير"}
          </button>
          <button type="button" onClick={handleReset}
            className="btn btn-secondary">
            تفريغ الحقول
          </button>
          <span className="text-xs text-gray-500">
            * حقلا التاريخ إلزاميان للبحث، والحد الأقصى لمدة البحث شهر واحد (بحد أقصى {MAX_REPORT_RANGE_DAYS} يومًا)
          </span>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded-lg">{error}</div>
      )}

      {rows.length === 0 && !loading && !error && (
        <p className="text-center text-gray-500 py-8">حدد الفترة الزمنية واضغط &quot;عرض التقرير&quot;</p>
      )}

      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">نتائج التقرير ({rows.length} تشغيلة)</h3>
              <p className="text-xs text-gray-500 mt-1">
                المستخدم = عدد الأطفال المطعّمين من هذه التشغيلة خلال الفترة المحددة، المتبقي = الرصيد الحالي
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleExportExcel} disabled={exporting !== ''}
                className="btn btn-success">
                {exporting === 'excel' ? 'جاري التصدير...' : 'تنزيل Excel'}
              </button>
              <button type="button" onClick={handleExportPdf} disabled={exporting !== ''}
                className="btn btn-danger">
                {exporting === 'pdf' ? 'جاري التصدير...' : 'تنزيل PDF'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-right">
                  {isMinistry && <th className="py-3 px-3">المستشفى</th>}
                  <th className="py-3 px-3">رقم التشغيلة</th>
                  <th className="py-3 px-3">تاريخ دخول الطلبية</th>
                  <th className="py-3 px-3">تاريخ الصلاحية</th>
                  <th className="py-3 px-3">الوارد</th>
                  <th className="py-3 px-3">المستخدم</th>
                  <th className="py-3 px-3">المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.batch_id} className="border-b hover:bg-gray-50">
                    {isMinistry && <td className="py-2 px-3">{r.hospital_name}</td>}
                    <td className="py-2 px-3 font-medium">{r.batch_number}</td>
                    <td className="py-2 px-3">{r.delivery_date}</td>
                    <td className={`py-2 px-3 ${r.expiry_date < cairoToday() ? 'text-red-600' : ''}`}>{r.expiry_date}</td>
                    <td className="py-2 px-3">{r.received}</td>
                    <td className="py-2 px-3">{r.used}</td>
                    <td className={`py-2 px-3 font-bold ${r.remaining <= 0 ? 'text-red-600' : 'text-green-600'}`}>{r.remaining}</td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="bg-gray-50 font-bold">
                    <td className="py-3 px-3" colSpan={isMinistry ? 4 : 3}>الإجمالي</td>
                    <td className="py-3 px-3">{totals.received}</td>
                    <td className="py-3 px-3">{totals.used}</td>
                    <td className="py-3 px-3">{totals.remaining}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
