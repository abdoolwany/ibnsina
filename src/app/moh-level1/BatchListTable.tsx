"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { BatchBalanceView } from "@/types/database"

export default function BatchListTable({ balances }: { balances: BatchBalanceView[] }) {
  const [showEmptied, setShowEmptied] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const router = useRouter()
  const supabase = createClient()

  // إخفاء التشغيلات التي فرغت منها الطعوم افتراضيًا، مع إمكانية إظهارها للمراجعة
  const visible = showEmptied ? balances : balances.filter(b => b.remaining_balance > 0)

  async function handleDelete(batch: BatchBalanceView) {
    const confirmed = window.confirm(
      `تحذير: سيتم حذف تشغيلة «${batch.batch_number}» نهائيًا (${batch.total_quantity} جرعة).
      لا يمكن الحذف إلا إذا لم تُستخدم منها أي جرعة. هل أنت متأكد؟`
    )
    if (!confirmed) return

    setDeletingId(batch.batch_id)
    setError("")
    const { error: delError } = await supabase
      .from('vaccine_batches')
      .delete()
      .eq('id', batch.batch_id)

    if (delError) {
      setError(delError.message)
      setDeletingId(null)
    } else {
      router.refresh()
    }
  }

  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
        <input type="checkbox" checked={showEmptied} onChange={e => setShowEmptied(e.target.checked)}
          className="rounded border-gray-300" />
        إظهار التشغيلات التي فرغت منها الطعوم
      </label>
      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded mb-3">{error}</div>
      )}
      {visible.length === 0 ? (
        <p className="text-gray-500 text-center py-4">لا توجد دفعات بعد</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-right">
                <th className="py-2 px-3">رقم التشغيلة</th>
                <th className="py-2 px-3">الكمية</th>
                <th className="py-2 px-3">تاريخ التسليم</th>
                <th className="py-2 px-3">تاريخ الصلاحية</th>
                <th className="py-2 px-3">المستخدم</th>
                <th className="py-2 px-3">المتبقي</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(b => (
                <tr key={b.batch_id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3">{b.batch_number}</td>
                  <td className="py-2 px-3">{b.total_quantity}</td>
                  <td className="py-2 px-3">{b.delivery_date}</td>
                  <td className={`py-2 px-3 ${b.expiry_date < new Date().toISOString().slice(0, 10) ? 'text-red-600' : ''}`}>{b.expiry_date}</td>
                  <td className="py-2 px-3">{b.used_quantity}</td>
                  <td className={`py-2 px-3 font-bold ${b.remaining_balance <= 0 ? 'text-red-600' : 'text-green-600'}`}>{b.remaining_balance}</td>
                  <td className="py-2 px-3">
                    {b.used_quantity === 0 ? (
                      <div className="flex gap-2">
                        <Link href={`/moh-level1/batches/${b.batch_id}/edit`}
                          className="btn-soft px-3 py-1">
                          تعديل
                        </Link>
                        <button
                          onClick={() => handleDelete(b)}
                          disabled={deletingId === b.batch_id}
                          className="btn btn-danger px-3 py-1"
                        >
                          {deletingId === b.batch_id ? "جاري الحذف..." : "حذف"}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">مستخدمة — مقفلة</span>
                    )}
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
