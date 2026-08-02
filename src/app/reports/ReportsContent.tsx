"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import type { UserRole, Hospital } from "@/types/database"
import { downloadExcel } from "@/lib/reports/exportUtils"
import {
  ChildrenReportPdf,
  downloadPdf,
  type ChildReportRow,
} from "@/lib/reports/pdfDocuments"

interface ChildRecord {
  id: string
  hospital_id: string
  child_full_name: string
  child_gender: string
  birth_date: string
  child_nationality: string
  father_first_name: string
  father_grandfather_name: string
  father_national_id: string
  father_passport_number: string | null
  mother_first_name: string
  mother_grandfather_name: string
  mother_national_id: string | null
  mother_passport_number: string | null
  vaccination_date: string
  batch_id: string
  vaccinator_id: string
  is_verified: boolean
  verified_at: string | null
  vaccinators: { full_name: string } | null
  vaccine_batches: { delivery_date: string; batch_number: string; expiry_date: string } | null
  hospitals: { name: string } | null
}

interface HospitalStat {
  hospital_id: string
  hospital_name: string
  total: number
  male: number
  female: number
}

interface Props {
  hospitals: Hospital[]
  userRole: UserRole | null
  hospitalIds: string[]
}

export default function ReportsContent({ hospitals, userRole, hospitalIds }: Props) {
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [dateType, setDateType] = useState<'birth_date' | 'created_at'>('birth_date')
  const [hospitalId, setHospitalId] = useState("")
  const [records, setRecords] = useState<ChildRecord[]>([])
  const [stats, setStats] = useState<{ total: number; male: number; female: number; byHospital: HospitalStat[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<'' | 'excel' | 'pdf'>('')
  const [error, setError] = useState("")
  const printRef = useRef<HTMLDivElement>(null)

  const isMinistry = userRole === 'moh_admin' || userRole === 'moh_level1'

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (hospitalId) params.set('hospital_id', hospitalId)
    if (dateType) params.set('date_type', dateType)

    try {
      const res = await fetch(`/api/reports?${params}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'فشل في تحميل التقرير')
      }
      const data = await res.json()
      setRecords(data.records ?? [])
      setStats(data.statistics ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ')
    }

    setLoading(false)
  }

  function handlePrint() {
    window.print()
  }

  // تحويل سجلات النتائج الحالية إلى صيغة التصدير الموحدة
  function toExportRows(): ChildReportRow[] {
    return records.map(r => ({
      hospital_name: r.hospitals?.name,
      child_full_name: r.child_full_name,
      birth_date: r.birth_date,
      child_gender: r.child_gender,
      child_nationality: r.child_nationality,
      father_name: formatFullName(r.father_first_name, r.father_grandfather_name),
      father_national_id: r.father_national_id,
      mother_name: formatFullName(r.mother_first_name, r.mother_grandfather_name),
      mother_national_id: r.mother_national_id,
      vaccination_date: r.vaccination_date,
      vaccinator_name: r.vaccinators?.full_name ?? '',
      batch_number: r.vaccine_batches?.batch_number ?? '',
      batch_delivery_date: r.vaccine_batches?.delivery_date ?? '',
    }))
  }

  // أعمدة Excel للتقرير الشامل — بنفس ترتيب الجدول المعروض
  const excelColumns = [
    ...(isMinistry ? [{ header: 'المستشفى', key: 'hospital_name', width: 20 }] : []),
    { header: 'اسم الطفل', key: 'child_full_name', width: 20 },
    { header: 'تاريخ الميلاد', key: 'birth_date', width: 14 },
    { header: 'اسم الأب', key: 'father_name', width: 20 },
    { header: 'رقم الأب القومي', key: 'father_national_id', width: 18 },
    { header: 'اسم الأم', key: 'mother_name', width: 20 },
    { header: 'رقم الأم القومي', key: 'mother_national_id', width: 18 },
    { header: 'تاريخ التطعيم', key: 'vaccination_date', width: 14 },
    { header: 'القائم بالتطعيم', key: 'vaccinator_name', width: 18 },
    { header: 'رقم التشغيلة', key: 'batch_number', width: 14 },
    { header: 'تاريخ الدفعة', key: 'batch_delivery_date', width: 14 },
  ]

  async function handleExportExcel() {
    if (records.length === 0) return
    setExporting('excel')
    try {
      downloadExcel(
        `تقرير-الأطفال-${new Date().toISOString().slice(0, 10)}.xlsx`,
        'تقرير الأطفال',
        excelColumns,
        toExportRows()
      )
    } finally {
      setExporting('')
    }
  }

  async function handleExportPdf() {
    if (records.length === 0) return
    setExporting('pdf')
    try {
      await downloadPdf(
        <ChildrenReportPdf
          rows={toExportRows()}
          isMinistry={isMinistry}
          dateRange={reportDateRange}
          hospitalName={reportHospitalName}
          total={stats?.total ?? records.length}
          male={stats?.male ?? 0}
          female={stats?.female ?? 0}
        />,
        `تقرير-الأطفال-${new Date().toISOString().slice(0, 10)}.pdf`
      )
    } finally {
      setExporting('')
    }
  }

  function formatFullName(firstName: string, grandfatherName: string): string {
    return `${firstName} ${grandfatherName}`
  }

  const hospitalMap = Object.fromEntries(hospitals.map(h => [h.id, h.name]))
  const selectedHospitalName = hospitalId ? hospitalMap[hospitalId] : null
  const reportHospitalName = selectedHospitalName
    ?? (userRole !== 'moh_admin' ? hospitals.map(h => h.name).join('، ') : 'كل المستشفيات')
  const reportDateRange = dateFrom || dateTo
    ? `${dateType === 'birth_date' ? 'حسب تاريخ الميلاد' : 'حسب تاريخ الإدخال'} — من ${dateFrom || '...'} إلى ${dateTo || '...'}`
    : ''

  return (
    <div className="space-y-6">
      {/* Search form */}
      <form onSubmit={handleSearch} className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {dateType === 'birth_date' ? 'من تاريخ الميلاد' : 'من تاريخ الإدخال'}
            </label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {dateType === 'birth_date' ? 'إلى تاريخ الميلاد' : 'إلى تاريخ الإدخال'}
            </label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">الفلترة حسب</label>
            <select value={dateType} onChange={e => setDateType(e.target.value as 'birth_date' | 'created_at')}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="birth_date">تاريخ ميلاد الطفل (الأساسي)</option>
              <option value="created_at">تاريخ الإدخال الفعلي</option>
            </select>
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
        <div className="flex gap-3">
          <button type="submit" disabled={loading}
            className="btn btn-primary">
            {loading ? "جاري البحث..." : "بحث"}
          </button>
          {records.length > 0 && (
            <button type="button" onClick={handlePrint}
              className="btn btn-secondary">
              طباعة
            </button>
          )}
        </div>
      </form>

      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded-lg">{error}</div>
      )}

      {/* Statistics */}
      {stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-primary">{stats.total}</div>
              <div className="text-sm text-gray-600">الإجمالي</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.male}</div>
              <div className="text-sm text-gray-600">ذكور</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-pink-600">{stats.female}</div>
              <div className="text-sm text-gray-600">إناث</div>
            </div>
          </div>

          <div className="card p-4">
            <h4 className="font-semibold mb-3">التوزيع حسب المستشفى</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-right text-gray-600">
                  <th className="py-2 px-3">المستشفى</th>
                  <th className="py-2 px-3">ذكور</th>
                  <th className="py-2 px-3">إناث</th>
                  <th className="py-2 px-3">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {stats.byHospital.map(h => (
                  <tr key={h.hospital_id} className="border-b">
                    <td className="py-2 px-3">{h.hospital_name}</td>
                    <td className="py-2 px-3">{h.male}</td>
                    <td className="py-2 px-3">{h.female}</td>
                    <td className="py-2 px-3 font-bold">{h.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results */}
      {records.length > 0 && (
        <div ref={printRef} className="card overflow-hidden">
          {/* ترويسة الطباعة فقط */}
          <div className="hidden print:block text-center mb-4 p-4">
            <h1 className="text-xl font-bold">تقرير الأطفال المتطعّمين</h1>
            {reportDateRange && <p className="mt-1 text-sm">{reportDateRange}</p>}
            <p className="mt-1 text-sm">المستشفى: {reportHospitalName}</p>
          </div>
          <div className="p-4 border-b flex flex-wrap items-center justify-between gap-2 print:hidden">
            <h3 className="font-semibold">نتائج البحث ({records.length})</h3>
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
                  <th className="py-3 px-3">اسم الطفل</th>
                  <th className="py-3 px-3">تاريخ الميلاد</th>
                  <th className="py-3 px-3">اسم الأب</th>
                  <th className="py-3 px-3">رقم الأب القومي</th>
                  <th className="py-3 px-3">اسم الأم</th>
                  <th className="py-3 px-3">رقم الأم القومي</th>
                  <th className="py-3 px-3">تاريخ التطعيم</th>
                  <th className="py-3 px-3">القائم بالتطعيم</th>
                  <th className="py-3 px-3">رقم التشغيلة</th>
                  <th className="py-3 px-3">تاريخ الدفعة</th>
                  {isMinistry && <th className="py-3 px-3 print:hidden">الحالة</th>}
                  <th className="py-3 px-3 print:hidden">سجل فردي</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    {isMinistry && <td className="py-2 px-3">{r.hospitals?.name ?? '-'}</td>}
                    <td className="py-2 px-3">{r.child_full_name}</td>
                    <td className="py-2 px-3">{r.birth_date}</td>
                    <td className="py-2 px-3">{formatFullName(r.father_first_name, r.father_grandfather_name)}</td>
                    <td className="py-2 px-3">{r.father_national_id}</td>
                    <td className="py-2 px-3">{formatFullName(r.mother_first_name, r.mother_grandfather_name)}</td>
                    <td className="py-2 px-3">{r.mother_national_id ?? '-'}</td>
                    <td className="py-2 px-3">{r.vaccination_date}</td>
                    <td className="py-2 px-3">{r.vaccinators?.full_name ?? '-'}</td>
                    <td className="py-2 px-3">{r.vaccine_batches?.batch_number ?? '-'}</td>
                    <td className="py-2 px-3">{r.vaccine_batches?.delivery_date ?? '-'}</td>
                    {isMinistry && (
                      <td className="py-2 px-3 print:hidden">
                        {r.is_verified
                          ? <span className="badge badge-success">موثق</span>
                          : <span className="badge badge-warning">غير موثق</span>
                        }
                      </td>
                    )}
                    <td className="py-2 px-3 print:hidden">
                      <Link href={`/reports/child/${r.id}`} target="_blank"
                        className="text-primary hover:text-primary-dark text-sm">
                        سجل فردي
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && records.length === 0 && !error && (
        <p className="text-center text-gray-500 py-8">استخدم نموذج البحث أعلاه لعرض التقارير</p>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          nav, form, button, .no-print { display: none !important; }
          body { background: white; }
          table { font-size: 10pt; width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 4px 6px; text-align: right; }
          .print\\:block { display: block !important; }
          .print\\:hidden { display: none !important; }
          .print\\:grid-cols-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        }
      `}</style>
    </div>
  )
}
