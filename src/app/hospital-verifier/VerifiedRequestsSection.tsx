"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { UnverifyRequestStatus } from "@/types/database"

interface VerifiedChildItem {
  id: string
  child_full_name: string
  vaccination_date: string
  requestStatus?: UnverifyRequestStatus | null
}

interface Props {
  verifiedRecords: VerifiedChildItem[]
  hospitalId: string
  userId: string
}

// قسم «السجلات الموثّقة» لدى موثّق المستشفى: زر «طلب إعادة فتح» لكل سجل موثّق
// يرسل طلبًا إلى الوزارة، ويُظهر حالة الطلب إن وُجد (معلّق/مقبول/مرفوض).
export default function VerifiedRequestsSection({ verifiedRecords, hospitalId, userId }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const router = useRouter()
  const supabase = createClient()

  async function handleRequest(r: VerifiedChildItem) {
    const ok = window.confirm(
      `إرسال طلب إعادة فتح توثيق «${r.child_full_name}» إلى الوزارة؟\nبعد اعتماد الوزارة يصبح السجل قابلاً للتعديل مجددًا.`
    )
    if (!ok) return
    setBusyId(r.id)
    setError("")

    const { error: insertError } = await supabase
      .from('unverify_requests')
      .insert({
        record_id: r.id,
        hospital_id: hospitalId,
        requested_by: userId,
        status: 'pending',
      } as never)

    if (insertError) {
      setError(insertError.message)
    } else {
      router.refresh()
    }
    setBusyId(null)
  }

  return (
    <div className="card p-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">السجلات الموثّقة</h3>
        <p className="text-sm text-gray-600">
          السجلات الموثّقة مقفلة من التعديل. يمكن طلب إعادة فتحها من الوزارة.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded mb-3">{error}</div>
      )}

      {verifiedRecords.length === 0 ? (
        <p className="text-gray-500 text-sm">لا توجد سجلات موثّقة حاليًا.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-right">
              <th className="py-2 px-3">اسم الطفل</th>
              <th className="py-2 px-3">تاريخ التطعيم</th>
              <th className="py-2 px-3">حالة الطلب</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {verifiedRecords.map(r => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 font-medium">{r.child_full_name}</td>
                <td className="py-2 px-3">{r.vaccination_date}</td>
                <td className="py-2 px-3">
                  {r.requestStatus === 'pending' && (
                    <span className="badge badge-warning">معلّق</span>
                  )}
                  {r.requestStatus === 'approved' && (
                    <span className="badge badge-success">تم الفتح</span>
                  )}
                  {r.requestStatus === 'rejected' && (
                    <span className="badge badge-danger">مرفوض</span>
                  )}
                  {!r.requestStatus && <span className="text-gray-400">—</span>}
                </td>
                <td className="py-2 px-3">
                  {r.requestStatus === 'pending' ? (
                    <span className="text-sm text-gray-400">بانتظار رد الوزارة</span>
                  ) : (
                    <button
                      onClick={() => handleRequest(r)}
                      disabled={busyId === r.id}
                      className="text-sm px-3 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                    >
                      {busyId === r.id ? "..." : "طلب إعادة فتح"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
