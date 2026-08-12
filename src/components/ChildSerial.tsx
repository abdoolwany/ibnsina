// مكوّن عرض الرقم المسلسل الشهري بالشكل الرياضي المتفق عليه:
//   الرقم في الأعلى (بسط) ← سطر ← الشهر-السنة (مقام)، مثال: 352 / 6-2026.
// يُستخدم في كل شاشات العرض والتقارير (سجل الطفل، القوائم، الاشعارات) دون تكرار
// (قاعدة DRY في القسم 12 من المواصفات). عند غياب الرقم يُعرض "—".
interface ChildSerialProps {
  serialNumber: number | null
  serialMonth: number | null
  serialYear: number | null
  size?: 'sm' | 'md' | 'lg'
  align?: 'start' | 'center'
}

const sizes = {
  sm: { num: 'text-sm', den: 'text-[10px]' },
  md: { num: 'text-lg', den: 'text-xs' },
  lg: { num: 'text-2xl', den: 'text-sm' },
}

export default function ChildSerial({ serialNumber, serialMonth, serialYear, size = 'md', align = 'center' }: ChildSerialProps) {
  if (!serialNumber || !serialMonth || !serialYear) {
    return <span className="text-gray-400">—</span>
  }
  const s = sizes[size]
  const alignClass = align === 'center' ? 'items-center' : 'items-start'
  return (
    <div className={`inline-flex flex-col ${alignClass} leading-none whitespace-nowrap`} dir="rtl" title={`الرقم المسلسل: ${serialNumber} / ${serialMonth}-${serialYear}`}>
      <span className={`${s.num} font-bold text-gray-900`}>{serialNumber}</span>
      <span className="w-full border-t border-gray-400 my-0.5" />
      <span className={`${s.den} text-gray-600`} dir="ltr">{serialMonth}-{serialYear}</span>
    </div>
  )
}
