"use client"

import { useState, useRef, useEffect, type ElementType } from "react"
import { Search, Filter, Printer, RotateCcw, ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, Baby } from "lucide-react"
import type { UserRole, Hospital } from "@/types/database"
import { downloadExcel } from "@/lib/reports/exportUtils"
import {
  ChildrenReportPdf,
  downloadPdf,
  type ChildReportRow,
} from "@/lib/reports/pdfDocuments"
import { cairoToday } from "@/lib/time"
import { MAX_REPORT_RANGE_DAYS, dateRangeDays } from "@/lib/time"
import { NATIONALITIES, nationalityToFilterParam } from "@/lib/nationalities"

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
  entered_by: string
  entered_by_name: string | null
  is_verified: boolean
  verified_at: string | null
  created_at: string
  ministry_registered: boolean
  ministry_registered_at: string | null
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

type SortKey = 'child_name' | 'birth_date' | 'father_name' | 'mother_name' | 'vaccination_date' | 'hospital' | 'created_at'

// خيار مرتبط بمستشفى محدّد — لفلترَي "القائم بالتطعيم" و"المدخل" في التقارير
interface HospitalScopedOption {
  id: string
  full_name: string
  hospital_id: string
}

interface Props {
  hospitals: Hospital[]
  userRole: UserRole | null
  vaccinators: HospitalScopedOption[]
  entryUsers: HospitalScopedOption[]
}

const PAGE_SIZES = [10, 20, 50] as const

// رأس عمود قابل للفرز مع سهم الاتجاه (بند 5)
function SortableTh({
  label,
  sortKey,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string
  sortKey: SortKey
  sortBy: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
}) {
  return (
    <th className="cursor-pointer select-none hover:bg-gray-200/70" onClick={() => onSort(sortKey)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortBy === sortKey && <span className="text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  )
}

// شريط عنوان قسم: خلفية تدرّج الأقسام ونص أبيض (بند 4)
function SectionHeader({ icon: Icon, title, subtitle }: { icon: ElementType; title: string; subtitle?: string }) {
  return (
    <div className="section-header mb-4">
      <Icon size={18} />
      <div>
        <h3 className="font-bold">{title}</h3>
        {subtitle && <p className="text-xs text-white/90">{subtitle}</p>}
      </div>
    </div>
  )
}

export default function ReportsContent({ hospitals, userRole, vaccinators, entryUsers }: Props) {
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
  // فلاتر إضافية: الجنسية + القائم بالتطعيم + المدخل (بند إضافي)
  const [nationalityFilter, setNationalityFilter] = useState<'all' | 'egyptian' | 'non_egyptian' | string>('all')
  const [vaccinatorId, setVaccinatorId] = useState("")
  const [enteredBy, setEnteredBy] = useState("")

  const [records, setRecords] = useState<ChildRecord[]>([])
  const [stats, setStats] = useState<{ total: number; male: number; female: number; byHospital: HospitalStat[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<'' | 'excel' | 'pdf'>('')
  const [error, setError] = useState("")
  const [hasSearched, setHasSearched] = useState(false)

  // ترحيل + فرز (بند 5): من جهة الخادم — صفحة 20 افتراضيًا
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number | 'all'>(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [sortBy, setSortBy] = useState<SortKey>('child_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // مفتاح "بحث متقدم" + فلترة الحالة (مغلق افتراضيًا ويُفتح عند الحاجة)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'unverified'>('all')
  // فلترة التسجيل على الميكنة — تظهر للوزارة فقط (moh_level1 / moh_admin)
  const [ministryStatusFilter, setMinistryStatusFilter] = useState<'all' | 'registered' | 'unregistered'>('all')

  // كامل النتيجة للطباعة/التصدير (يُحمَّل عند الطلب فقط — بند 5)
  const [printRows, setPrintRows] = useState<ChildRecord[] | null>(null)
  const [fullLoading, setFullLoading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const isMinistry = userRole === 'moh_admin' || userRole === 'moh_level1'

  // فلتر "رقم التشغيلة (Lot)" وفلترا "القائم بالتطعيم" و"المدخل" يعملون فقط
  // عند تحديد مستشفى معيّن (لحسابات الوزارة). حسابات المستشفيات مرتبطة
  // بمستشفاها تلقائيًا فيبقى الفلتران مفعّلين لديهم دائمًا وتُعرض خيارات
  // مستشفاهم فقط.
  const filtersDisabled = isMinistry && !hospitalId
  const vaccinatorOptions = isMinistry
    ? (hospitalId ? vaccinators.filter(v => v.hospital_id === hospitalId) : [])
    : vaccinators
  const entryUserOptions = isMinistry
    ? (hospitalId ? entryUsers.filter(u => u.hospital_id === hospitalId) : [])
    : entryUsers

  // إفراغ حالة الطباعة بعد انتهاء الطباعة الفعلية
  useEffect(() => {
    const clear = () => setPrintRows(null)
    window.addEventListener('afterprint', clear)
    return () => window.removeEventListener('afterprint', clear)
  }, [])

  // بناء معاملات الطلب من حقول النموذج الحالية + خيارات الترحيل/الفرز
  function buildParams(overrides: { page?: number; pageSize?: number | 'all'; sortBy?: SortKey; sortDir?: 'asc' | 'desc'; status?: typeof statusFilter; ministryStatus?: typeof ministryStatusFilter; full?: boolean }) {    const p = new URLSearchParams()
    if (dateFrom) p.set('date_from', dateFrom)
    if (dateTo) p.set('date_to', dateTo)
    if (hospitalId) p.set('hospital_id', hospitalId)
    p.set('date_type', dateType)
    if (childName.trim()) p.set('child_name', childName.trim())
    if (fatherName.trim()) p.set('father_name', fatherName.trim())
    if (fatherGrandfather.trim()) p.set('father_grandfather', fatherGrandfather.trim())
    if (fatherNationalId.trim()) p.set('father_national_id', fatherNationalId.trim())
    if (fatherPassport.trim()) p.set('father_passport', fatherPassport.trim())
    if (fatherPhone.trim()) p.set('father_phone', fatherPhone.trim())
    if (motherName.trim()) p.set('mother_name', motherName.trim())
    if (motherGrandfather.trim()) p.set('mother_grandfather', motherGrandfather.trim())
    if (motherNationalId.trim()) p.set('mother_national_id', motherNationalId.trim())
    if (motherPassport.trim()) p.set('mother_passport', motherPassport.trim())
    if (motherPhone.trim()) p.set('mother_phone', motherPhone.trim())
    if (batchNumber.trim()) p.set('batch_number', batchNumber.trim())
    const natParam = nationalityToFilterParam(nationalityFilter)
    if (natParam) p.set('nationality', natParam)
    if (vaccinatorId) p.set('vaccinator_id', vaccinatorId)
    if (enteredBy) p.set('entered_by', enteredBy)
    p.set('status', overrides.status ?? statusFilter)
    p.set('ministry_status', overrides.ministryStatus ?? ministryStatusFilter)
    p.set('sort_by', overrides.sortBy ?? sortBy)
    p.set('sort_dir', overrides.sortDir ?? sortDir)
    const ps = overrides.pageSize ?? pageSize
    if (overrides.full || ps === 'all') {
      p.set('full', '1')
    } else {
      p.set('page', String(overrides.page ?? page))
      p.set('page_size', String(ps))
    }
    return p
  }

  // تنفيذ الطلب وإعادة تعيين حالة الطباعة عند بحث جديد
  async function runFetch(overrides: Parameters<typeof buildParams>[0]) {
    setLoading(true)
    setError("")
    setPrintRows(null)
    try {
      const res = await fetch(`/api/reports?${buildParams(overrides)}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'فشل في تحميل التقرير')
      }
      const data = await res.json()
      setRecords(data.records ?? [])
      setStats(data.statistics ?? null)
      setTotal(data.total ?? 0)
      setPage(data.page ?? 1)
      setTotalPages(data.total_pages ?? 1)
      if (overrides.full) {
        setPageSize((overrides.pageSize as number | 'all') ?? pageSize)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ')
    }
    setLoading(false)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    // إلزام نطاق تاريخ (بداية ونهاية) لكل بحث (القسم 9): يمنع جلب كميات ضخمة
    if (!dateFrom || !dateTo) {
      setError("يجب تحديد تاريخ البداية والنهاية للبحث")
      return
    }
    if (dateRangeDays(dateFrom, dateTo) > MAX_REPORT_RANGE_DAYS) {
      setError(`الحد الأقصى لمدة البحث شهر واحد (بحد أقصى ${MAX_REPORT_RANGE_DAYS} يومًا)`)
      return
    }

    setHasSearched(true)
    runFetch({ page: 1 })
  }

  function handlePageChange(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return
    runFetch({ page: nextPage })
  }

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      runFetch({ page: 1, sortBy: key, sortDir: sortDir === 'asc' ? 'desc' : 'asc' })
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      runFetch({ page: 1, sortBy: key, sortDir: 'asc' })
      setSortBy(key)
      setSortDir('asc')
    }
  }

  function handlePageSizeChange(ps: number | 'all') {
    setPageSize(ps)
    runFetch({ page: 1, pageSize: ps })
  }

  function handleStatusChange(s: 'all' | 'verified' | 'unverified') {
    setStatusFilter(s)
    runFetch({ page: 1, status: s })
  }

  // تفريغ كل حقول البحث
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
    setNationalityFilter('all')
    setVaccinatorId("")
    setEnteredBy("")
    setStatusFilter('all')
    setMinistryStatusFilter('all')
    setPage(1)
    setRecords([])
    setStats(null)
    setHasSearched(false)
    setPrintRows(null)
  }

  // جلب كامل النتيجة (مطابقة الفلاتر الحالية) — للطباعة والتصدير
  async function fetchFull(): Promise<ChildRecord[]> {
    const res = await fetch(`/api/reports?${buildParams({ full: true })}`)
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'فشل في تحميل كامل البيانات')
    }
    const data = await res.json()
    return (data.records ?? []) as ChildRecord[]
  }

  // الطباعة: تُحمَّل كامل النتيجة أولًا ثم تُطبع (بند 5)
  async function handlePrint() {
    if (records.length === 0) return
    setFullLoading(true)
    setError("")
    try {
      const full = await fetchFull()
      setPrintRows(full)
      setTimeout(() => window.print(), 150)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل البيانات للطباعة')
    }
    setFullLoading(false)
  }

  function toExportRows(source: ChildRecord[]): ChildReportRow[] {
    return source.map(r => ({
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
      entered_by_name: r.entered_by_name ?? '',
      batch_number: r.vaccine_batches?.batch_number ?? '',
      batch_delivery_date: r.vaccine_batches?.delivery_date ?? '',
      is_verified: r.is_verified,
      ministry_registered: r.ministry_registered,
      ministry_status: r.ministry_registered ? 'مسجّل' : 'غير مسجّل',
    }))
  }

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
    { header: 'المدخل', key: 'entered_by_name', width: 18 },
    { header: 'رقم التشغيلة', key: 'batch_number', width: 14 },
    { header: 'تاريخ دخول الطلبية', key: 'batch_delivery_date', width: 14 },
    ...(isMinistry ? [{ header: 'الميكنة', key: 'ministry_status', width: 14 }] : []),
  ]

  async function handleExportExcel() {
    if (records.length === 0) return
    setExporting('excel')
    setError("")
    try {
      const full = printRows ?? (await fetchFull())
      downloadExcel(
        `تقرير-الأطفال-${cairoToday()}.xlsx`,
        'تقرير الأطفال',
        excelColumns,
        toExportRows(full)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل البيانات للتصدير')
    }
    setExporting('')
  }

  async function handleExportPdf() {
    if (records.length === 0) return
    setExporting('pdf')
    setError("")
    try {
      const full = printRows ?? (await fetchFull())
      await downloadPdf(
        <ChildrenReportPdf
          rows={toExportRows(full)}
          isMinistry={isMinistry}
          dateRange={reportDateRange}
          hospitalName={reportHospitalName}
          total={stats?.total ?? full.length}
          male={stats?.male ?? 0}
          female={stats?.female ?? 0}
        />,
        `تقرير-الأطفال-${cairoToday()}.pdf`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل البيانات للتصدير')
    }
    setExporting('')
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

  // حساب أرقام الصفحات الظاهرة حول الصفحة الحالية
  function getPageNumbers(): number[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const set = new Set<number>([1, 2, totalPages - 1, totalPages, page - 1, page, page + 1])
    return [...set].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  }

  const shownTotal = printRows ? printRows.length : total
  const start = printRows ? 1 : total === 0 ? 0 : (page - 1) * (pageSize === 'all' ? total : pageSize) + 1
  const end = printRows ? shownTotal : Math.min(page * (pageSize === 'all' ? total : pageSize), total)

  return (
    <div className="space-y-6">
      {/* نموذج البحث */}
      <form onSubmit={handleSearch} className="card p-4">
        <SectionHeader icon={Search} title="البحث في السجلات" subtitle="حدد نطاق التاريخ إلزاميًا للبحث، ثم أضف أي فلترة اختيارية" />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {dateType === 'birth_date' ? 'من تاريخ الميلاد' : 'من تاريخ الإدخال'} *
            </label>
            <input type="date" required value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {dateType === 'birth_date' ? 'إلى تاريخ الميلاد' : 'إلى تاريخ الإدخال'} *
            </label>
            <input type="date" required value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">الفلترة حسب</label>
            <select value={dateType} onChange={e => setDateType(e.target.value as 'birth_date' | 'created_at')}
              className="input-field">
              <option value="birth_date">تاريخ ميلاد الطفل (الأساسي)</option>
              <option value="created_at">تاريخ الإدخال الفعلي</option>
            </select>
          </div>
          {isMinistry && (
            <div>
              <label className="block text-sm font-medium text-gray-700">المستشفى</label>
              <select value={hospitalId} onChange={e => { setHospitalId(e.target.value); setBatchNumber(""); setVaccinatorId(""); setEnteredBy("") }}
                className="input-field">
                <option value="">كل المستشفيات</option>
                {hospitals.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* مفتاح تبديل iOS-style لإظهار/إخفاء البحث المتقدم (بند 6) */}
        <div className="flex flex-wrap items-center gap-4 mt-2">
          <label className="flex items-center gap-3 text-sm font-medium text-gray-700 cursor-pointer select-none">
            <span className="toggle">
              <input type="checkbox" checked={advancedOpen} onChange={e => setAdvancedOpen(e.target.checked)} />
              <span className="slider" />
            </span>
            <span className="inline-flex items-center gap-1"><Filter size={15} /> بحث متقدم</span>
          </label>

          {/* فلترة حالة السجل بأزرار Pills (بند 6) */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">حالة السجل:</span>
            <div className="pill-group">
              <button type="button" className={`pill ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => handleStatusChange('all')}>الكل</button>
              <button type="button" className={`pill ${statusFilter === 'verified' ? 'active' : ''}`} onClick={() => handleStatusChange('verified')}>موثّق</button>
              <button type="button" className={`pill ${statusFilter === 'unverified' ? 'active' : ''}`} onClick={() => handleStatusChange('unverified')}>معلّق</button>
            </div>
          </div>

          {/* فلترة التسجيل على الميكنة — للوزارة فقط */}
          {isMinistry && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">الميكنة:</span>
              <div className="pill-group">
                <button type="button" className={`pill ${ministryStatusFilter === 'all' ? 'active' : ''}`} onClick={() => { setMinistryStatusFilter('all'); runFetch({ page: 1, ministryStatus: 'all' }) }}>الكل</button>
                <button type="button" className={`pill ${ministryStatusFilter === 'registered' ? 'active' : ''}`} onClick={() => { setMinistryStatusFilter('registered'); runFetch({ page: 1, ministryStatus: 'registered' }) }}>مسجّل</button>
                <button type="button" className={`pill ${ministryStatusFilter === 'unregistered' ? 'active' : ''}`} onClick={() => { setMinistryStatusFilter('unregistered'); runFetch({ page: 1, ministryStatus: 'unregistered' }) }}>غير مسجّل</button>
              </div>
            </div>
          )}

          <span className="text-xs text-gray-500 mr-auto">
            * حقلا التاريخ إلزاميان، والحد الأقصى شهر واحد (بحد أقصى {MAX_REPORT_RANGE_DAYS} يومًا)
          </span>
        </div>

        {advancedOpen && (
          <>
            {/* بيانات الطفل */}
            <h4 className="text-sm font-semibold text-gray-500 mb-2 mt-4">بيانات الطفل</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">اسم الطفل</label>
                <input type="text" value={childName} onChange={e => setChildName(e.target.value)}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">الجنسية</label>
                <select value={nationalityFilter} onChange={e => setNationalityFilter(e.target.value)}
                  className="input-field">
                  <option value="all">الكل</option>
                  <option value="egyptian">مصر</option>
                  <option value="non_egyptian">غير مصري</option>
                  {NATIONALITIES.filter(n => !n.startsWith('مصر')).map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* بيانات الأب */}
            <h4 className="text-sm font-semibold text-gray-500 mb-2 mt-4">بيانات الأب</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">اسم الأب</label>
                <input type="text" value={fatherName} onChange={e => setFatherName(e.target.value)}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">اسم الجد</label>
                <input type="text" value={fatherGrandfather} onChange={e => setFatherGrandfather(e.target.value)}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">الرقم القومي</label>
                <input type="text" value={fatherNationalId} onChange={e => setFatherNationalId(e.target.value)}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">جواز السفر</label>
                <input type="text" value={fatherPassport} onChange={e => setFatherPassport(e.target.value)}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">تليفون الأب</label>
                <input type="text" value={fatherPhone} onChange={e => setFatherPhone(e.target.value)}
                  className="input-field" />
              </div>
            </div>

            {/* بيانات الأم */}
            <h4 className="text-sm font-semibold text-gray-500 mb-2 mt-4">بيانات الأم</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">اسم الأم</label>
                <input type="text" value={motherName} onChange={e => setMotherName(e.target.value)}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">اسم الجد</label>
                <input type="text" value={motherGrandfather} onChange={e => setMotherGrandfather(e.target.value)}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">الرقم القومي</label>
                <input type="text" value={motherNationalId} onChange={e => setMotherNationalId(e.target.value)}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">جواز السفر</label>
                <input type="text" value={motherPassport} onChange={e => setMotherPassport(e.target.value)}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">تليفون الأم</label>
                <input type="text" value={motherPhone} onChange={e => setMotherPhone(e.target.value)}
                  className="input-field" />
              </div>
            </div>

            {/* التطعيم */}
            <h4 className="text-sm font-semibold text-gray-500 mb-2 mt-4">التطعيم</h4>
            {filtersDisabled && (
              <p className="text-xs text-red-600 mb-2">
                فلتر «رقم التشغيلة (Lot)» وفلترا «القائم بالتطعيم» و«المدخل» يعملون فقط عند تحديد مستشفى معيّن من فلتر المستشفى أعلاه
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">رقم التشغيلة (Lot)</label>
                <input type="text" value={batchNumber} onChange={e => setBatchNumber(e.target.value)}
                  disabled={filtersDisabled}
                  className="input-field disabled:bg-gray-100 disabled:cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">القائم بالتطعيم</label>
                <select value={vaccinatorId} onChange={e => setVaccinatorId(e.target.value)}
                  disabled={filtersDisabled}
                  className="input-field disabled:bg-gray-100 disabled:cursor-not-allowed">
                  <option value="">الكل</option>
                  {vaccinatorOptions.map(v => (
                    <option key={v.id} value={v.id}>{v.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">المدخل (أدخل السجل)</label>
                <select value={enteredBy} onChange={e => setEnteredBy(e.target.value)}
                  disabled={filtersDisabled}
                  className="input-field disabled:bg-gray-100 disabled:cursor-not-allowed">
                  <option value="">الكل</option>
                  {entryUserOptions.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-3 mt-4">
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? "جاري البحث..." : "بحث"}
          </button>
          <button type="button" onClick={handleReset} className="btn btn-secondary">
            <RotateCcw size={16} /> تفريغ الحقول
          </button>
          {records.length > 0 && (
            <button type="button" onClick={handlePrint} disabled={fullLoading}
              className="btn btn-secondary">
              <Printer size={16} /> {fullLoading ? 'جاري تحميل كامل البيانات...' : 'طباعة الكل'}
            </button>
          )}
        </div>
      </form>

      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded-lg">{error}</div>
      )}

      {/* الإحصائيات */}
      {stats && (
        <div className="space-y-4">
          <SectionHeader icon={Baby} title="إحصائيات النتائج" subtitle="ذكور / إناث / إجمالي ضمن النطاق المحدد" />
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

          {isMinistry && (
            <div className="card p-4">
              <h4 className="font-semibold mb-3">التوزيع حسب المستشفى</h4>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr className="text-right">
                      <th>المستشفى</th>
                      <th>ذكور</th>
                      <th>إناث</th>
                      <th>الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byHospital.map(h => (
                      <tr key={h.hospital_id}>
                        <td>{h.hospital_name}</td>
                        <td>{h.male}</td>
                        <td>{h.female}</td>
                        <td className="font-bold">{h.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* النتائج */}
      {records.length > 0 && (
        <div ref={printRef} className="card overflow-hidden">
          {/* ترويسة الطباعة فقط */}
          <div className="hidden print:block text-center mb-4 p-4">
            <h1 className="text-xl font-bold">تقرير الأطفال المتطعّمين</h1>
            {reportDateRange && <p className="mt-1 text-sm">{reportDateRange}</p>}
            <p className="mt-1 text-sm">المستشفى: {reportHospitalName}</p>
          </div>

          <div className="p-4 border-b flex flex-wrap items-center justify-between gap-2 print:hidden">
            <div>
              <h3 className="font-semibold">نتائج البحث ({total} سجل)</h3>
              <p className="text-xs text-gray-500 mt-1">اضغط على أي صف لفتح سجل الطفل كاملًا في تبويب جديد — تبقى نتائج البحث كما هي</p>
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

          {/* جدول الشاشة (الصفحة الحالية فقط) */}
          <div className="overflow-x-auto print:hidden">
            <table>
              <thead>
                <tr className="text-right">
                  {isMinistry && <SortableTh label="المستشفى" sortKey="hospital" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />}
                  <SortableTh label="اسم الطفل" sortKey="child_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="تاريخ الميلاد" sortKey="birth_date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="اسم الأب" sortKey="father_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <th>رقم الأب القومي</th>
                  <SortableTh label="اسم الأم" sortKey="mother_name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <th>رقم الأم القومي</th>
                  <SortableTh label="تاريخ التطعيم" sortKey="vaccination_date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <th>القائم بالتطعيم</th>
                  <th>المدخل</th>
                  <th>رقم التشغيلة</th>
                  <th>تاريخ دخول الطلبية</th>
                  <th>الحالة</th>
                  {isMinistry && <th>الميكنة</th>}
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="row-clickable" onClick={() => window.open(`/reports/child/${r.id}`, '_blank', 'noopener,noreferrer')}>
                    {isMinistry && <td>{r.hospitals?.name ?? '-'}</td>}
                    <td className="font-medium">{r.child_full_name}</td>
                    <td>{r.birth_date}</td>
                    <td>{formatFullName(r.father_first_name, r.father_grandfather_name)}</td>
                    <td>{r.father_national_id}</td>
                    <td>{formatFullName(r.mother_first_name, r.mother_grandfather_name)}</td>
                    <td>{r.mother_national_id ?? '-'}</td>
                    <td>{r.vaccination_date}</td>
                    <td>{r.vaccinators?.full_name ?? '-'}</td>
                    <td>{r.entered_by_name ?? '-'}</td>
                    <td>{r.vaccine_batches?.batch_number ?? '-'}</td>
                    <td>{r.vaccine_batches?.delivery_date ?? '-'}</td>
                    <td>
                      {/* نص حالة ملوّن مباشر (بند 1) — وليس شارة — في جداول القوائم */}
                      <span className={r.is_verified ? 'status-verified' : 'status-unverified'}>
                        {r.is_verified ? 'موثّق' : 'غير موثّق'}
                      </span>
                    </td>
                    {isMinistry && (
                      <td>
                        <span className={r.ministry_registered ? 'status-verified' : 'status-unverified'}>
                          {r.ministry_registered ? 'مسجّل' : 'غير مسجّل'}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* جدول الطباعة (كامل النتيجة) */}
          {printRows && (
            <div className="hidden print:block overflow-x-auto">
              <table>
                <thead>
                  <tr className="text-right">
                    {isMinistry && <th>المستشفى</th>}
                    <th>اسم الطفل</th>
                    <th>تاريخ الميلاد</th>
                    <th>اسم الأب</th>
                    <th>رقم الأب القومي</th>
                    <th>اسم الأم</th>
                    <th>رقم الأم القومي</th>
                    <th>تاريخ التطعيم</th>
                    <th>القائم بالتطعيم</th>
                    <th>المدخل</th>
                    <th>رقم التشغيلة</th>
                    <th>تاريخ دخول الطلبية</th>
                    <th>الحالة</th>
                    {isMinistry && <th>الميكنة</th>}
                  </tr>
                </thead>
                <tbody>
                  {printRows.map(r => (
                    <tr key={r.id}>
                      {isMinistry && <td>{r.hospitals?.name ?? '-'}</td>}
                      <td>{r.child_full_name}</td>
                      <td>{r.birth_date}</td>
                      <td>{formatFullName(r.father_first_name, r.father_grandfather_name)}</td>
                      <td>{r.father_national_id}</td>
                      <td>{formatFullName(r.mother_first_name, r.mother_grandfather_name)}</td>
                      <td>{r.mother_national_id ?? '-'}</td>
                      <td>{r.vaccination_date}</td>
                      <td>{r.vaccinators?.full_name ?? '-'}</td>
                      <td>{r.entered_by_name ?? '-'}</td>
                      <td>{r.vaccine_batches?.batch_number ?? '-'}</td>
                      <td>{r.vaccine_batches?.delivery_date ?? '-'}</td>
                      <td>{r.is_verified ? 'موثّق' : 'غير موثّق'}</td>
                      {isMinistry && <td>{r.ministry_registered ? 'مسجّل' : 'غير مسجّل'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* الترحيل (Pagination) — بند 5 */}
          <div className="p-4 border-t flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-3">
              <select
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-auto"
                value={pageSize === 'all' ? 'all' : String(pageSize)}
                onChange={e => handlePageSizeChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / صفحة</option>)}
                <option value="all">الكل</option>
              </select>
              <span className="text-sm text-gray-600">
                عرض {start} - {end} من إجمالي {shownTotal} سجل
              </span>
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              <button className="page-btn" disabled={page <= 1} onClick={() => handlePageChange(1)} title="الأولى">
                <ChevronsRight size={16} />
              </button>
              <button className="page-btn" disabled={page <= 1} onClick={() => handlePageChange(page - 1)} title="السابقة">
                <ChevronRight size={16} />
              </button>
              {getPageNumbers().map(n => (
                <button key={n} className={`page-btn ${n === page ? 'active' : ''}`} onClick={() => handlePageChange(n)}>
                  {n}
                </button>
              ))}
              <button className="page-btn" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)} title="التالية">
                <ChevronLeft size={16} />
              </button>
              <button className="page-btn" disabled={page >= totalPages} onClick={() => handlePageChange(totalPages)} title="الأخيرة">
                <ChevronsLeft size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && !hasSearched && !error && (
        <p className="text-center text-gray-500 py-8">استخدم نموذج البحث أعلاه لعرض التقارير</p>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          form, button { display: none !important; }
          body { background: white; }
          table { font-size: 10pt; width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 4px 6px; text-align: right; }
          .print\\:block { display: block !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
