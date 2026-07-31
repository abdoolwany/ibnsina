"use client"

import { useState } from "react"
import type { UserRole, Hospital } from "@/types/database"

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
  const [includeExpired, setIncludeExpired] = useState(false)
  const [rows, setRows] = useState<BatchMovementRow[]>([])
  const [totals, setTotals] = useState<{ received: number; used: number; remaining: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const isMinistry = userRole === 'moh_admin' || userRole === 'moh_level1'

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (hospitalId) params.set('hospital_id', hospitalId)
    if (includeExpired) params.set('include_expired', 'true')

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
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">من تاريخ (دخول التشغيلة)</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">إلى تاريخ (دخول التشغيلة)</label>
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
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={includeExpired} onChange={e => setIncludeExpired(e.target.checked)}
              className="rounded border-gray-300" />
            إظهار التشغيلات المنتهية الصلاحية
          </label>
          <button type="submit" disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {loading ? "جاري البحث..." : "عرض التقرير"}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded-lg">{error}</div>
      )}

      {rows.length === 0 && !loading && !error && (
        <p className="text-center text-gray-500 py-8">حدد الفترة الزمنية واضغط "عرض التقرير"</p>
      )}

      {rows.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="font-semibold">نتائج التقرير ({rows.length} تشغيلة)</h3>
            <p className="text-xs text-gray-500 mt-1">
              المستخدم = عدد الأطفال المطعّمين من هذه التشغيلة خلال الفترة المحددة، المتبقي = الرصيد الحالي
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-right">
                  {isMinistry && <th className="py-3 px-3">المستشفى</th>}
                  <th className="py-3 px-3">رقم التشغيلة</th>
                  <th className="py-3 px-3">تاريخ الدخول</th>
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
                    <td className={`py-2 px-3 ${r.expiry_date < new Date().toISOString().slice(0, 10) ? 'text-red-600' : ''}`}>{r.expiry_date}</td>
                    <td className="py-2 px-3">{r.received}</td>
                    <td className="py-2 px-3">{r.used}</td>
                    <td className={`py-2 px-3 font-bold ${r.remaining <= 0 ? 'text-red-600' : 'text-green-600'}`}>{r.remaining}</td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="bg-gray-50 font-bold">
                    {isMinistry && <td className="py-3 px-3" />}
                    <td className="py-3 px-3" colSpan={isMinistry ? 3 : 2}>الإجمالي</td>
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
