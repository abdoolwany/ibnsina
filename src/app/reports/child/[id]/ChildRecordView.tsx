"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Pencil, Trash2, CheckCircle2, LockOpen } from "lucide-react"
import { ChildDetailPdf, downloadPdf } from "@/lib/reports/pdfDocuments"
import { formatCairoDateTime, cairoToday } from "@/lib/time"
import { createClient } from "@/lib/supabase/client"

// بيانات السجل مع الروابط الداخلية القادمة من الخادم
interface ChildRecordViewData {
  id: string
  child_full_name: string
  child_gender: string
  child_nationality: string
  birth_date: string
  father_first_name: string
  father_grandfather_name: string
  father_national_id: string
  father_passport_number: string | null
  father_phone_number: string | null
  mother_first_name: string
  mother_grandfather_name: string
  mother_national_id: string | null
  mother_passport_number: string | null
  mother_phone_number: string | null
  vaccination_date: string
  is_verified: boolean
  created_at: string
  verified_at: string | null
  vaccinators: { full_name: string } | null
  vaccine_batches: { delivery_date: string; batch_number: string; expiry_date: string } | null
  hospitals: { name: string } | null
}

interface Props {
  record: ChildRecordViewData
  userRole: string | null
  userId: string
  hospitalIds: string[]
  canManage: boolean
  canVerify: boolean
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-2 border-b border-gray-100 last:border-0">
      <span className="text-gray-600 text-sm font-medium">{label}</span>
      <span className="text-sm font-semibold">{value || '-'}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-base font-semibold mb-3 border-b border-gray-200 pb-2">{title}</h3>
      {children}
    </div>
  )
}

export default function ChildRecordView({ record, userRole, userId, hospitalIds, canManage, canVerify }: Props) {
  const [exporting, setExporting] = useState(false)
  const [action, setAction] = useState<'' | 'delete' | 'verify' | 'unverify'>('')
  const [error, setError] = useState("")
  const [requestStatus, setRequestStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const fatherName = `${record.father_first_name} ${record.father_grandfather_name}`.trim()
  const motherName = `${record.mother_first_name} ${record.mother_grandfather_name}`.trim()

  // حالة طلب إعادة فتح التوثيق إن وُجد (للموثّق)
  useEffect(() => {
    if (!canVerify || !record.is_verified) return
    let cancelled = false
    supabase
      .from('unverify_requests')
      .select('status')
      .eq('record_id', record.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const st = (data as { status: string } | null)?.status
        if (!cancelled && st) setRequestStatus(st as typeof requestStatus)
      })
    return () => { cancelled = true }
  }, [record.id, record.is_verified, canVerify, supabase])

  async function handleDownload() {
    setExporting(true)
    try {
      await downloadPdf(
        <ChildDetailPdf
          record={{
            child_full_name: record.child_full_name,
            child_gender: record.child_gender,
            child_nationality: record.child_nationality,
            birth_date: record.birth_date,
            father_first_name: record.father_first_name,
            father_grandfather_name: record.father_grandfather_name,
            father_national_id: record.father_national_id,
            father_passport_number: record.father_passport_number,
            father_phone_number: record.father_phone_number,
            mother_first_name: record.mother_first_name,
            mother_grandfather_name: record.mother_grandfather_name,
            mother_national_id: record.mother_national_id,
            mother_passport_number: record.mother_passport_number,
            mother_phone_number: record.mother_phone_number,
            vaccination_date: record.vaccination_date,
            vaccinator_name: record.vaccinators?.full_name ?? '',
            batch_number: record.vaccine_batches?.batch_number ?? '',
            batch_delivery_date: record.vaccine_batches?.delivery_date ?? '',
            batch_expiry_date: record.vaccine_batches?.expiry_date ?? '',
            is_verified: record.is_verified,
            hospital_name: record.hospitals?.name,
            created_at: record.created_at,
            verified_at: record.verified_at,
          }}
        />,
        `سجل-${record.child_full_name}-${cairoToday()}.pdf`
      )
    } finally {
      setExporting(false)
    }
  }

  async function handleVerify() {
    if (!window.confirm(`توثيق سجل الطفل «${record.child_full_name}»؟ بعد التوثيق يُقفل السجل نهائيًا من التعديل.`)) return
    setAction('verify')
    setError("")
    const { error: verifyError } = await supabase
      .from('child_vaccination_records')
      .update({ is_verified: true, verified_by: userId, verified_at: new Date().toISOString() } as never)
      .eq('id', record.id)
    if (verifyError) {
      setError(verifyError.message)
    } else {
      router.refresh()
    }
    setAction('')
  }

  async function handleDelete() {
    if (!window.confirm(`تحذير: سيتم حذف سجل الطفل «${record.child_full_name}» نهائيًا وستُرجَع جرعته إلى رصيد الدفعة. هل أنت متأكد؟`)) return
    setAction('delete')
    setError("")
    const { error: delError } = await supabase.from('child_vaccination_records').delete().eq('id', record.id)
    if (delError) {
      setError(delError.message)
      setAction('')
    } else {
      router.push('/reports')
      router.refresh()
    }
  }

  async function handleRequestUnverify() {
    if (!window.confirm(`إرسال طلب إعادة فتح توثيق «${record.child_full_name}» إلى الوزارة؟`)) return
    setAction('unverify')
    setError("")
    const { error } = await supabase.from('unverify_requests').insert({
      record_id: record.id,
      hospital_id: hospitalIds[0],
      requested_by: userId,
      reason: null,
    } as never)
    if (error) {
      setError(error.message)
    } else {
      setRequestStatus('pending')
    }
    setAction('')
  }

  const editPath = userRole === 'hospital_verifier'
    ? `/hospital-verifier/${record.id}/edit`
    : `/hospital-entry/${record.id}/edit`

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 p-3 text-sm text-red-700 rounded-lg">{error}</div>
      )}

      {/* شريط الإجراءات — تظهر الأزرار حسب صلاحية ومستوى المستخدم (بند 5) */}
      {(canManage || canVerify || exporting) && (
        <div className="card p-4 flex flex-wrap items-center gap-2">
          <div className="ml-auto flex flex-wrap gap-2">
            {canManage && (
              <>
                <Link href={editPath} className="btn btn-secondary">
                  <Pencil size={16} /> تعديل
                </Link>
                <button onClick={handleDelete} disabled={action === 'delete'}
                  className="btn btn-danger">
                  <Trash2 size={16} /> {action === 'delete' ? 'جاري الحذف...' : 'حذف'}
                </button>
              </>
            )}
            {canVerify && !record.is_verified && (
              <button onClick={handleVerify} disabled={action === 'verify'}
                className="btn btn-success">
                <CheckCircle2 size={16} /> {action === 'verify' ? 'جاري التوثيق...' : 'توثيق'}
              </button>
            )}
            {canVerify && record.is_verified && requestStatus === 'pending' && (
              <span className="badge badge-warning">بانتظار رد الوزارة على إعادة الفتح</span>
            )}
            {canVerify && record.is_verified && requestStatus !== 'pending' && (
              <button onClick={handleRequestUnverify} disabled={action === 'unverify'}
                className="btn btn-warning">
                <LockOpen size={16} /> {action === 'unverify' ? 'جاري الإرسال...' : 'طلب إعادة فتح التوثيق'}
              </button>
            )}
            <button onClick={handleDownload} disabled={exporting} className="btn btn-danger">
              {exporting ? 'جاري التنزيل...' : 'تنزيل PDF'}
            </button>
          </div>
        </div>
      )}

      <div className="card p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <Section title="بيانات الطفل">
            <Row label="اسم الطفل" value={record.child_full_name} />
            <Row label="النوع" value={record.child_gender === 'male' ? 'ذكر' : 'أنثى'} />
            <Row label="تاريخ الميلاد" value={record.birth_date} />
            <Row label="الجنسية" value={record.child_nationality} />
          </Section>
          <Section title="بيانات التطعيم">
            <Row label="تاريخ التطعيم" value={record.vaccination_date} />
            <Row label="القائم بالتطعيم" value={record.vaccinators?.full_name ?? ''} />
            <Row label="رقم التشغيلة" value={record.vaccine_batches?.batch_number ?? ''} />
            <Row label="تاريخ دخول الطلبية" value={record.vaccine_batches?.delivery_date ?? ''} />
            <Row label="تاريخ الصلاحية" value={record.vaccine_batches?.expiry_date ?? ''} />
          </Section>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="بيانات الأب">
          <Row label="اسم الأب الكامل" value={fatherName} />
          <Row label="الرقم القومي" value={record.father_national_id} />
          <Row label="رقم الجواز" value={record.father_passport_number ?? ''} />
          <Row label="رقم التليفون" value={record.father_phone_number ?? ''} />
        </Section>
        <Section title="بيانات الأم">
          <Row label="اسم الأم الكاملة" value={motherName} />
          <Row label="الرقم القومي" value={record.mother_national_id ?? ''} />
          <Row label="رقم الجواز" value={record.mother_passport_number ?? ''} />
          <Row label="رقم التليفون" value={record.mother_phone_number ?? ''} />
        </Section>
      </div>

      <div className="card p-5">
        <h3 className="text-base font-semibold mb-3 border-b border-gray-200 pb-2">تتبّع</h3>
        <Row label="المستشفى" value={record.hospitals?.name ?? ''} />
        <Row label="تاريخ الإدخال" value={formatCairoDateTime(record.created_at)} />
        <Row label="تاريخ التوثيق" value={record.verified_at ? formatCairoDateTime(record.verified_at) : '-'} />
      </div>
    </div>
  )
}
