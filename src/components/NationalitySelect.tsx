"use client"

import { useMemo, useRef, useState } from "react"
import { NATIONALITIES } from "@/lib/nationalities"

// تطبيع أحرف عربية للبحث داخل القائمة (أ/إ/آ = ا)
function normalizeSearch(s: string): string {
  return s.replace(/[أإآ]/g, 'ا').toLowerCase().trim()
}

interface Props {
  value: string
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
}

// قائمة جنسيات منسدلة قابلة للبحث: الكتابة تُفلتر القائمة بالبادئة (مثلًا "س" تُظهر
// كل الجنسيات التي تبدأ بحرف السين) — بند السادس من تعديلات الواجهة.
export default function NationalitySelect({ value, onChange, required, placeholder = "اختر الجنسية..." }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = normalizeSearch(query)
    if (!q) return NATIONALITIES
    return NATIONALITIES.filter(n => normalizeSearch(n).startsWith(q))
  }, [query])

  function handleSelect(name: string) {
    onChange(name)
    setQuery(name)
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        required={required}
        value={query}
        onFocus={() => { setQuery(""); setOpen(true) }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500">لا توجد نتيجة — اختر من القائمة</li>
          )}
          {filtered.map(n => (
            <li
              key={n}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(n)}
              className={`cursor-pointer px-3 py-2 text-sm hover:bg-blue-50 ${n === value ? 'bg-blue-50 font-semibold' : ''}`}
            >
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
