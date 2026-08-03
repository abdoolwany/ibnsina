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
  const [showInactive, setShowInactive] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const visible = showInactive ? vaccinators : vaccinators.filter(v => v.is_active)

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

  // إخفاء: يُوقف الاسم (is_active=false) فيُختفى من القائمة وخيارات الإدخال،
  // مع بقائه كاملًا في السجلات التاريخية لأي طفل سبق أن سُجِّل باسمه.
  async function handleHide(v: Vaccinator) {
    setError("")
    const ok = window.confirm(
      `إخفاء «${v.full_name}» من قائمة القائمين بالتطعيم؟\nلن يُحذف أي سجل تاريخي باسمه، ويمكن إظهاره مجددًا من خيار «عرض الموقوفين».`
    )
    if (!ok) return
    const { error } = await supabase
      .from('vaccinators')
      .update({ is_active: false } as never)
      .eq('id', v.id)
    if (error) setError(error.message)
    else router.refresh()
  }

  // حذف نهائي: يسمح به فقط لو لم يكن الاسم مرتبطًا بأي سجل أطفال (تفرضه قاعدة البيانات نفسها
  // عبر سياسة verifier_delete_vaccinators)، عكس الإخفاء الذي يحفظ السجل التاريخي.
  async function handleDelete(v: Vaccinator) {
    setError("")
    const ok = window.confirm(
      `حذف «${v.full_name}» نهائيًا من قائمة القائمين بالتطعيم؟\n(لا يمكن الحذف إذا كان الاسم مرتبطًا بسجلات أطفال — وفي هذه الحالة استخدم «إخفاء».)`
    )
    if (!ok) return
    const { error } = await supabase
      .from('vaccinators')
      .delete()
      .eq('id', v.id)
    if (error) {
      setError(`لا يمكن حذف «${v.full_name}» لأنه مرتبط بسجلات تطعيم محفوظة. استخدم «إخفاء» للحفاظ على السجل التاريخي.`)
    } else {
      router.refresh()
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

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="h-4 w-4"
          />
          عرض الموقوفين (المخفيين) لإعادة تفعيلهم
        </label>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-right">
              <th className="py-3 px-4 font-semibold">الاسم</th>
              <th className="py-3 px-4 font-semibold">الحالة</th>
              <th className="py-3 px-4 font-semibold">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-gray-500">
                  {showInactive ? 'لا يوجد قائمون موقوفون' : 'لا يوجد قائمون بالتطعيم بعد'}
                </td>
              </tr>
            ) : (
              visible.map(v => (
                <tr key={v.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">{v.full_name}</td>
                  <td className="py-3 px-4">
                    {v.is_active
                      ? <span className="badge badge-success">نشط</span>
                      : <span className="badge badge-danger">موقوف</span>
                    }
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      {!v.is_active && (
                        <button
                          onClick={() => handleToggle(v.id, v.is_active)}
                          className="text-sm px-3 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200"
                        >
                          تفعيل
                        </button>
                      )}
                      {v.is_active && (
                        <button
                          onClick={() => handleHide(v)}
                          className="text-sm px-3 py-1 rounded bg-gray-100 text-gray-700 hover:bg-red-100 hover:text-red-700"
                        >
                          إخفاء
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(v)}
                        className="text-sm px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                      >
                        حذف نهائي
                      </button>
                    </div>
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
