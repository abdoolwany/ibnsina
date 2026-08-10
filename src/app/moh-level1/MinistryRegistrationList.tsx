"use client"

import { useState } from "react"
import Link from "next/link"
import type { ChildVaccinationRecord } from "@/types/database"

type VerifiedChild = ChildVaccinationRecord & { hospitals: { name: string } | null }

interface Props {
  records: VerifiedChild[]
  hospitals: Array<{ id: string; name: string }>
}

// قائمة السجلات الموثّقة في مستشفيات moh_level1 المرتبطة لعرض حالة "تسجيل الميكنة"
// والانتقال للسجل الفردي لتنفيذ التسجيل/التراجع. الفلترة هنا حسب المستشفى فقط
// (البيانات تُجلب من الخادم محصورة بمستشفياته عبر RLS).
export default function MinistryRegistrationList({ records, hospitals }: Props) {
  const [hospitalFilter, setHospitalFilter] = useState("")

  const filtered = hospitalFilter
    ? records.filter(r => r.hospital_id === hospitalFilter)
    : records

  const pending = filtered.filter(r => !r.ministry_registered)
  const registered = filtered.filter(r => r.ministry_registered)

  return (
    <div className="card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">تسجيل الجرعات على ميكنة التطعيمات</h3>
          <p className="text-sm text-gray-500">
            السجلات الموثّقة فقط — سجّل الجرعة بعد ضخّها في الميكنة، ويمكنك التراجع عند الخطأ
          </p>
        </div>
        <select value={hospitalFilter} onChange={e => setHospitalFilter(e.target.value)}
          className="input-field w-auto">
          <option value="">كل المستشفيات ({filtered.length})</option>
          {hospitals.map(h => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">{pending.length}</div>
          <div className="text-sm text-gray-600">بانتظار تسجيل الميكنة</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{registered.length}</div>
          <div className="text-sm text-gray-600">مسجّل على الميكنة</div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-6">لا توجد سجلات موثّقة بعد</p>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr className="text-right">
                <th>المستشفى</th>
                <th>اسم الطفل</th>
                <th>تاريخ التطعيم</th>
                <th>تاريخ التوثيق</th>
                <th>حالة الميكنة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td>{r.hospitals?.name ?? '-'}</td>
                  <td className="font-medium">{r.child_full_name}</td>
                  <td>{r.vaccination_date}</td>
                  <td>{r.verified_at ? new Date(r.verified_at).toLocaleDateString('ar-EG') : '-'}</td>
                  <td>
                    <span className={r.ministry_registered ? 'status-verified' : 'status-unverified'}>
                      {r.ministry_registered ? 'مسجّل' : 'غير مسجّل'}
                    </span>
                  </td>
                  <td>
                    <Link href={`/reports/child/${r.id}`} className="btn-soft px-3 py-1">
                      فتح السجل
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
