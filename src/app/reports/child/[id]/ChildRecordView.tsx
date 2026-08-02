"use client"

import { useState } from "react"
import { ChildDetailPdf, downloadPdf } from "@/lib/reports/pdfDocuments"
import { formatCairoDateTime, cairoToday } from "@/lib/time"

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

export default function ChildRecordView({ record }: { record: ChildRecordViewData }) {
  const [exporting, setExporting] = useState(false)
  const fatherName = `${record.father_first_name} ${record.father_grandfather_name}`.trim()
  const motherName = `${record.mother_first_name} ${record.mother_grandfather_name}`.trim()

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`badge ${record.is_verified ? 'badge-success' : 'badge-warning'}`}>
          {record.is_verified ? 'موثّق' : 'غير موثّق'}
        </span>
        <button onClick={handleDownload} disabled={exporting} className="btn btn-danger">
          {exporting ? 'جاري التنزيل...' : 'تنزيل PDF'}
        </button>
      </div>

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
