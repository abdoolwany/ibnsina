"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { validateEgyptianNationalId, checkGenderConsistency } from "@/lib/validation/national-id"
import type { BatchBalanceView, Vaccinator, ChildVaccinationRecord } from "@/types/database"

interface Props {
  hospitalId: string
  batches: BatchBalanceView[]
  vaccinators: Vaccinator[]
  record?: ChildVaccinationRecord | null
  backPath?: string
}

export default function ChildRegistrationForm({ hospitalId, batches, vaccinators, record, backPath = "/hospital-entry" }: Props) {
  const isEditing = !!record
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [warnings, setWarnings] = useState<string[]>([])

  // بيانات الطفل
  const [childName, setChildName] = useState(record?.child_full_name ?? "")
  const [childGender, setChildGender] = useState<"male" | "female">(record?.child_gender ?? "male")
  const [birthDate, setBirthDate] = useState(record?.birth_date ?? "")
  const [nationality, setNationality] = useState(record?.child_nationality ?? "مصري")

  // بيانات الأب
  const [fatherFirstName, setFatherFirstName] = useState(record?.father_first_name ?? "")
  const [fatherGrandfather, setFatherGrandfather] = useState(record?.father_grandfather_name ?? "")
  const [fatherNationalId, setFatherNationalId] = useState(record?.father_national_id ?? "")
  const [fatherPassport, setFatherPassport] = useState(record?.father_passport_number ?? "")

  // بيانات الأم
  const [motherFirstName, setMotherFirstName] = useState(record?.mother_first_name ?? "")
  const [motherGrandfather, setMotherGrandfather] = useState(record?.mother_grandfather_name ?? "")
  const [motherNationalId, setMotherNationalId] = useState(record?.mother_national_id ?? "")
  const [motherPassport, setMotherPassport] = useState(record?.mother_passport_number ?? "")

  // بيانات التطعيم
  const [batchId, setBatchId] = useState(record?.batch_id ?? "")
  const [vaccinatorId, setVaccinatorId] = useState(record?.vaccinator_id ?? "")
  const [vaccinationDate, setVaccinationDate] = useState(record?.vaccination_date ?? "")

  // التحقق من الرقم القومي (client-side)
  const validateNationalIdField = useCallback((id: string, field: "father" | "mother"): string | null => {
    if (!id) return null
    const result = validateEgyptianNationalId(id)
    if (!result.isValid) return result.errors[0]
    return null
  }, [])

  function checkFatherNationalId() {
    const w = checkGenderConsistency(fatherNationalId, "male", "الأب")
    setWarnings(prev => {
      const filtered = prev.filter(p => !p.includes("الأب"))
      return [...filtered, ...w]
    })
  }

  function checkMotherNationalId() {
    const w = checkGenderConsistency(motherNationalId, "female", "الأم")
    setWarnings(prev => {
      const filtered = prev.filter(p => !p.includes("الأم"))
      return [...filtered, ...w]
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setWarnings([])
    setLoading(true)

    // عند التعديل: نفس الدفعة لا تستهلك جرعة جديدة، لذا لا نمنع إعادة الحفظ
    const isSameBatch = record != null && record.batch_id === batchId
    const selectedBatch = batches.find(b => b.batch_id === batchId)

    if (selectedBatch && selectedBatch.remaining_balance <= 0 && !isSameBatch) {
      setError(`الرصيد المتبقي لهذه الدفعة هو ${selectedBatch.remaining_balance}. لا يمكن التسجيل.`)
      setLoading(false)
      return
    }

    // تحقق من تاريخ الصلاحية
    if (selectedBatch && vaccinationDate > selectedBatch.expiry_date && !isSameBatch) {
      if (!confirm(`تحذير: تاريخ الصلاحية للدفعة هو ${selectedBatch.expiry_date}، وتاريخ التطعيم ${vaccinationDate} بعده. هل أنت متأكد من المتابعة؟`)) {
        setLoading(false)
        return
      }
    }

    // تحقق من الرصيد المنخفض
    if (selectedBatch && selectedBatch.remaining_balance <= 5 && !isSameBatch) {
      if (!confirm(`الرصيد المتبقي للدفعة هو ${selectedBatch.remaining_balance} فقط. هل أنت متأكد من المتابعة؟`)) {
        setLoading(false)
        return
      }
    }

    // تحقق من الرقم القومي على الخادم (server-side validation)
    const fatherNationVal = validateEgyptianNationalId(fatherNationalId)
    if (!fatherNationVal.isValid) {
      setError(`الرقم القومي للأب غير صحيح: ${fatherNationVal.errors[0]}`)
      setLoading(false)
      return
    }

    const motherNationVal = validateEgyptianNationalId(motherNationalId)
    if (!motherNationVal.isValid) {
      setError(`الرقم القومي للأم غير صحيح: ${motherNationVal.errors[0]}`)
      setLoading(false)
      return
    }

    const payload = {
      child_full_name: childName,
      child_gender: childGender,
      birth_date: birthDate,
      child_nationality: nationality,
      father_first_name: fatherFirstName,
      father_grandfather_name: fatherGrandfather,
      father_national_id: fatherNationalId,
      father_passport_number: fatherPassport || null,
      mother_first_name: motherFirstName,
      mother_grandfather_name: motherGrandfather,
      mother_national_id: motherNationalId,
      mother_passport_number: motherPassport || null,
      vaccination_date: vaccinationDate,
      batch_id: batchId,
      vaccinator_id: vaccinatorId,
    }

    const query = isEditing
      ? supabase.from('child_vaccination_records').update(payload as never).eq('id', record!.id)
      : supabase.from('child_vaccination_records').insert({ hospital_id: hospitalId, ...payload } as never)

    const { error: submitError } = await query

    if (submitError) {
      setError(submitError.message)
      setLoading(false)
      return
    }

    router.push(backPath)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* قسم بيانات الطفل */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 border-b pb-2">بيانات الطفل</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">اسم الطفل</label>
            <input type="text" required value={childName} onChange={e => setChildName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">النوع</label>
            <select value={childGender} onChange={e => setChildGender(e.target.value as "male" | "female")}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">تاريخ الميلاد</label>
            <input type="date" required value={birthDate} onChange={e => setBirthDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">الجنسية</label>
            <input type="text" value={nationality} onChange={e => setNationality(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* قسم بيانات الأب */}
      <div className="bg-white rounded-lg shadow p-6 border-r-4 border-blue-400">
        <h3 className="text-lg font-semibold mb-4 border-b pb-2">بيانات الأب</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">اسم الأب</label>
            <input type="text" required value={fatherFirstName} onChange={e => setFatherFirstName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">اسم الجد</label>
            <input type="text" required value={fatherGrandfather} onChange={e => setFatherGrandfather(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">الرقم القومي
              {fatherNationalId.length === 14 && (
                <span className={`mr-2 text-xs ${validateEgyptianNationalId(fatherNationalId).isValid ? 'text-green-600' : 'text-red-600'}`}>
                  {validateEgyptianNationalId(fatherNationalId).isValid ? '✓' : '✗'}
                </span>
              )}
            </label>
            <input type="text" required maxLength={14} value={fatherNationalId}
              onChange={e => setFatherNationalId(e.target.value)}
              onBlur={checkFatherNationalId}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">رقم جواز السفر (اختياري)</label>
            <input type="text" value={fatherPassport} onChange={e => setFatherPassport(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* قسم بيانات الأم */}
      <div className="bg-white rounded-lg shadow p-6 border-r-4 border-pink-400">
        <h3 className="text-lg font-semibold mb-4 border-b pb-2">بيانات الأم</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">اسم الأم</label>
            <input type="text" required value={motherFirstName} onChange={e => setMotherFirstName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">اسم الجد</label>
            <input type="text" required value={motherGrandfather} onChange={e => setMotherGrandfather(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">الرقم القومي
              {motherNationalId.length === 14 && (
                <span className={`mr-2 text-xs ${validateEgyptianNationalId(motherNationalId).isValid ? 'text-green-600' : 'text-red-600'}`}>
                  {validateEgyptianNationalId(motherNationalId).isValid ? '✓' : '✗'}
                </span>
              )}
            </label>
            <input type="text" required maxLength={14} value={motherNationalId}
              onChange={e => setMotherNationalId(e.target.value)}
              onBlur={checkMotherNationalId}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">رقم جواز السفر (اختياري)</label>
            <input type="text" value={motherPassport} onChange={e => setMotherPassport(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* قسم التطعيم */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 border-b pb-2">بيانات التطعيم</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">تاريخ التطعيم</label>
            <input type="date" required value={vaccinationDate} onChange={e => setVaccinationDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">دفعة اللقاح</label>
            <select required value={batchId} onChange={e => setBatchId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">اختر الدفعة...</option>
              {batches.map(b => (
                <option key={b.batch_id} value={b.batch_id}>
                  {b.batch_number} (الرصيد: {b.remaining_balance}، الصلاحية: {b.expiry_date})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">القائم بالتطعيم</label>
            <select required value={vaccinatorId} onChange={e => setVaccinatorId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">اختر القائم بالتطعيم...</option>
              {vaccinators.map(v => (
                <option key={v.id} value={v.id}>{v.full_name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* التحذيرات والأخطاء */}
      {warnings.length > 0 && warnings.map((w, i) => (
        <div key={i} className="bg-yellow-50 p-3 text-sm text-yellow-800 rounded-lg">{w}</div>
      ))}

      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded-lg">{error}</div>
      )}

      <div className="flex gap-4">
        <button type="submit" disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "جاري الحفظ..." : isEditing ? "حفظ التعديلات" : "حفظ التسجيل"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-300">
          إلغاء
        </button>
      </div>
    </form>
  )
}
