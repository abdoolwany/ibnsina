"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Hospital } from "@/types/database"

export default function HospitalManager({ hospitals: initial }: { hospitals: Hospital[] }) {
  const [hospitals, setHospitals] = useState(initial)
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError("")

    const res = await fetch('/api/admin/hospitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setLoading(false); return }

    setName("")
    setHospitals([...hospitals, data.hospital])
    router.refresh()
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا المستشفى؟')) return

    const res = await fetch('/api/admin/hospitals', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }

    setHospitals(hospitals.filter(h => h.id !== id))
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="bg-white rounded-lg shadow p-4 flex gap-3 max-w-lg">
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="اسم المستشفى الجديد..." required
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <button type="submit" disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          {loading ? '...' : 'إضافة'}
        </button>
      </form>

      {error && <div className="bg-red-50 p-3 text-sm text-red-700 rounded">{error}</div>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-right">
              <th className="py-3 px-4">اسم المستشفى</th>
              <th className="py-3 px-4">تاريخ الإضافة</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {hospitals.length === 0 ? (
              <tr><td colSpan={3} className="py-8 text-center text-gray-500">لا توجد مستشفيات</td></tr>
            ) : (
              hospitals.map(h => (
                <tr key={h.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">{h.name}</td>
                  <td className="py-3 px-4 text-gray-500">{new Date(h.created_at).toLocaleDateString('ar-EG')}</td>
                  <td className="py-3 px-4">
                    <button onClick={() => handleDelete(h.id)}
                      className="text-red-600 hover:text-red-800 text-sm">حذف</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
