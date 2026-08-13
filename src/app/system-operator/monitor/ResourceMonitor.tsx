"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import type { MonitorData, QuotaLimits } from "@/types/monitoring"
import { formatBytes } from "@/lib/monitoring/projections"
import { formatCairoDateTime } from "@/lib/time"
import { TABLE_LABELS } from "@/components/storageLabels"

// ألوان شارة الحالة حسب نتيجة التوقع
const BADGE_COLORS: Record<string, string> = {
  ok: 'bg-green-100 text-green-800',
  safe: 'bg-green-100 text-green-800',
  no_growth: 'bg-green-100 text-green-800',
  insufficient_data: 'bg-yellow-100 text-yellow-800',
  no_data: 'bg-yellow-100 text-yellow-800',
  exceed: 'bg-red-100 text-red-800',
  exhausted: 'bg-red-100 text-red-800',
}
const badgeColor = (status: string) => BADGE_COLORS[status] ?? 'bg-gray-100 text-gray-700'

const STATUS_LABEL: Record<string, string> = {
  ok: 'متابعة',
  safe: 'ضمن الحد',
  no_growth: 'لا نمو',
  insufficient_data: 'قيد جمع البيانات',
  no_data: 'لا بيانات بعد',
  exceed: 'سيتجاوز الحد',
  exhausted: 'بلغ الحد',
}

// وصف كل مورد شهري (يتجدد) مع شرحه ووحدته
const QUOTA_META: Array<{ key: keyof QuotaLimits; label: string; unit: string; hint: string }> = [
  { key: 'supabase_db_limit_mb', label: 'حد قاعدة بيانات Supabase', unit: 'ميجابايت', hint: 'تراكمي — لا يتجدد. عند بلوغه تُرفض عمليات الكتابة.' },
  { key: 'supabase_bandwidth_limit_gb', label: 'نطاق Supabase الشهري', unit: 'جيجابايت', hint: 'صادر/وارد + سحب الملفات. لا يُقرأ من داخل القاعدة — يُعرض استهلاكه في لوحة Supabase.' },
  { key: 'supabase_storage_limit_gb', label: 'تخزين ملفات Supabase', unit: 'جيجابايت', hint: 'تراكمي (صور الهويات عند تفعيلها لاحقًا).' },
  { key: 'vercel_bandwidth_limit_gb', label: 'نقل Vercel (كل 30 يومًا)', unit: 'جيجابايت', hint: 'يتجدد تلقائيًا. الاستهلاك الفعلي في لوحة Vercel.' },
  { key: 'vercel_edge_requests_limit', label: 'طلبات Vercel Edge', unit: 'طلب', hint: 'يتجدد شهريًا.' },
  { key: 'vercel_function_invocations_limit', label: 'استدعاءات Vercel Functions', unit: 'استدعاء', hint: 'يتجدد شهريًا — المورد الأكثر حساسية لنشاطنا.' },
  { key: 'vercel_provisioned_memory_limit', label: 'ذاكرة Vercel المخصصة', unit: 'GB-hour', hint: 'يتجدد شهريًا.' },
  { key: 'vercel_build_minutes_limit', label: 'دقائق بناء Vercel', unit: 'دقيقة', hint: '6,000 دقيقة شهريًا — بناء واحد متزامن في الخطة المجانية.' },
  { key: 'vercel_fast_origin_transfer_limit_gb', label: 'نقل Vercel CDN السريع', unit: 'جيجابايت', hint: 'الاستجابة من الحافة بدون خادم.' },
]

function Sparkline({ points, limitBytes }: { points: Array<{ captured_at: string; database_bytes: number }>; limitBytes: number }) {
  if (points.length < 2) {
    return <p className="text-xs text-gray-400 py-4 text-center">تُجمع اللقطات يوميًا — سيظهر الرسم البياني بعد لقطتين</p>
  }
  const W = 300
  const H = 60
  const max = Math.max(...points.map(p => p.database_bytes), limitBytes, 1)
  const min = Math.min(...points.map(p => p.database_bytes), 0)
  const range = Math.max(max - min, 1)
  const step = points.length > 1 ? W / (points.length - 1) : 0
  const coords = points.map((p, i) => `${(i * step).toFixed(1)},${(H - ((p.database_bytes - min) / range) * (H - 6) - 3).toFixed(1)}`)
  const limitY = (H - ((limitBytes - min) / range) * (H - 6) - 3).toFixed(1)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" role="img" aria-label="تطور حجم قاعدة البيانات">
      <line x1="0" x2={W} y1={limitY} y2={limitY} stroke="#ef4444" strokeDasharray="4 3" strokeWidth="1" />
      <polyline points={coords.join(' ')} fill="none" stroke="#0d9488" strokeWidth="2" />
      <circle cx={coords[coords.length - 1].split(',')[0]} cy={coords[coords.length - 1].split(',')[1]} r="2.5" fill="#0d9488" />
    </svg>
  )
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badgeColor(status)}`}>{STATUS_LABEL[status] ?? status}</span>
}

function StatBox({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-teal-50 rounded-lg p-3">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

export default function ResourceMonitor() {
  const [data, setData] = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [limits, setLimits] = useState<QuotaLimits | null>(null)

  const fetchAll = useCallback(async () => {
    const res = await fetch('/api/system/monitor')
    if (!res.ok) throw new Error((await res.json()).error ?? 'فشل جلب بيانات المراقبة')
    return await res.json() as MonitorData
  }, [])

  const load = useCallback(() => {
    fetchAll()
      .then((d) => {
        setData(d)
        setLimits(d.quotas)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'خطأ'))
      .finally(() => setLoading(false))
  }, [fetchAll])

  useEffect(() => { load() }, [load])

  async function recordSnapshot() {
    setBusy(true)
    setMessage(null)
    const res = await fetch('/api/system/monitor/snapshot', { method: 'POST' })
    const body = await res.json()
    setBusy(false)
    if (!res.ok) { setMessage({ ok: false, text: body.error ?? 'خطأ' }); return }
    setMessage({ ok: true, text: `تم تسجيل لقطة جديدة (${body.database_size_pretty})` })
    await load()
  }

  async function saveQuotas() {
    if (!limits) return
    setBusy(true)
    setMessage(null)
    const res = await fetch('/api/system/monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(limits),
    })
    const body = await res.json()
    setBusy(false)
    if (!res.ok) { setMessage({ ok: false, text: body.error ?? 'خطأ' }); return }
    setMessage({ ok: true, text: 'تم حفظ حدود الباقات' })
    await load()
  }

  if (loading) return <p className="text-gray-500">جاري تحميل بيانات المراقبة...</p>
  if (!data) return <p className="text-red-600">{error || 'تعذر تحميل البيانات'}</p>

  const db = data.db
  const dbPercent = db.limit_bytes > 0 ? Math.min(100, (db.size_bytes / db.limit_bytes) * 100) : 0
  const dbRemainingMb = Math.max(0, (db.limit_bytes - db.size_bytes) / (1024 * 1024))
  const barColor = dbPercent > 80 ? 'bg-red-500' : dbPercent > 50 ? 'bg-yellow-500' : 'bg-primary'
  const health = db.latest_health_check

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 p-3 text-sm text-red-700 rounded-lg">{error}</div>}
      {message && (
        <div className={`p-3 text-sm rounded-lg ${message.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* شريط الإجراءات */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-500">
          آخر تحديث: <span className="font-semibold text-gray-800">{formatCairoDateTime(data.captured_at)}</span>
        </div>
        <div className="flex gap-3">
          <button disabled={busy} onClick={load} className="btn btn-secondary">تحديث الآن</button>
          <button disabled={busy} onClick={recordSnapshot} className="btn btn-primary">تسجيل لقطة الآن</button>
        </div>
      </div>

      {/* 1) قاعدة البيانات (مورد تراكمي) */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-lg">قاعدة البيانات (Supabase — مورد تراكمي)</h3>
          <StatusBadge status={db.projection.status} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <StatBox label="إجمالي الحجم" value={db.size_pretty} sub={`الحد ${formatBytes(db.limit_bytes)}`} />
          <StatBox label="النسبة من الحد" value={`${dbPercent.toFixed(1)}%`} sub="الخط الأحمر في الرسم يمثل الحد" />
          <StatBox label="المتبقي تقريبًا" value={`${dbRemainingMb.toFixed(0)} ميجا`} />
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
          <div className={`h-full ${barColor}`} style={{ width: `${dbPercent}%` }} />
        </div>
        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <span className="font-semibold">التوقع: </span>
          {db.projection.label}
        </div>
        <Sparkline points={db.snapshots} limitBytes={db.limit_bytes} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <StatBox label="اتصالات نشطة" value={String(db.active_connections)} sub="لحظي عبر Pooler" />
          <StatBox label="معدل كفاءة التخزين" value={db.cache_hit_ratio !== null ? `${db.cache_hit_ratio}%` : '—'} sub="أعلى = أفضل" />
          <StatBox label="حسابات المستخدمين" value={String(db.auth_users)} />
          <StatBox label="جلسات نشطة (7 أيام)" value={String(db.active_sessions_7d)} />
          <StatBox label="أطفال مسجلون" value={String(db.children_active)} sub={`${db.children_verified} موثق من ${db.children_total}`} />
          <StatBox label="سجلات التدقيق" value={String(db.audit_log_count)} sub={`اليوم: ${db.audit_today} (توثيق: ${db.audit_today_verified})`} />
          <StatBox label="ملفات التخزين" value={`${db.storage_objects} ملف`} sub={formatBytes(db.storage_bytes)} />
          <StatBox label="آخر فحص صحي" value={health ? formatCairoDateTime(health.checked_at) : '—'} sub={health ? `المصدر: ${health.source} — ${health.status}` : 'لم تُسجل نبضة بعد'} />
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">تفاصيل الجداول ({db.tables.length})</summary>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-right">
                  <th className="py-2 px-3">الجدول</th>
                  <th className="py-2 px-3">الصفوف (تقريبي)</th>
                  <th className="py-2 px-3">الحجم</th>
                </tr>
              </thead>
              <tbody>
                {db.tables.map(t => {
                  const key = `${t.schemaname}.${t.table_name}`
                  return (
                    <tr key={key} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <div className="text-sm text-gray-800">{TABLE_LABELS[key] ?? t.table_name}</div>
                        <div className="text-xs text-gray-400 font-mono">{key}</div>
                      </td>
                      <td className="py-2 px-3">{t.approx_rows}</td>
                      <td className="py-2 px-3">{t.size_pretty}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* 2) الموارد الشهرية المتجددة (Vercel) */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-lg">Vercel — الموارد الشهرية المتجددة</h3>
          <a href={data.vercel.usage_link} target="_blank" rel="noreferrer" className="text-sm text-primary underline">لوحة الاستهلاك الرسمية</a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
          <StatBox label="عمليات موثّقة (آخر 30 يومًا)" value={String(data.vercel.documented_ops_30d)} sub="حد أدنى — لا تشمل تصفح الصفحات" />
          <StatBox label="متوسط يومي" value={data.vercel.projection.avgPerDay > 0 ? data.vercel.projection.avgPerDay.toFixed(1) : '—'} />
          <StatBox label="التوقع نهاية الفترة" value={`${data.vercel.projection.percentAtEnd.toFixed(0)}%`} />
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-sm flex items-center gap-2">
          <StatusBadge status={data.vercel.projection.status} />
          <span>{data.vercel.projection.label}</span>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          الرقم المعروض «عمليات موثّقة» تقدير حدّ أدنى مبني على سجل التدقيق ونشاط المصادقة فقط، بينما الاستهلاك
          الحقيقي (صفحات، ملفات ثابتة، Edge) يُحسب في لوحة Vercel أعلاه. حدود هذه البطاقة قابلة للتعديل في «حدود الباقات».
        </p>
      </div>

      {/* 3) Supabase — نطاق وملفات */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-lg">Supabase — نطاق وتخزين الملفات</h3>
          <a href={data.supabase.usage_link} target="_blank" rel="noreferrer" className="text-sm text-primary underline">لوحة الاستهلاك الرسمية</a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatBox label="حد النطاق الشهري" value={`${data.supabase.bandwidth_limit_gb} جيجابايت`} sub="لا يُقرأ من داخل القاعدة — يُعرض في لوحة Supabase" />
          <StatBox label="ملفات التخزين المستخدمة" value={formatBytes(db.storage_bytes)} sub={`الحد ${data.quotas.supabase_storage_limit_gb} جيجابايت — ${db.storage_objects} ملف`} />
        </div>
      </div>

      {/* 4) GitHub */}
      <div className="card p-4">
        <h3 className="font-semibold text-lg mb-3">GitHub — النشر والمؤقتات</h3>
        {!data.github ? (
          <p className="text-sm text-gray-500">تعذر الاتصال بواجهة GitHub — المستودع المتنبأ به: abdoolwany/ibnsina</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <StatBox label="المستودع" value={data.github.repo.full_name} sub={data.github.repo.private ? 'خاص' : 'عام'} />
              <StatBox label="آخر رفع (push)" value={data.github.repo.pushed_at ? formatCairoDateTime(data.github.repo.pushed_at) : '—'} sub={`فرع ${data.github.repo.default_branch}`} />
              <StatBox label="حجم المستودع" value={`${(data.github.repo.size_kb / 1024).toFixed(1)} ميجا`} />
              <StatBox label="الرابط" value={<Link href={data.github.repo.html_url} target="_blank" className="text-primary underline text-sm">{data.github.repo.html_url}</Link>} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-right">
                    <th className="py-2 px-3">المؤقت</th>
                    <th className="py-2 px-3">آخر تشغيل</th>
                    <th className="py-2 px-3">النتيجة</th>
                    <th className="py-2 px-3">تشغيلات (7 أيام)</th>
                    <th className="py-2 px-3">دقائق (7 أيام)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.github.workflows.map(w => (
                    <tr key={w.path} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <span className="font-semibold">{w.name}</span>
                        <div className="text-xs text-gray-400 font-mono">{w.path}</div>
                      </td>
                      <td className="py-2 px-3">{w.last_run_at ? formatCairoDateTime(w.last_run_at) : 'لم يُشغَّل'}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${w.last_conclusion === 'success' ? 'bg-green-100 text-green-800' : w.last_conclusion ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                          {w.last_conclusion ?? '—'}
                        </span>
                      </td>
                      <td className="py-2 px-3">{w.runs_7d}</td>
                      <td className="py-2 px-3">{w.duration_minutes_7d} د</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 5) حدود الباقات (تعديل) */}
      <div className="card p-4">
        <h3 className="font-semibold text-lg mb-1">حدود الباقات (الخطط المجانية)</h3>
        <p className="text-xs text-gray-500 mb-3">
          تُستخدم في حسابات النسب والتوقعات. الافتراضي هو حدود الخطط المجانية الحالية (2026) — عدّلها إن تغيّرت.
        </p>
        {limits && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {QUOTA_META.map(m => (
                <div key={m.key}>
                  <label className="block text-sm font-medium text-gray-700">{m.label}</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number" min="1" value={limits[m.key]}
                      onChange={e => setLimits({ ...limits, [m.key]: Math.max(1, Number(e.target.value) || 1) })}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <span className="text-xs text-gray-500 whitespace-nowrap">{m.unit}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">{m.hint}</p>
                </div>
              ))}
            </div>
            <button disabled={busy} onClick={saveQuotas} className="btn btn-primary mt-4">حفظ الحدود</button>
          </>
        )}
      </div>
    </div>
  )
}
