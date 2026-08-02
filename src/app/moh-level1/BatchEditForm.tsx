"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { cairoToday } from "@/lib/time"
import type { VaccineBatch } from "@/types/database"

export default function BatchEditForm({ batch }: { batch: VaccineBatch }) {
  const [batchNumber, setBatchNumber] = useState(batch.batch_number)
  const [quantity, setQuantity] = useState(String(batch.quantity))
  const [deliveryDate, setDeliveryDate] = useState(batch.delivery_date)
  const [expiryDate, setExpiryDate] = useState(batch.expiry_date)
  const [notes, setNotes] = useState(batch.notes ?? "")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    const today = cairoToday()

    if (deliveryDate > today) {
      setError(`تاريخ التسليم (${deliveryDate}) لا يمكن أن يكون بعد اليوم (${today}).`)
      return
    }
    if (expiryDate < deliveryDate) {
      setError("تاريخ الصلاحية لا يمكن أن يسبق تاريخ التسليم.")
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase
      .from('vaccine_batches')
      .update({
        batch_number: batchNumber,
        quantity: parseInt(quantity, 10),
        delivery_date: deliveryDate,
        expiry_date: expiryDate,
        notes: notes || null,
      } as never)
      .eq('id', batch.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      router.push('/moh-level1')
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">رقم التشغيلة</label>
          <input
            type="text"
            required
            value={batchNumber}
            onChange={(e) => setBatchNumber(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">الكمية</label>
          <input
            type="number"
            required
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">تاريخ التسليم</label>
          <input
            type="date"
            required
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">تاريخ الصلاحية</label>
          <input
            type="date"
            required
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">ملاحظات</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            rows={2}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded">{error}</div>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? "جاري الحفظ..." : "حفظ التعديلات"}
        </button>
        <button type="button" onClick={() => router.push('/moh-level1')} className="btn btn-secondary">
          إلغاء
        </button>
      </div>
    </form>
  )
}
