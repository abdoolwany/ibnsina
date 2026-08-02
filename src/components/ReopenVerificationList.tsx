"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { VerifiedChildRecord } from "@/lib/db/children"

interface Props {
  records: VerifiedChildRecord[]
  showHospital?: boolean
}

// زر «إعادة فتح» في لوحة الوزارة: يفك التوثيق ليعود السجل قابلاً للتعديل من موثّق المستشفى.
// العملية مسموحة من moh_level1 (لمستشفياته) أو moh_admin (للنظام كله) وفق RLS والـ trigger.
export default function ReopenVerificationList({ records, showHospital = true }: Props) {
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleReopen(r: VerifiedChildRecord) {
    const ok = window.confirm(
      `إعادة فتح مرحلة ما قبل التوثيق لسجل «${r.child_full_name}»؟\nسيصبح السجل قابلاً للتعديل من موثّق المستشفى مجددًا، وسيُسجَّل ذلك في سجل التدقيق.`
    )
    if (!ok) return
    setBusyId(r.id)
    setError("")

    const { error: err } = await supabase
      .from('child_vaccination_records')
      .update({ is_verified: false, verified_by: null, verified_at: null } as never)
      .eq('id', r.id)

    if (err) {
      setError(err.message)
    } else {
      router.refresh()
    }
    setBusyId(null)
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold">إعادة فتح مرحلة التوثيق</h3>
        <p className="text-sm text-gray-600">
          السجلات الموثّقة أدناه مقفلة من التعديل. بفتحها من جديد يستطيع موثّق المستشفى تعديلها ثم توثيقها مرة أخرى.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded">{error}</div>
      )}

      {records.length === 0 ? (
        <p className="p-4 text-sm text-gray-500">لا توجد سجلات موثّقة حاليًا.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-right">
              <th className="py-3 px-4 font-semibold">الطفل</th>
              <th className="py-3 px-4 font-semibold">تاريخ التطعيم</th>
              {showHospital && <th className="py-3 px-4 font-semibold">المستشفى</th>}
              <th className="py-3 px-4 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4">{r.child_full_name}</td>
                <td className="py-3 px-4">{r.vaccination_date}</td>
                {showHospital && <td className="py-3 px-4">{r.hospital_name ?? '-'}</td>}
                <td className="py-3 px-4">
                  <button
                    onClick={() => handleReopen(r)}
                    disabled={busyId === r.id}
                    className="text-sm px-3 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                  >
                    {busyId === r.id ? "..." : "إعادة فتح"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
