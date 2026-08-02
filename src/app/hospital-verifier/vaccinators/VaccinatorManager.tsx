"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { Vaccinator } from "@/types/database"

interface Props {
  vaccinators: Vaccinator[]
  hospitalId: string
  userId: string
}

export default function VaccinatorManager({ vaccinators, hospitalId, userId }: Props) {
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setError("")
    setLoading(true)

    const { error: insertError } = await supabase
      .from('vaccinators')
      .insert({
        hospital_id: hospitalId,
        full_name: name.trim(),
        added_by: userId,
        is_active: true,
      } as never)

    if (insertError) {
      setError(insertError.message)
    } else {
      setName("")
      router.refresh()
    }

    setLoading(false)
  }

  async function handleToggle(id: string, currentActive: boolean) {
    const { error: updateError } = await supabase
      .from('vaccinators')
      .update({ is_active: !currentActive } as never)
      .eq('id', id)

    if (updateError) {
      setError(updateError.message)
    } else {
      router.refresh()
    }
  }

  // حذف ذكي: إن كان الاسم مسجّلًا على أطفال يُوقف فقط (يُزال من خيارات الإدخال مع بقاء السجل التاريخي)،
  // وإن لم يكن مستخدمًا يُحذف نهائيًا.
  async function handleDelete(v: Vaccinator) {
    setError("")
    const { count } = await supabase
      .from('child_vaccination_records')
      .select('id', { count: 'exact', head: true })
      .eq('vaccinator_id', v.id)
      .eq('is_deleted', false)

    if (count && count > 0) {
      const ok = window.confirm(
        `«${v.full_name}» مسجّل على ${count} طفل. لن يُحذف من السجلات التاريخية، لكن سيُزال من خيارات الإدخال. هل تريد المتابعة؟`
      )
      if (!ok) return
      const { error } = await supabase
        .from('vaccinators')
        .update({ is_active: false } as never)
        .eq('id', v.id)
      if (error) setError(error.message)
      else router.refresh()
    } else {
      const ok = window.confirm(`حذف نهائي لـ «${v.full_name}»؟ لا يوجد أي طفل مسجّل تحت اسمه.`)
      if (!ok) return
      const { error } = await supabase
        .from('vaccinators')
        .delete()
        .eq('id', v.id)
      if (error) setError(error.message)
      else router.refresh()
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="card p-4 flex gap-3">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="اسم القائم بالتطعيم..."
          required
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? "..." : "إضافة"}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded">{error}</div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-right">
              <th className="py-3 px-4 font-semibold">الاسم</th>
              <th className="py-3 px-4 font-semibold">الحالة</th>
              <th className="py-3 px-4 font-semibold"></th>
              <th className="py-3 px-4 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {vaccinators.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-500">
                  لا يوجد قائمون بالتطعيم بعد
                </td>
              </tr>
            ) : (
              vaccinators.map(v => (
                <tr key={v.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">{v.full_name}</td>
                  <td className="py-3 px-4">
                    {v.is_active
                      ? <span className="badge badge-success">نشط</span>
                      : <span className="badge badge-danger">موقوف</span>
                    }
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleToggle(v.id, v.is_active)}
                      className={`text-sm px-3 py-1 rounded ${v.is_active ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                    >
                      {v.is_active ? 'إيقاف' : 'تفعيل'}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleDelete(v)}
                      className="text-sm px-3 py-1 rounded bg-gray-100 text-gray-700 hover:bg-red-100 hover:text-red-700"
                    >
                      حذف
                    </button>
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
