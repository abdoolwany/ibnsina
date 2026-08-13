import type { CumulativeProjection, MonthlyProjection, SnapshotPoint } from '@/types/monitoring'

// ============================================================
// دوال التوقع الصافية (قابلة للاختبار بمعزل عن أي واجهة)
// حساب المدة التقريبية حتى نفاذ كل مورد بناء على إحصائيات التشغيل
// ============================================================

const MB = 1024 * 1024
const GB = 1024 * 1024 * 1024

/** تحويل بايت إلى تمثيل عربي مختصر */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} جيجا`
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} ميجا`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} كيلو`
  return `${Math.round(bytes)} بايت`
}

/** تحويل عدد أيام إلى جملة عربية (سنوات/شهور/أيام) */
export function formatDaysApprox(days: number): string {
  if (!Number.isFinite(days) || days < 0) return '—'
  if (days < 1) return 'أقل من يوم'
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30.4)
  const d = Math.round(days % 30.4)
  const parts: string[] = []
  if (years > 0) parts.push(`${years} سنة`)
  if (months > 0) parts.push(`${months} شهر`)
  if (d > 0 && years === 0) parts.push(`${d} يوم`)
  if (parts.length === 0) parts.push(`${days} يوم`)
  return parts.join(' و')
}

/** تاريخ متوقع = اليوم + عدد الأيام (بصيغة ISO) */
function addDaysToNow(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

/**
 * توقع مورد تراكمي (لا يتجدد شهريًا — مثل حجم قاعدة البيانات):
 * المدة حتى النفاذ = (الحد - المستخدم الحالي) ÷ متوسط النمو اليومي.
 * يُحسب متوسط النمو من لقطات يومية: (الأحدث - الأقدم) ÷ أيام الفرق.
 * يحتاج لقطتين على الأقل بفارق يوم كامل حتى يصبح التوقع ذا معنى.
 */
export function computeCumulativeProjection(
  used: number,
  limit: number,
  snapshots: SnapshotPoint[]
): CumulativeProjection {
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const remaining = Math.max(0, limit - used)

  if (limit > 0 && used >= limit) {
    return {
      status: 'exhausted',
      percent,
      used,
      remaining: 0,
      avgGrowthPerDay: 0,
      daysUntilLimit: 0,
      etaDate: new Date().toISOString(),
      label: 'تم بلوغ حد هذا المورد — يجب الترقية أو التنظيف فورًا.',
    }
  }

  if (snapshots.length < 2) {
    return {
      status: 'insufficient_data',
      percent,
      used,
      remaining,
      avgGrowthPerDay: 0,
      daysUntilLimit: null,
      etaDate: null,
      label: `قيد جمع البيانات — يحتاج لقطتين يوميتين على الأقل (تُجمع تلقائيًا يوميًا). حالياً ${snapshots.length} لقطة.`,
    }
  }

  const first = snapshots[0]
  const last = snapshots[snapshots.length - 1]
  const spanMs = new Date(last.captured_at).getTime() - new Date(first.captured_at).getTime()
  const spanDays = spanMs / (24 * 60 * 60 * 1000)

  if (spanDays < 1) {
    return {
      status: 'insufficient_data',
      percent,
      used,
      remaining,
      avgGrowthPerDay: 0,
      daysUntilLimit: null,
      etaDate: null,
      label: 'مدة الرصد أقل من يوم واحد — تُجمع اللقطات يوميًا وسيظهر التوقع بعد يومين.',
    }
  }

  const growth = last.database_bytes - first.database_bytes
  const avgGrowthPerDay = growth / spanDays

  if (avgGrowthPerDay <= 0) {
    return {
      status: 'no_growth',
      percent,
      used,
      remaining,
      avgGrowthPerDay: 0,
      daysUntilLimit: null,
      etaDate: null,
      label: 'لا يوجد نمو في هذا المورد خلال فترة الرصد — لن يُستنفد بالمعدل الحالي.',
    }
  }

  const daysUntilLimit = (limit - used) / avgGrowthPerDay
  return {
    status: 'ok',
    percent,
    used,
    remaining,
    avgGrowthPerDay,
    daysUntilLimit,
    etaDate: addDaysToNow(daysUntilLimit),
    label: `بمعدل نمو ${formatBytes(avgGrowthPerDay)}/يوم، يُتوقع نفاد المساحة خلال ~${formatDaysApprox(daysUntilLimit)} (نحو ${addDaysToNow(daysUntilLimit).slice(0, 10)}).`,
  }
}

/**
 * توقع مورد شهري (يتجدد تلقائيًا — مثل استدعاءات Vercel):
 * يُسقط استهلاك الفترة الحالية على كامل مدة الفترة:
 * المتوقع = الاستهلاك ÷ الأيام المنقضية × أيام الفترة.
 */
export function computeMonthlyProjection(
  currentUsage: number,
  limit: number,
  daysElapsed: number,
  periodDays = 30
): MonthlyProjection {
  if (limit <= 0 || daysElapsed <= 0) {
    return {
      status: 'no_data',
      avgPerDay: 0,
      projectedEnd: 0,
      percentAtEnd: 0,
      daysUntilLimit: null,
      label: 'لا توجد بيانات كافية للإسقاط بعد.',
    }
  }

  if (currentUsage >= limit) {
    return {
      status: 'exhausted',
      avgPerDay: currentUsage / daysElapsed,
      projectedEnd: currentUsage,
      percentAtEnd: 100,
      daysUntilLimit: 0,
      label: 'تم بلوغ حد الفترة الشهرية — قد تُوقف الخدمة حتى بداية الفترة التالية.',
    }
  }

  const avgPerDay = currentUsage / daysElapsed
  const projectedEnd = avgPerDay * periodDays
  const percentAtEnd = (projectedEnd / limit) * 100

  if (projectedEnd <= limit) {
    return {
      status: 'safe',
      avgPerDay,
      projectedEnd,
      percentAtEnd,
      daysUntilLimit: null,
      label: `مع معدل استهلاكك الحالي (${Math.round(avgPerDay)}/يوم) يُتوقع بلوغ ${Math.round(percentAtEnd)}% من الحد نهاية الفترة — ضمن الحد. يتجدد تلقائيًا بداية الفترة.`,
    }
  }

  const daysUntilLimit = limit / avgPerDay
  return {
    status: 'exceed',
    avgPerDay,
    projectedEnd,
    percentAtEnd,
    daysUntilLimit,
    label: `مع معدل استهلاكك الحالي يُتوقع بلوغ الحد بعد ~${formatDaysApprox(daysUntilLimit)} (نحو ${addDaysToNow(daysUntilLimit).slice(0, 10)}).`,
  }
}
