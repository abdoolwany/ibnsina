"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { PendingUnverifyRequest } from "@/lib/db/unverifyRequests"
import { resolveUnverifyRequest } from "@/lib/client/unverifyRequests"

interface Props {
  requests: PendingUnverifyRequest[]
  showHospital?: boolean
}

// صندوق طلبات إعادة فتح التوثيق في لوحتَي الوزارة (المستوى الأول والإدارة العليا):
// يعرض الطلبات المعلّقة فقط، مع اسم الطفل والمستشفى والطالب، وزرّي اعتماد/رفض.
// الاعتماد يفك التوثيق الفعلي عبر RPC آمن (resolve_unverify_request).
export default function UnverifyRequestsList({ requests, showHospital = true }: Props) {
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const router = useRouter()

  async function handleResolve(r: PendingUnverifyRequest, decision: 'approve' | 'reject') {
    const msg =
      decision === 'approve'
        ? `اعتماد طلب إعادة فتح توثيق «${r.child_full_name}»؟\nسيصبح السجل قابلاً للتعديل من موثّق المستشفى، ويُسجَّل ذلك في سجل التدقيق.`
        : `رفض طلب إعادة فتح توثيق «${r.child_full_name}»؟`
    if (!window.confirm(msg)) return

    setBusyId(r.id)
    setError("")
    const { error: err } = await resolveUnverifyRequest(r.id, decision)
    if (err) {
      setError(err)
    } else {
      router.refresh()
    }
    setBusyId(null)
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold">طلبات إعادة فتح مرحلة التوثيق</h3>
        <p className="text-sm text-gray-600">
          طلبات مقدَّمة من موثّقي المستشفيات لإعادة فتح سجلات موثّقة. الاعتماد يجعل السجل قابلاً للتعديل من المستشفى مجددًا.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded">{error}</div>
      )}

      {requests.length === 0 ? (
        <p className="p-4 text-sm text-gray-500">لا توجد طلبات إعادة فتح معلّقة حاليًا.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-right">
                <th className="py-3 px-4 font-semibold">الطفل</th>
                <th className="py-3 px-4 font-semibold">تاريخ التطعيم</th>
                {showHospital && <th className="py-3 px-4 font-semibold">المستشفى</th>}
                <th className="py-3 px-4 font-semibold">الطالب</th>
                <th className="py-3 px-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                // النقر في أي مكان في الصف يفتح سجل الطفل في تبويب جديد (كما في التقارير)،
                // وزرّا الاعتماد/الرفض يتوقفان عن الفتح (stopPropagation)
                <tr
                  key={r.id}
                  className="row-clickable border-b hover:bg-gray-50"
                  onClick={() => window.open(`/reports/child/${r.record_id}`, '_blank', 'noopener,noreferrer')}
                >
                  <td className="py-3 px-4">{r.child_full_name}</td>
                  <td className="py-3 px-4">{r.vaccination_date}</td>
                  {showHospital && <td className="py-3 px-4">{r.hospital_name ?? '-'}</td>}
                  <td className="py-3 px-4">{r.requester_name ?? '-'}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleResolve(r, 'approve')}
                        disabled={busyId === r.id}
                        className="text-sm px-3 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
                      >
                        {busyId === r.id ? "..." : "اعتماد"}
                      </button>
                      <button
                        onClick={() => handleResolve(r, 'reject')}
                        disabled={busyId === r.id}
                        className="text-sm px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                      >
                        رفض
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
