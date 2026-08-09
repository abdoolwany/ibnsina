"use client"

import { useState } from "react"
import type { BatchBalanceView } from "@/types/database"
import { cairoToday } from "@/lib/time"

export default function BatchBalanceTable({ balances }: { balances: BatchBalanceView[] }) {
  const [showEmptied, setShowEmptied] = useState(false)
  const today = cairoToday()
  // إخفاء التشغيلات التي فرغت منها الطعوم افتراضيًا، مع إمكانية إظهارها للمراجعة
  const visible = showEmptied ? balances : balances.filter(b => b.remaining_balance > 0)

  return (
    <div>
      <label className="flex items-center gap-3 text-sm text-gray-700 mb-3 cursor-pointer select-none">
        <span className="toggle">
          <input type="checkbox" checked={showEmptied} onChange={e => setShowEmptied(e.target.checked)} />
          <span className="slider" />
        </span>
        إظهار التشغيلات التي فرغت منها الطعوم
      </label>
      {visible.length === 0 ? (
        <p className="text-gray-500 text-center py-8">لا توجد دفعات مستلمة بعد</p>
      ) : (
        <table>
          <thead>
            <tr className="text-right">
              <th>رقم التشغيلة</th>
              <th>تاريخ الصلاحية</th>
              <th>المُسلَّم</th>
              <th>المستخدم</th>
              <th>المتبقي</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(b => (
              <tr key={b.batch_id}>
                <td className="font-medium">{b.batch_number}</td>
                <td className={b.expiry_date < today ? 'cell-critical' : ''}>{b.expiry_date}</td>
                <td>{b.total_quantity}</td>
                <td>{b.used_quantity}</td>
                <td className={b.remaining_balance <= 0 ? 'cell-critical' : 'cell-normal'}>{b.remaining_balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
