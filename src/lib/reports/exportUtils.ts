import * as XLSX from 'xlsx'

// أدوات تصدير التقارير — تُستخدم من مكونات الواجهة فقط (Client-side)
// تصدّر البيانات المعروضة حاليًا بنفس الفلاتر المطبّقة على الجدول

export interface ExportColumn {
  header: string
  key: string
  width?: number
}

/**
 * تنزيل البيانات كملف Excel (.xlsx) مع اتجاه RTL للورقة
 * البيانات تمر كما هي — العزل بين المستشفيات محسوم في مصدر البيانات نفسه
 */
export function downloadExcel<T extends object>(
  filename: string,
  sheetName: string,
  columns: ExportColumn[],
  rows: T[]
) {
  const data = rows.map((r) => {
    const row = r as Record<string, unknown>
    const o: Record<string, unknown> = {}
    for (const c of columns) o[c.header] = row[c.key] ?? ''
    return o
  })

  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = columns.map((c) => ({ wch: c.width ?? 20 }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  // عرض الورقة بالاتجاه العربي RTL في Excel
  ;(wb as unknown as Record<string, unknown>).Workbook = { Views: [{ RTL: true }] }
  XLSX.writeFile(wb, filename)
}
