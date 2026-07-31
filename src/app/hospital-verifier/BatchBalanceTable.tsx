"use client"

import { useState } from "react"
import type { BatchBalanceView } from "@/types/database"

export default function BatchBalanceTable({ balances }: { balances: BatchBalanceView[] }) {
  const [showExpired, setShowExpired] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const visible = showExpired ? balances : balances.filter(b => b.expiry_date >= today)

  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
        <input type="checkbox" checked={showExpired} onChange={e => setShowExpired(e.target.checked)}
          className="rounded border-gray-300" />
        إظهار التشغيلات المنتهية الصلاحية
      </label>
      {visible.length === 0 ? (
        <p className="text-gray-500 text-center py-8">لا توجد دفعات مستلمة بعد</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right border-b text-gray-600">
              <th className="py-2">رقم التشغيلة</th>
              <th className="py-2">تاريخ الصلاحية</th>
              <th className="py-2">المُسلَّم</th>
              <th className="py-2">المستخدم</th>
              <th className="py-2">المتبقي</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(b => (
              <tr key={b.batch_id} className="border-b hover:bg-gray-50">
                <td className="py-2 font-medium">{b.batch_number}</td>
                <td className={`py-2 ${b.expiry_date < today ? 'text-red-600' : ''}`}>{b.expiry_date}</td>
                <td className="py-2">{b.total_quantity}</td>
                <td className="py-2">{b.used_quantity}</td>
                <td className={`py-2 font-bold ${b.remaining_balance <= 0 ? 'text-red-600' : 'text-green-600'}`}>{b.remaining_balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
