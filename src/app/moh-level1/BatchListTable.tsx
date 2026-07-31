"use client"

import { useState } from "react"
import type { BatchBalanceView } from "@/types/database"

export default function BatchListTable({ balances }: { balances: BatchBalanceView[] }) {
  const [showEmptied, setShowEmptied] = useState(false)
  // إخفاء التشغيلات التي فرغت منها الطعوم افتراضيًا، مع إمكانية إظهارها للمراجعة
  const visible = showEmptied ? balances : balances.filter(b => b.remaining_balance > 0)

  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
        <input type="checkbox" checked={showEmptied} onChange={e => setShowEmptied(e.target.checked)}
          className="rounded border-gray-300" />
        إظهار التشغيلات التي فرغت منها الطعوم
      </label>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
