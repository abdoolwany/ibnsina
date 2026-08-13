// ============================================================
// المرجع الوحيد للتوقيت في المشروع — توقيت القاهرة (Africa/Cairo)
// كل التواريخ تُخزَّن UTC في قاعدة البيانات، وتُحوَّل هنا للتوقيت المحلي
// عند العرض أو عند حساب حدود الأيام (بداية اليوم ونهايته = 12 منتصف الليل).
// المنطقة الزمنية IANA تدير التوقيت الصيفي/الشتوي تلقائيًا حسب الفصل.
// ============================================================

export const APP_TIMEZONE = 'Africa/Cairo'

interface CairoParts {
  year: string
  month: string
  day: string
  hour: string
  minute: string
}

// استخراج مكونات التاريخ/الوقت وفق توقيت القاهرة عبر Intl (يدعم الشتوي/الصيفي)
function cairoParts(date: Date): CairoParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value
  return {
    year: parts.year ?? '',
    month: parts.month ?? '',
    day: parts.day ?? '',
    hour: parts.hour ?? '00',
    minute: parts.minute ?? '00',
  }
}

/** تاريخ اليوم الحالي بصيغة YYYY-MM-DD بتوقيت القاهرة */
export function cairoToday(): string {
  const p = cairoParts(new Date())
  return `${p.year}-${p.month}-${p.day}`
}

// لحظة UTC المطابقة لمنتصف ليل يوم محدد بتوقيت القاهرة.
// نبدأ من منتصف ليل UTC لنفس التاريخ، ثم نطرح عدد الدقائق التي فاتت
// من منتصف ليل القاهرة حتى تلك اللحظة (مبدأ: offset ثابت خلال ساعة) — كافٍ للفلاتر
export function cairoDayStartUtc(dateStr: string): string {
  const t0 = new Date(`${dateStr}T00:00:00Z`).getTime()
  const p = cairoParts(new Date(t0))
  const wallMinutes = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10)
  return new Date(t0 - wallMinutes * 60000).toISOString()
}

// إضافة أيام على تاريخ نصي (باستخدام ظهيرة UTC لتفادي مشاكل حدود النهار)
function addDaysUtc(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** نهاية اليوم (غير شاملة): منتصف ليل اليوم التالي بتوقيت القاهرة */
export function cairoDayEndExclusiveUtc(dateStr: string): string {
  return cairoDayStartUtc(addDaysUtc(dateStr, 1))
}

/** عرض تاريخ ووقت (مخزَّن UTC) بصيغة YYYY-MM-DD HH:mm بتوقيت القاهرة */
export function formatCairoDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const p = cairoParts(new Date(iso))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}

/** عرض تاريخ فقط (مخزَّن UTC) بصيغة YYYY-MM-DD بتوقيت القاهرة — لعمود "تاريخ القيد" */
export function formatCairoDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const p = cairoParts(new Date(iso))
  return `${p.year}-${p.month}-${p.day}`
}

// الحد الأقصى لمدة البحث في التقارير (القسم 9): شهر واحد، ويُفسَّر بـ 31 يومًا
// لاستيعاب الشهور التي تتجاوز 30 يومًا (مثال: 1 يناير → 31 يناير أو 1 فبراير)
export const MAX_REPORT_RANGE_DAYS = 31

/** عدد الأيام بين تاريخين نصيين (YYYY-MM-DD) — للتحقق من الحد الأقصى لمدة البحث */
export function dateRangeDays(dateFrom: string, dateTo: string): number {
  const from = new Date(`${dateFrom}T00:00:00Z`).getTime()
  const to = new Date(`${dateTo}T00:00:00Z`).getTime()
  return Math.round((to - from) / 86400000)
}
