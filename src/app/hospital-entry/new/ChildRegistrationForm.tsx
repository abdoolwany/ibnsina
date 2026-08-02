"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { validateEgyptianNationalId, checkGenderConsistency } from "@/lib/validation/national-id"
import { cairoToday } from "@/lib/time"
import type { BatchBalanceView, Vaccinator, ChildVaccinationRecord, Gender } from "@/types/database"

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

  // بيانات الطفل
  const [childName, setChildName] = useState(record?.child_full_name ?? "")
  const [childGender, setChildGender] = useState<Gender | "">(record?.child_gender ?? "")
  const [birthDate, setBirthDate] = useState(record?.birth_date ?? "")
  const [nationality, setNationality] = useState(record?.child_nationality ?? "مصري")

  // بيانات الأب
  const [fatherFirstName, setFatherFirstName] = useState(record?.father_first_name ?? "")
  const [fatherGrandfather, setFatherGrandfather] = useState(record?.father_grandfather_name ?? "")
  const [fatherGreatGrandfather, setFatherGreatGrandfather] = useState(record?.father_great_grandfather_name ?? "")
  const [fatherNationalId, setFatherNationalId] = useState(record?.father_national_id ?? "")
  const [fatherPassport, setFatherPassport] = useState(record?.father_passport_number ?? "")
  const [fatherPhone, setFatherPhone] = useState(record?.father_phone_number ?? "")

  // بيانات الأم
  const [motherFirstName, setMotherFirstName] = useState(record?.mother_first_name ?? "")
  const [motherGrandfather, setMotherGrandfather] = useState(record?.mother_grandfather_name ?? "")
  const [motherGreatGrandfather, setMotherGreatGrandfather] = useState(record?.mother_great_grandfather_name ?? "")
  const [motherNationalId, setMotherNationalId] = useState(record?.mother_national_id ?? "")
  const [motherPassport, setMotherPassport] = useState(record?.mother_passport_number ?? "")
  const [motherPhone, setMotherPhone] = useState(record?.mother_phone_number ?? "")

  // بيانات التطعيم
  const [batchId, setBatchId] = useState(record?.batch_id ?? "")
  const [vaccinatorId, setVaccinatorId] = useState(record?.vaccinator_id ?? "")
  const [vaccinationDate, setVaccinationDate] = useState(record?.vaccination_date ?? "")

  // التحقق الفوري من الرقم القومي (client-side)
  const fatherIdResult = fatherNationalId ? validateEgyptianNationalId(fatherNationalId) : null
  const motherIdResult = motherNationalId ? validateEgyptianNationalId(motherNationalId) : null
  const fatherIdError = fatherIdResult && !fatherIdResult.isValid ? fatherIdResult.errors[0] : null
  const motherIdError = motherIdResult && !motherIdResult.isValid ? motherIdResult.errors[0] : null
  const fatherGenderWarning = fatherNationalId.length === 14 ? checkGenderConsistency(fatherNationalId, "male", "الأب")[0] ?? null : null
  const motherGenderWarning = motherNationalId.length === 14 ? checkGenderConsistency(motherNationalId, "female", "الأم")[0] ?? null : null
  const motherIdOrPassportError = !motherNationalId.trim() && !motherPassport.trim()
    ? "يجب إدخال الرقم القومي للأم أو رقم جواز السفر (أحدهما على الأقل)"
    : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    if (!childGender) {
      setError("يجب اختيار نوع الطفل (ذكر/أنثى).")
      setLoading(false)
      return
    }

    // عند التعديل: نفس الدفعة لا تستهلك جرعة جديدة، لذا لا نمنع إعادة الحفظ
    const isSameBatch = record != null && record.batch_id === batchId
    const selectedBatch = batches.find(b => b.batch_id === batchId)

    // منع التواريخ غير المنطقية (تاريخ اليوم بتوقيت القاهرة)
    const today = cairoToday()
    if (birthDate > today) {
      setError(`تاريخ ميلاد الطفل (${birthDate}) لا يمكن أن يكون بعد اليوم (${today}).`)
      setLoading(false)
      return
    }
    if (vaccinationDate > today) {
      setError(`تاريخ التطعيم (${vaccinationDate}) لا يمكن أن يكون بعد اليوم (${today}).`)
      setLoading(false)
      return
    }
    if (vaccinationDate < birthDate) {
      setError(`تاريخ التطعيم (${vaccinationDate}) لا يمكن أن يسبق تاريخ ميلاد الطفل (${birthDate}).`)
      setLoading(false)
      return
    }
    if (selectedBatch && vaccinationDate < selectedBatch.delivery_date) {
      setError(`تاريخ التطعيم (${vaccinationDate}) لا يمكن أن يسبق تاريخ دخول الدفعة (${selectedBatch.delivery_date}).`)
      setLoading(false)
      return
    }

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

    if (!motherNationalId.trim() && !motherPassport.trim()) {
      setError("يجب إدخال الرقم القومي للأم أو رقم جواز السفر (أحدهما على الأقل).")
      setLoading(false)
      return
    }

    if (motherNationalId) {
      const motherNationVal = validateEgyptianNationalId(motherNationalId)
      if (!motherNationVal.isValid) {
        setError(`الرقم القومي للأم غير صحيح: ${motherNationVal.errors[0]}`)
        setLoading(false)
        return
      }
    }

    const payload = {
      child_full_name: childName,
      child_gender: childGender,
      birth_date: birthDate,
      child_nationality: nationality,
      father_first_name: fatherFirstName,
      father_grandfather_name: fatherGrandfather,
      father_great_grandfather_name: fatherGreatGrandfather || null,
      father_national_id: fatherNationalId,
      father_passport_number: fatherPassport || null,
      father_phone_number: fatherPhone || null,
      mother_first_name: motherFirstName,
      mother_grandfather_name: motherGrandfather,
      mother_great_grandfather_name: motherGreatGrandfather || null,
      mother_national_id: motherNationalId || null,
      mother_passport_number: motherPassport || null,
      mother_phone_number: motherPhone || null,
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
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4 border-b pb-2">بيانات الطفل</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">اسم الطفل</label>
            <input type="text" required value={childName} onChange={e => setChildName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">النوع</label>
            <select required value={childGender} onChange={e => setChildGender(e.target.value as Gender | "")}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">اختر النوع...</option>
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
      <div className="card p-6 border-r-4 border-primary">
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
            <label className="block text-sm font-medium text-gray-700">جد الأب</label>
            <input type="text" value={fatherGreatGrandfather} onChange={e => setFatherGreatGrandfather(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">الرقم القومي</label>
            <input type="text" required maxLength={14} value={fatherNationalId}
              onChange={e => setFatherNationalId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            {fatherIdError && <p className="mt-1 text-xs text-red-600">{fatherIdError}</p>}
            {fatherGenderWarning && <p className="mt-1 text-xs text-yellow-700">{fatherGenderWarning}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">رقم جواز السفر (اختياري)</label>
            <input type="text" value={fatherPassport} onChange={e => setFatherPassport(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">رقم التليفون (اختياري)</label>
            <input type="tel" dir="ltr" value={fatherPhone} onChange={e => setFatherPhone(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left" />
          </div>
        </div>
      </div>

      {/* قسم بيانات الأم */}
      <div className="card p-6 border-r-4 border-pink-400">
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
            <label className="block text-sm font-medium text-gray-700">جد الأم</label>
            <input type="text" value={motherGreatGrandfather} onChange={e => setMotherGreatGrandfather(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">الرقم القومي</label>
            <input type="text" maxLength={14} value={motherNationalId}
              onChange={e => setMotherNationalId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            {motherIdError && <p className="mt-1 text-xs text-red-600">{motherIdError}</p>}
            {motherGenderWarning && <p className="mt-1 text-xs text-yellow-700">{motherGenderWarning}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">رقم جواز السفر</label>
            <input type="text" value={motherPassport} onChange={e => setMotherPassport(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            {motherIdOrPassportError && <p className="mt-1 text-xs text-red-600">{motherIdOrPassportError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">رقم التليفون (اختياري)</label>
            <input type="tel" dir="ltr" value={motherPhone} onChange={e => setMotherPhone(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left" />
          </div>
        </div>
      </div>

      {/* قسم التطعيم */}
      <div className="card p-6">
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

      {/* الأخطاء */}
      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded-lg">{error}</div>
      )}

      <div className="flex gap-4">
        <button type="submit" disabled={loading}
          className="btn btn-primary">
          {loading ? "جاري الحفظ..." : isEditing ? "حفظ التعديلات" : "حفظ التسجيل"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="btn btn-secondary">
          إلغاء
        </button>
      </div>
    </form>
  )
}
