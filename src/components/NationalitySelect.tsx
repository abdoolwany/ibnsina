"use client"

import { NATIONALITIES } from "@/lib/nationalities"

interface Props {
  value: string
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
}

// قائمة جنسيات منسدلة أصلية (select): لا تسمح بالكتابة الحرة إطلاقًا — يجب الاختيار
// من القائمة المحددة فقط (بند المواصفات: اختيار من القائمة لا إدخال نص حر).
// المتصفح يوفر بحثًا تلقائيًا بالحروف عند فتح القائمة نفسها.
export default function NationalitySelect({ value, onChange, required, placeholder = "اختر الجنسية..." }: Props) {
  return (
    <select
      required={required}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
    >
      <option value="">{placeholder}</option>
      {NATIONALITIES.map(n => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
  )
}
