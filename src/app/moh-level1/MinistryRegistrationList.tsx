"use client"

import { useState } from "react"
import Link from "next/link"
import type { ChildVaccinationRecord } from "@/types/database"

type VerifiedChild = ChildVaccinationRecord & { hospitals: { name: string } | null }

interface Props {
  records: VerifiedChild[]
  hospitals: Array<{ id: string; name: string }>
}

// قائمة السجلات الموثّقة غير المسجّلة على الميكنة فقط، لتبسيط العرض على الصفحة الرئيسية.
// السجل الذي يُسجَّل على الميكنة يختفي من هنا، ولتغيير حالته تُبحث عنه من التقارير
// (البيانات تُجلب من الخادم محصورة بمستشفياته عبر RLS).
export default function MinistryRegistrationList({ records, hospitals }: Props) {
  const [hospitalFilter, setHospitalFilter] = useState("")

  const pending = records.filter(r => !r.ministry_registered)
  const filtered = hospitalFilter
    ? pending.filter(r => r.hospital_id === hospitalFilter)
    : pending

  return (
    <div className="card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">تسجيل الجرعات على ميكنة التطعيمات</h3>
          <p className="text-sm text-gray-500">
            السجلات الموثّقة غير المسجّلة فقط — سجّل الجرعة بعد ضخّها في الميكنة. المسجّل يُدار من البحث في التقارير
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

      <div className="card p-4 text-center max-w-xs">
        <div className="text-2xl font-bold text-amber-600">{filtered.length}</div>
        <div className="text-sm text-gray-600">بانتظار تسجيل الميكنة</div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-6">
          {records.length === 0 ? 'لا توجد سجلات موثّقة بانتظار التسجيل' : 'لا توجد سجلات في هذا المستشفى'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr className="text-right">
                <th>المستشفى</th>
                <th>اسم الطفل</th>
                <th>تاريخ التطعيم</th>
                <th>تاريخ التوثيق</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr
                  key={r.id}
                  className="row-clickable"
                  onClick={() => window.open(`/reports/child/${r.id}`, '_blank', 'noopener,noreferrer')}
                >
                  <td>{r.hospitals?.name ?? '-'}</td>
                  <td className="font-medium">{r.child_full_name}</td>
                  <td>{r.vaccination_date}</td>
                  <td>{r.verified_at ? new Date(r.verified_at).toLocaleDateString('ar-EG') : '-'}</td>
                  <td>
                    <Link
                      href={`/reports/child/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="btn-soft px-3 py-1"
                    >
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
