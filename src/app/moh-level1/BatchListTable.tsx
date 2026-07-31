"use client"

import { useState } from "react"
import type { VaccineBatch } from "@/types/database"

export default function BatchListTable({ batches }: { batches: VaccineBatch[] }) {
  const [showExpired, setShowExpired] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const visible = showExpired ? batches : batches.filter(b => b.expiry_date >= today)

  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
        <input type="checkbox" checked={showExpired} onChange={e => setShowExpired(e.target.checked)}
          className="rounded border-gray-300" />
        إظهار التشغيلات المنتهية الصلاحية
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
              </tr>
            </thead>
            <tbody>
              {visible.map(b => (
                <tr key={b.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3">{b.batch_number}</td>
                  <td className="py-2 px-3">{b.quantity}</td>
                  <td className="py-2 px-3">{b.delivery_date}</td>
                  <td className={`py-2 px-3 ${b.expiry_date < today ? 'text-red-600' : ''}`}>{b.expiry_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
