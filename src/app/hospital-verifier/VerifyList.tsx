"use client"

import type { ChildVaccinationRecord } from "@/types/database"

// قائمة سجلات بانتظار التوثيق — الصف كامل قابل للنقر لفتح سجل الطفل
// في تبويب جديد (تبقى القائمة كما هي) حيث توجد أزرار التوثيق والتعديل والحذف (بند 5).
export default function VerifyList({
  records,
}: {
  records: ChildVaccinationRecord[]
}) {
  return (
    <div className="overflow-x-auto">
      <p className="text-xs text-gray-500 mb-3">اضغط على أي صف لفتح السجل كاملًا في تبويب جديد وتنفيذ التوثيق من داخله</p>
      <table>
        <thead>
          <tr className="text-right">
            <th>اسم الطفل</th>
            <th>اسم الأب</th>
            <th>تاريخ التطعيم</th>
            <th>تاريخ الميلاد</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          {records.map((child) => (
            <tr
              key={child.id}
              className="row-clickable"
              onClick={() => window.open(`/reports/child/${child.id}`, '_blank', 'noopener,noreferrer')}
            >
              <td className="font-medium">{child.child_full_name}</td>
              <td>{child.father_first_name} {child.father_grandfather_name}</td>
              <td>{child.vaccination_date}</td>
              <td>{child.birth_date}</td>
              <td><span className="status-unverified">بانتظار التوثيق</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
