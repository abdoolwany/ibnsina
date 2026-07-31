"use client"

import { useState, useRef } from "react"
import type { UserRole, Hospital } from "@/types/database"

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
  mother_first_name: string
  mother_grandfather_name: string
  mother_national_id: string | null
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
  const [hospitalId, setHospitalId] = useState("")
  const [records, setRecords] = useState<ChildRecord[]>([])
  const [stats, setStats] = useState<{ total: number; male: number; female: number; byHospital: HospitalStat[] } | null>(null)
  const [loading, setLoading] = useState(false)
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

  function formatFullName(firstName: string, grandfatherName: string): string {
    return `${firstName} ${grandfatherName}`
  }

  const hospitalMap = Object.fromEntries(hospitals.map(h => [h.id, h.name]))
  const selectedHospitalName = hospitalId ? hospitalMap[hospitalId] : null
  const reportHospitalName = selectedHospitalName
    ?? (userRole !== 'moh_admin' ? hospitals.map(h => h.name).join('، ') : 'كل المستشفيات')
  const reportDateRange = dateFrom || dateTo ? `من ${dateFrom || '...'} إلى ${dateTo || '...'}` : ''

  return (
    <div className="space-y-6">
      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">من تاريخ</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">إلى تاريخ</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
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
        <div className="flex gap-3">
          <button type="submit" disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {loading ? "جاري البحث..." : "بحث"}
          </button>
          {records.length > 0 && (
            <button type="button" onClick={handlePrint}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700">
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
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-sm text-gray-600">الإجمالي</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.male}</div>
              <div className="text-sm text-gray-600">ذكور</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <div className="text-2xl font-bold text-pink-600">{stats.female}</div>
              <div className="text-sm text-gray-600">إناث</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
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
        <div ref={printRef} className="bg-white rounded-lg shadow overflow-hidden">
          {/* ترويسة الطباعة فقط */}
          <div className="hidden print:block text-center mb-4 p-4">
            <h1 className="text-xl font-bold">تقرير الأطفال المتطعّمين</h1>
            {reportDateRange && <p className="mt-1 text-sm">{reportDateRange}</p>}
            <p className="mt-1 text-sm">المستشفى: {reportHospitalName}</p>
          </div>
          <div className="p-4 border-b print:hidden">
            <h3 className="font-semibold">نتائج البحث ({records.length})</h3>
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
                          ? <span className="text-green-600">موثق</span>
                          : <span className="text-yellow-600">غير موثق</span>
                        }
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
