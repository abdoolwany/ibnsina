"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { cairoToday } from "@/lib/time"
import type { Hospital } from "@/types/database"

export default function BatchForm({
  hospitals,
}: {
  hospitals: Hospital[]
}) {
  const [hospitalId, setHospitalId] = useState(hospitals[0]?.id ?? "")
  const [batchNumber, setBatchNumber] = useState("")
  const [quantity, setQuantity] = useState("")
  const [deliveryDate, setDeliveryDate] = useState("")
  const [expiryDate, setExpiryDate] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    const today = cairoToday()

    if (deliveryDate > today) {
      setError(`تاريخ دخول الطلبية (${deliveryDate}) لا يمكن أن يكون بعد اليوم (${today}).`)
      return
    }
    if (expiryDate < deliveryDate) {
      setError("تاريخ الصلاحية لا يمكن أن يسبق تاريخ دخول الطلبية.")
      return
    }

    setLoading(true)

    const { error: insertError } = await supabase
      .from('vaccine_batches')
      .insert({
        hospital_id: hospitalId,
        batch_number: batchNumber,
        quantity: parseInt(quantity, 10),
        delivery_date: deliveryDate,
        expiry_date: expiryDate,
        notes: notes || null,
      } as never)

    if (insertError) {
      setError(insertError.message)
    } else {
      setBatchNumber("")
      setQuantity("")
      setDeliveryDate("")
      setExpiryDate("")
      setNotes("")
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">المستشفى</label>
          <select
            value={hospitalId}
            onChange={(e) => setHospitalId(e.target.value)}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>
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
          <label className="block text-sm font-medium text-gray-700">تاريخ دخول الطلبية</label>
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

      <button
        type="submit"
        disabled={loading}
        className="btn btn-primary"
      >
        {loading ? "جاري الحفظ..." : "إضافة الدفعة"}
      </button>
    </form>
  )
}
