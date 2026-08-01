"use client"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import type { ChildVaccinationRecord } from "@/types/database"

export default function VerifyList({
  records,
  userId,
}: {
  records: ChildVaccinationRecord[]
  userId: string
}) {
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const router = useRouter()
  const supabase = createClient()

  async function handleVerify(id: string) {
    setVerifyingId(id)
    setError("")

    const { error: verifyError } = await supabase
      .from('child_vaccination_records')
      .update({
        is_verified: true,
        verified_by: userId,
        verified_at: new Date().toISOString(),
      } as never)
      .eq('id', id)

    if (verifyError) {
      setError(verifyError.message)
    } else {
      router.refresh()
    }

    setVerifyingId(null)
  }

  return (
    <div className="overflow-x-auto">
      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded mb-4">{error}</div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-right">
            <th className="py-2 px-3">اسم الطفل</th>
            <th className="py-2 px-3">اسم الأب</th>
            <th className="py-2 px-3">تاريخ التطعيم</th>
            <th className="py-2 px-3">تاريخ الميلاد</th>
            <th className="py-2 px-3"></th>
          </tr>
        </thead>
        <tbody>
          {records.map((child) => (
            <tr key={child.id} className="border-b hover:bg-gray-50">
              <td className="py-2 px-3 font-medium">{child.child_full_name}</td>
              <td className="py-2 px-3">{child.father_first_name} {child.father_grandfather_name}</td>
              <td className="py-2 px-3">{child.vaccination_date}</td>
              <td className="py-2 px-3">{child.birth_date}</td>
              <td className="py-2 px-3">
                <div className="flex gap-2">
                  <Link href={`/hospital-verifier/${child.id}/edit`}
                    className="btn-soft px-3 py-1">
                    تعديل
                  </Link>
                  <button
                    onClick={() => handleVerify(child.id)}
                    disabled={verifyingId === child.id}
                    className="btn btn-success px-3 py-1"
                  >
                    {verifyingId === child.id ? "جاري التوثيق..." : "توثيق"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
