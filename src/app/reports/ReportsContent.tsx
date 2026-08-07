"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import type { UserRole, Hospital } from "@/types/database"
import { createClient } from "@/lib/supabase/client"
import { downloadExcel } from "@/lib/reports/exportUtils"
import {
  ChildrenReportPdf,
  downloadPdf,
  type ChildReportRow,
} from "@/lib/reports/pdfDocuments"
import { cairoToday } from "@/lib/time"
import { MAX_REPORT_RANGE_DAYS, dateRangeDays } from "@/lib/time"

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
  father_phone_number: string | null
  mother_first_name: string
  mother_grandfather_name: string
  mother_national_id: string | null
  mother_passport_number: string | null
  mother_phone_number: string | null
  vaccination_date: string
  batch_id: string
  vaccinator_id: string
  is_verified: boolean
  verified_at: string | null
  created_at: string
  request_status: 'pending' | 'approved' | 'rejected' | null
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
  userId: string
}

export default function ReportsContent({ hospitals, userRole, hospitalIds, userId }: Props) {
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [dateType, setDateType] = useState<'birth_date' | 'created_at'>('birth_date')
  const [hospitalId, setHospitalId] = useState("")
  const [childName, setChildName] = useState("")
  const [fatherName, setFatherName] = useState("")
  const [fatherGrandfather, setFatherGrandfather] = useState("")
  const [fatherNationalId, setFatherNationalId] = useState("")
  const [fatherPassport, setFatherPassport] = useState("")
  const [fatherPhone, setFatherPhone] = useState("")
  const [motherName, setMotherName] = useState("")
  const [motherGrandfather, setMotherGrandfather] = useState("")
  const [motherNationalId, setMotherNationalId] = useState("")
  const [motherPassport, setMotherPassport] = useState("")
  const [motherPhone, setMotherPhone] = useState("")
  const [batchNumber, setBatchNumber] = useState("")
  const [records, setRecords] = useState<ChildRecord[]>([])
  const [stats, setStats] = useState<{ total: number; male: number; female: number; byHospital: HospitalStat[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<'' | 'excel' | 'pdf'>('')
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const printRef = useRef<HTMLDivElement>(null)

  const isMinistry = userRole === 'moh_admin' || userRole === 'moh_level1'
  const isVerifier = userRole === 'hospital_verifier'
  // المدخل والموثق يديران سجلات مستشفاهما غير الموثقة من شاشة النتائج مباشرة
  const canManageChild = userRole === 'hospital_entry' || userRole === 'hospital_verifier'

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    // منع البحث الفارغ: يلزم معيار واحد على الأقل لتقليل الحمل على الخادم (القسم 9)
    const hasCriteria = Boolean(
      dateFrom || dateTo || hospitalId ||
      childName.trim() || fatherName.trim() || fatherGrandfather.trim() ||
      motherName.trim() || motherGrandfather.trim() ||
      fatherNationalId.trim() || motherNationalId.trim() ||
      fatherPassport.trim() || motherPassport.trim() ||
      fatherPhone.trim() || motherPhone.trim() || batchNumber.trim()
    )
    if (!hasCriteria) {
      setError("يجب إدخال معيار بحث واحد على الأقل لعرض التقرير (تاريخ محدد، اسم، رقم قومي، رقم تشغيلة...)")
      return
    }
    if (dateFrom && dateTo && dateRangeDays(dateFrom, dateTo) > MAX_REPORT_RANGE_DAYS) {
      setError(`الحد الأقصى المسموح بين تاريخ البداية والنهاية هو ${MAX_REPORT_RANGE_DAYS} يومًا`)
      return
    }

    setLoading(true)

    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (hospitalId) params.set('hospital_id', hospitalId)
    if (dateType) params.set('date_type', dateType)
    if (childName.trim()) params.set('child_name', childName.trim())
    if (fatherName.trim()) params.set('father_name', fatherName.trim())
    if (fatherGrandfather.trim()) params.set('father_grandfather', fatherGrandfather.trim())
    if (fatherNationalId.trim()) params.set('father_national_id', fatherNationalId.trim())
    if (fatherPassport.trim()) params.set('father_passport', fatherPassport.trim())
    if (fatherPhone.trim()) params.set('father_phone', fatherPhone.trim())
    if (motherName.trim()) params.set('mother_name', motherName.trim())
    if (motherGrandfather.trim()) params.set('mother_grandfather', motherGrandfather.trim())
    if (motherNationalId.trim()) params.set('mother_national_id', motherNationalId.trim())
    if (motherPassport.trim()) params.set('mother_passport', motherPassport.trim())
    if (motherPhone.trim()) params.set('mother_phone', motherPhone.trim())
    if (batchNumber.trim()) params.set('batch_number', batchNumber.trim())

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

  // تفريغ كل حقول البحث للبدء ببيانات جديدة
  function handleReset() {
    setDateFrom("")
    setDateTo("")
    setHospitalId("")
    setChildName("")
    setFatherName("")
    setFatherGrandfather("")
    setFatherNationalId("")
    setFatherPassport("")
    setFatherPhone("")
    setMotherName("")
    setMotherGrandfather("")
    setMotherNationalId("")
    setMotherPassport("")
    setMotherPhone("")
    setBatchNumber("")
  }

  // إرسال طلب إعادة فتح توثيق سجل موثّق إلى الوزارة (للموثّق فقط)
  async function handleRequestUnverify(r: ChildRecord) {
    if (!window.confirm(`إرسال طلب إعادة فتح توثيق «${r.child_full_name}» إلى الوزارة؟`)) return
    setRequestingId(r.id)
    setError("")
    try {
      const supabase = createClient()
      const { error } = await supabase.from('unverify_requests').insert({
        record_id: r.id,
        hospital_id: hospitalIds[0],
        requested_by: userId,
        reason: null,
      } as never)
      if (error) throw new Error(error.message)
      // تحديث الحالة محليًا لتظهر "بانتظار الرد" فورًا دون إعادة بحث كامل
      setRecords(prev => prev.map(x => x.id === r.id ? { ...x, request_status: 'pending' } : x))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إرسال الطلب')
    }
    setRequestingId(null)
  }

  function handlePrint() {
    window.print()
  }

  // حذف سجل غير موثق من نتائج البحث (للمدخل والموثق) — يمنعه RLS للسجلات الموثقة
  async function handleDeleteRecord(r: ChildRecord) {
    if (!window.confirm(`تحذير: سيتم حذف سجل الطفل «${r.child_full_name}» نهائيًا وستُرجَع جرعته إلى رصيد الدفعة. هل أنت متأكد؟`)) return
    setError("")
    try {
      const supabase = createClient()
      const { error } = await supabase.from('child_vaccination_records').delete().eq('id', r.id)
      if (error) throw new Error(error.message)
      const genderDelta = r.child_gender === 'male' ? 'male' : 'female'
      setRecords(prev => prev.filter(x => x.id !== r.id))
      setStats(prev => {
        if (!prev) return prev
        const byHospital = prev.byHospital.map(h =>
          h.hospital_id === r.hospital_id
            ? { ...h, total: h.total - 1, male: h.male - (genderDelta === 'male' ? 1 : 0), female: h.female - (genderDelta === 'female' ? 1 : 0) }
            : h
        )
        return {
          ...prev,
          total: prev.total - 1,
          male: prev.male - (genderDelta === 'male' ? 1 : 0),
          female: prev.female - (genderDelta === 'female' ? 1 : 0),
          byHospital,
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حذف السجل')
    }
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
    { header: 'تاريخ دخول الطلبية', key: 'batch_delivery_date', width: 14 },
  ]

  async function handleExportExcel() {
    if (records.length === 0) return
    setExporting('excel')
    try {
      downloadExcel(
        `تقرير-الأطفال-${cairoToday()}.xlsx`,
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
        `تقرير-الأطفال-${cairoToday()}.pdf`
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

  const textInput = "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"

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
              className={textInput} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {dateType === 'birth_date' ? 'إلى تاريخ الميلاد' : 'إلى تاريخ الإدخال'}
            </label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className={textInput} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">الفلترة حسب</label>
            <select value={dateType} onChange={e => setDateType(e.target.value as 'birth_date' | 'created_at')}
              className={textInput}>
              <option value="birth_date">تاريخ ميلاد الطفل (الأساسي)</option>
              <option value="created_at">تاريخ الإدخال الفعلي</option>
            </select>
          </div>
          {userRole === 'moh_admin' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">المستشفى</label>
              <select value={hospitalId} onChange={e => setHospitalId(e.target.value)}
                className={textInput}>
                <option value="">كل المستشفيات</option>
                {hospitals.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* بيانات الطفل */}
        <h4 className="text-sm font-semibold text-gray-500 mb-2 mt-4">بيانات الطفل</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">اسم الطفل</label>
            <input type="text" value={childName} onChange={e => setChildName(e.target.value)}
              className={textInput} />
          </div>
        </div>

        {/* بيانات الأب */}
        <h4 className="text-sm font-semibold text-gray-500 mb-2 mt-4">بيانات الأب</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">اسم الأب</label>
            <input type="text" value={fatherName} onChange={e => setFatherName(e.target.value)}
              className={textInput} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">اسم الجد</label>
            <input type="text" value={fatherGrandfather} onChange={e => setFatherGrandfather(e.target.value)}
              className={textInput} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">الرقم القومي</label>
            <input type="text" value={fatherNationalId} onChange={e => setFatherNationalId(e.target.value)}
              className={textInput} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">جواز السفر</label>
            <input type="text" value={fatherPassport} onChange={e => setFatherPassport(e.target.value)}
              className={textInput} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">تليفون الأب</label>
            <input type="text" value={fatherPhone} onChange={e => setFatherPhone(e.target.value)}
              className={textInput} />
          </div>
        </div>

        {/* بيانات الأم */}
        <h4 className="text-sm font-semibold text-gray-500 mb-2 mt-4">بيانات الأم</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">اسم الأم</label>
            <input type="text" value={motherName} onChange={e => setMotherName(e.target.value)}
              className={textInput} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">اسم الجد</label>
            <input type="text" value={motherGrandfather} onChange={e => setMotherGrandfather(e.target.value)}
              className={textInput} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">الرقم القومي</label>
            <input type="text" value={motherNationalId} onChange={e => setMotherNationalId(e.target.value)}
              className={textInput} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">جواز السفر</label>
            <input type="text" value={motherPassport} onChange={e => setMotherPassport(e.target.value)}
              className={textInput} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">تليفون الأم</label>
            <input type="text" value={motherPhone} onChange={e => setMotherPhone(e.target.value)}
              className={textInput} />
          </div>
        </div>

        {/* التطعيم */}
        <h4 className="text-sm font-semibold text-gray-500 mb-2 mt-4">التطعيم</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">رقم التشغيلة (Lot)</label>
            <input type="text" value={batchNumber} onChange={e => setBatchNumber(e.target.value)}
              className={textInput} />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button type="submit" disabled={loading}
            className="btn btn-primary">
            {loading ? "جاري البحث..." : "بحث"}
          </button>
          <button type="button" onClick={handleReset}
            className="btn btn-secondary">
            تفريغ الحقول
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
                  <th className="py-3 px-3">تاريخ دخول الطلبية</th>
                  {(isMinistry || canManageChild) && <th className="py-3 px-3 print:hidden">الحالة</th>}
                  <th className="py-3 px-3 print:hidden">سجل فردي</th>
                  {isVerifier && <th className="py-3 px-3 print:hidden">إعادة فتح التوثيق</th>}
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
                    {(isMinistry || canManageChild) && (
                      <td className="py-2 px-3 print:hidden">
                        {r.is_verified
                          ? <span className="badge badge-success">موثق</span>
                          : <span className="badge badge-warning">غير موثق</span>
                        }
                      </td>
                    )}
                    <td className="py-2 px-3 print:hidden">
                      <div className="flex flex-col gap-1 items-start">
                        <Link href={`/reports/child/${r.id}`} target="_blank"
                          className="text-primary hover:text-primary-dark text-sm">
                          سجل فردي
                        </Link>
                        {canManageChild && !r.is_verified && (
                          <div className="flex gap-2">
                            <Link
                              href={`${userRole === 'hospital_verifier' ? '/hospital-verifier' : '/hospital-entry'}/${r.id}/edit`}
                              className="btn-soft px-2 py-0.5 text-xs"
                            >
                              تعديل
                            </Link>
                            <button type="button" onClick={() => handleDeleteRecord(r)}
                              className="text-red-600 hover:text-red-800 text-sm">
                              حذف
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    {isVerifier && (
                      <td className="py-2 px-3 print:hidden">
                        {!r.is_verified ? (
                          <span className="text-xs text-gray-400">غير موثق</span>
                        ) : r.request_status === 'pending' ? (
                          <span className="badge badge-warning">بانتظار الرد</span>
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            {r.request_status === 'rejected' && (
                              <span className="text-xs text-red-600">سبق رفض الطلب</span>
                            )}
                            <button
                              type="button"
                              disabled={requestingId === r.id}
                              onClick={() => handleRequestUnverify(r)}
                              className="text-primary hover:text-primary-dark text-sm disabled:opacity-50">
                              {requestingId === r.id ? 'جاري الإرسال...' : 'طلب إعادة فتح'}
                            </button>
                          </div>
                        )}
                      </td>
                    )}
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
