'use client'

import { useState } from 'react'
import type { ElementType } from 'react'
import { BarChart3 } from 'lucide-react'
import type { Hospital } from '@/types/database'

function SectionHeader({ icon: Icon, title, subtitle }: { icon: ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid place-items-center w-8 h-8 rounded-lg bg-blue-100 text-primary">
        <Icon size={16} />
      </span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
    </div>
  )
}

interface Props {
  hospitals: Hospital[]
  userRole: string
}

interface VaccinatedStats {
  total: number
  verified: number
  unverified: number
  male: number
  female: number
  egyptian: number
  non_egyptian: number
  ministry_registered: number
  ministry_unregistered: number
  nationality_breakdown: Array<{ nationality: string; count: number }>
}

// تقرير عدد المتطعمين خلال أي مدة (بلا حد 31 يومًا — القسم 9):
// عرض إحصاءات مجمّعة حسب التوثيق والنوع والجنسية، مع فلترة حسب المستشفى (للوزارة).
export default function VaccinatedCountContent({ hospitals, userRole }: Props) {
  const isMinistry = userRole === 'moh_admin' || userRole === 'moh_level1'
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [hospitalId, setHospitalId] = useState("")

  const [stats, setStats] = useState<VaccinatedStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [hasSearched, setHasSearched] = useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!from || !to) {
      setError("يجب تحديد تاريخ البداية والنهاية")
      return
    }
    if (from > to) {
      setError("تاريخ البداية يجب أن يكون قبل تاريخ النهاية")
      return
    }

    setLoading(true)
    try {
      const p = new URLSearchParams()
      p.set('from', from)
      p.set('to', to)
      if (hospitalId) p.set('hospital_id', hospitalId)

      const res = await fetch(`/api/reports/vaccinated-count?${p.toString()}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'فشل في تحميل التقرير')
      }
      const data = await res.json()
      setStats(data.statistics ?? null)
      setHasSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ')
    }
    setLoading(false)
  }

  function handleReset() {
    setFrom("")
    setTo("")
    setHospitalId("")
    setStats(null)
    setError("")
    setHasSearched(false)
  }

  const statCards = stats ? [
    { label: 'الإجمالي', value: stats.total, color: 'text-primary' },
    { label: 'موثّق', value: stats.verified, color: 'text-green-600' },
    { label: 'غير موثّق', value: stats.unverified, color: 'text-amber-600' },
    { label: 'ذكور', value: stats.male, color: 'text-blue-600' },
    { label: 'إناث', value: stats.female, color: 'text-pink-600' },
    { label: 'مصري', value: stats.egyptian, color: 'text-indigo-600' },
    { label: 'غير مصري', value: stats.non_egyptian, color: 'text-purple-600' },
    ...(isMinistry ? [
      { label: 'مسجّل على الميكنة', value: stats.ministry_registered, color: 'text-emerald-600' },
      { label: 'غير مسجّل على الميكنة', value: stats.ministry_unregistered, color: 'text-slate-600' },
    ] : []),
  ] : []

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="card p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">من تاريخ التطعيم *</label>
            <input type="date" required value={from} onChange={e => setFrom(e.target.value)}
              className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">إلى تاريخ التطعيم *</label>
            <input type="date" required value={to} onChange={e => setTo(e.target.value)}
              className="input-field" />
          </div>
          {isMinistry && (
            <div>
              <label className="block text-sm font-medium text-gray-700">المستشفى</label>
              <select value={hospitalId} onChange={e => setHospitalId(e.target.value)}
                className="input-field">
                <option value="">كل المستشفيات</option>
                {hospitals.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'جاري التحميل...' : 'عرض الإحصائيات'}
          </button>
          <button type="button" onClick={handleReset} className="btn btn-secondary">إعادة تعيين</button>
          <span className="text-xs text-gray-500 mr-auto">
            * حقلا التاريخ إلزاميان — يُحسب عدد المتطعمين خلال أي مدة دون حدود
          </span>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded-lg">{error}</div>
      )}

      {stats && (
        <div className="space-y-4">
          <SectionHeader icon={BarChart3} title="إحصائيات عدد المتطعمين" subtitle="الإجمالي / التوثيق / النوع / الجنسية ضمن النطاق المحدد" />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4">
            {statCards.map(c => (
              <div key={c.label} className="card p-4 text-center">
                <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                <div className="text-sm text-gray-600">{c.label}</div>
              </div>
            ))}
          </div>

          {stats.nationality_breakdown.length > 0 && (
            <div className="card p-4">
              <h4 className="font-semibold mb-3">التوزيع حسب الجنسية</h4>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr className="text-right">
                      <th>الجنسية</th>
                      <th>العدد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.nationality_breakdown.map(n => (
                      <tr key={n.nationality}>
                        <td>{n.nationality}</td>
                        <td className="font-bold">{n.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {hasSearched && stats && stats.total === 0 && (
        <div className="text-center text-gray-500 py-8">لا توجد سجلات ضمن النطاق المحدد</div>
      )}
    </div>
  )
}
