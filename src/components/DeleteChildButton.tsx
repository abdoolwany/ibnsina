"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { protectRecordBeforeDelete } from "@/lib/client/archive"

// حذف سجل طفل غير موثق من لوحتي مدخل البيانات والموثق.
// الحذف فعلي (hard delete) دون أرشفة، فتنجز الجرعة إلى رصيد الدفعة
// تلقائيًا عبر batch_balance_view. السجلات الموثقة ممنوع حذفها (RLS + trigger).
export default function DeleteChildButton({
  childId,
  childName,
}: {
  childId: string
  childName: string
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()
  const supabase = createClient()

  async function handleDelete() {
    const confirmed = window.confirm(
      `تحذير: سيتم حذف سجل الطفل «${childName}» نهائيًا، وستُرجَع جرعته إلى رصيد الدفعة. هل أنت متأكد؟`
    )
    if (!confirmed) return

    setDeleting(true)
    setError("")

    // ضمانة التسليم: أرشفة آخر حالة قبل الحذف الفردي (تُلغى عند الفشل)
    const { error: protectError } = await protectRecordBeforeDelete(childId)
    if (protectError) {
      setError(protectError)
      setDeleting(false)
      return
    }

    const { error: delError } = await supabase
      .from('child_vaccination_records')
      .delete()
      .eq('id', childId)

    if (delError) {
      setError(delError.message)
      setDeleting(false)
    } else {
      router.refresh()
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="btn btn-danger px-3 py-1"
      >
        {deleting ? "جاري الحذف..." : "حذف"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
