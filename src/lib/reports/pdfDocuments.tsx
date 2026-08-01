"use client"

// مستندات PDF للتقارير — تُصيّر في المتصفح (Client-side) ثم تُنزَّل
// الصفحات بمقاس A4 (عرضي للجداول، طولي لسجل الطفل الفردي)
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from '@react-pdf/renderer'

// خط عربي يدعم التشكيل والاتصال (Amiri) — ملفاته من /public ليُحملها المتصفح وقت التصدير
Font.register({
  family: 'Amiri',
  fonts: [
    { src: '/fonts/amiri/Amiri_400Regular.ttf', fontWeight: 400 },
    { src: '/fonts/amiri/Amiri_700Bold.ttf', fontWeight: 700 },
  ],
})

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Amiri',
    direction: 'rtl',
    paddingHorizontal: 24,
    paddingVertical: 24,
    fontSize: 9,
  },
  header: { textAlign: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: 700 },
  subtitle: { fontSize: 10, marginTop: 4, color: '#333' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 4,
    paddingVertical: 8,
  },
  summaryItem: { textAlign: 'center' },
  summaryValue: { fontSize: 15, fontWeight: 700 },
  summaryLabel: { fontSize: 9, marginTop: 2 },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  headerRow: {
    backgroundColor: '#ececec',
    borderBottomWidth: 1,
    borderBottomColor: '#aaa',
  },
  th: {
    fontWeight: 700,
    fontSize: 8,
    paddingVertical: 5,
    paddingHorizontal: 3,
    textAlign: 'right',
  },
  td: {
    fontSize: 8,
    paddingVertical: 4,
    paddingHorizontal: 3,
    textAlign: 'right',
  },
  totalsRow: {
    flexDirection: 'row',
    fontWeight: 700,
    backgroundColor: '#ececec',
    borderBottomWidth: 1,
    borderBottomColor: '#aaa',
  },
  totalsLabel: { fontWeight: 700, fontSize: 8, padding: 4, textAlign: 'right' },
  totalsVal: { fontWeight: 700, fontSize: 8, padding: 4, textAlign: 'right' },
  // سجل الطفل الفردي (طولي)
  detailPage: {
    fontFamily: 'Amiri',
    direction: 'rtl',
    paddingHorizontal: 40,
    paddingVertical: 32,
    fontSize: 11,
  },
  detailTitle: { fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 4 },
  detailSubtitle: { fontSize: 10, textAlign: 'center', color: '#444', marginBottom: 18 },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    backgroundColor: '#ececec',
    padding: 6,
    marginBottom: 6,
    textAlign: 'right',
  },
  fieldRow: { flexDirection: 'row', marginBottom: 4, textAlign: 'right' },
  fieldLabel: { width: 160, fontWeight: 700 },
  fieldValue: { flex: 1 },
})

// تنزيل عنصر مستند PDF كملف في المتصفح
export async function downloadPdf(
  element: React.ReactElement<React.ComponentProps<typeof Document>>,
  filename: string
) {
  const blob = await pdf(element).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface PdfColumn<T> {
  header: string
  flex: number
  render: (row: T) => string
}

function PdfTable<T>({ columns, rows }: { columns: PdfColumn<T>[]; rows: T[] }) {
  return (
    <View>
      <View style={[styles.tableRow, styles.headerRow]} fixed>
        {columns.map((c) => (
          <Text key={c.header} style={[styles.th, { flex: c.flex }]}>
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={styles.tableRow} wrap={false}>
          {columns.map((c) => (
            <Text key={c.header} style={[styles.td, { flex: c.flex }]}>
              {c.render(row)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

// ============================================================
// تقرير سجلات الأطفال (جدول شامل) — A4 عرضي
// ============================================================
export interface ChildReportRow {
  hospital_name?: string
  child_full_name: string
  birth_date: string
  child_gender: string
  child_nationality: string
  father_name: string
  father_national_id: string
  mother_name: string
  mother_national_id: string | null
  vaccination_date: string
  vaccinator_name: string
  batch_number: string
  batch_delivery_date: string
}

interface ChildrenReportPdfProps {
  rows: ChildReportRow[]
  isMinistry: boolean
  dateRange: string
  hospitalName: string
  total: number
  male: number
  female: number
}

export function ChildrenReportPdf({ rows, isMinistry, dateRange, hospitalName, total, male, female }: ChildrenReportPdfProps) {
  const columns: PdfColumn<ChildReportRow>[] = []
  if (isMinistry) columns.push({ header: 'المستشفى', flex: 1.6, render: (r) => r.hospital_name || '-' })
  columns.push(
    { header: 'اسم الطفل', flex: 1.4, render: (r) => r.child_full_name },
    { header: 'تاريخ الميلاد', flex: 1, render: (r) => r.birth_date },
    { header: 'اسم الأب', flex: 1.4, render: (r) => r.father_name },
    { header: 'رقم الأب القومي', flex: 1.4, render: (r) => r.father_national_id },
    { header: 'اسم الأم', flex: 1.4, render: (r) => r.mother_name },
    { header: 'رقم الأم القومي', flex: 1.4, render: (r) => r.mother_national_id || '-' },
    { header: 'تاريخ التطعيم', flex: 1, render: (r) => r.vaccination_date },
    { header: 'القائم بالتطعيم', flex: 1.3, render: (r) => r.vaccinator_name },
    { header: 'رقم التشغيلة', flex: 1.2, render: (r) => r.batch_number },
    { header: 'تاريخ الدفعة', flex: 1, render: (r) => r.batch_delivery_date || '-' }
  )

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>تقرير الأطفال المتطعّمين</Text>
          {dateRange && <Text style={styles.subtitle}>{dateRange}</Text>}
          <Text style={styles.subtitle}>المستشفى: {hospitalName}</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{total}</Text>
            <Text style={styles.summaryLabel}>الإجمالي</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{male}</Text>
            <Text style={styles.summaryLabel}>ذكور</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{female}</Text>
            <Text style={styles.summaryLabel}>إناث</Text>
          </View>
        </View>

        <PdfTable columns={columns} rows={rows} />
      </Page>
    </Document>
  )
}

// ============================================================
// سجل الطفل الفردي — A4 طولي
// ============================================================
export interface ChildDetailPdfProps {
  record: {
    child_full_name: string
    child_gender: string
    child_nationality: string
    birth_date: string
    father_first_name: string
    father_grandfather_name: string
    father_national_id: string
    father_passport_number?: string | null
    mother_first_name: string
    mother_grandfather_name: string
    mother_national_id: string | null
    mother_passport_number?: string | null
    vaccination_date: string
    vaccinator_name: string
    batch_number: string
    batch_delivery_date: string
    batch_expiry_date?: string
    is_verified?: boolean
    hospital_name?: string
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || '-'}</Text>
    </View>
  )
}

export function ChildDetailPdf({ record }: ChildDetailPdfProps) {
  const fatherName = `${record.father_first_name} ${record.father_grandfather_name}`.trim()
  const motherName = `${record.mother_first_name} ${record.mother_grandfather_name}`.trim()

  return (
    <Document>
      <Page size="A4" style={styles.detailPage}>
        <Text style={styles.detailTitle}>سجل تطعيم طفل</Text>
        <Text style={styles.detailSubtitle}>
          {record.hospital_name ? `المستشفى: ${record.hospital_name}` : ''}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>بيانات الطفل</Text>
          <DetailRow label="اسم الطفل" value={record.child_full_name} />
          <DetailRow label="النوع" value={record.child_gender === 'male' ? 'ذكر' : 'أنثى'} />
          <DetailRow label="تاريخ الميلاد" value={record.birth_date} />
          <DetailRow label="الجنسية" value={record.child_nationality} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>بيانات الأب</Text>
          <DetailRow label="اسم الأب الكامل" value={fatherName} />
          <DetailRow label="الرقم القومي" value={record.father_national_id} />
          <DetailRow label="رقم الجواز" value={record.father_passport_number ?? ''} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>بيانات الأم</Text>
          <DetailRow label="اسم الأم الكامل" value={motherName} />
          <DetailRow label="الرقم القومي" value={record.mother_national_id ?? ''} />
          <DetailRow label="رقم الجواز" value={record.mother_passport_number ?? ''} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>بيانات التطعيم</Text>
          <DetailRow label="تاريخ التطعيم" value={record.vaccination_date} />
          <DetailRow label="القائم بالتطعيم" value={record.vaccinator_name} />
          <DetailRow label="رقم التشغيلة" value={record.batch_number} />
          <DetailRow label="تاريخ دخول الدفعة" value={record.batch_delivery_date || '-'} />
          <DetailRow label="تاريخ الصلاحية" value={record.batch_expiry_date ?? ''} />
          <DetailRow
            label="الحالة"
            value={record.is_verified ? 'موثّق' : 'غير موثّق'}
          />
        </View>
      </Page>
    </Document>
  )
}

// ============================================================
// تقرير حركة الطعوم — A4 عرضي
// ============================================================
export interface BatchMovementPdfRow {
  hospital_name?: string
  batch_number: string
  delivery_date: string
  expiry_date: string
  received: number
  used: number
  remaining: number
}

interface BatchesReportPdfProps {
  rows: BatchMovementPdfRow[]
  totals: { received: number; used: number; remaining: number } | null
  isMinistry: boolean
  dateRange: string
  hospitalName: string
}

export function BatchesReportPdf({ rows, totals, isMinistry, dateRange, hospitalName }: BatchesReportPdfProps) {
  const columns: PdfColumn<BatchMovementPdfRow>[] = []
  if (isMinistry) columns.push({ header: 'المستشفى', flex: 1.6, render: (r) => r.hospital_name || '-' })
  columns.push(
    { header: 'رقم التشغيلة', flex: 1.4, render: (r) => r.batch_number },
    { header: 'تاريخ الدخول', flex: 1.2, render: (r) => r.delivery_date },
    { header: 'تاريخ الصلاحية', flex: 1.2, render: (r) => r.expiry_date },
    { header: 'الوارد', flex: 1, render: (r) => String(r.received) },
    { header: 'المستخدم', flex: 1, render: (r) => String(r.used) },
    { header: 'المتبقي', flex: 1, render: (r) => String(r.remaining) }
  )

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>تقرير حركة الطعوم</Text>
          {dateRange && <Text style={styles.subtitle}>{dateRange}</Text>}
          <Text style={styles.subtitle}>المستشفى: {hospitalName}</Text>
        </View>

        <PdfTable columns={columns} rows={rows} />

        {totals && (
          <View style={styles.totalsRow}>
            <Text style={[styles.totalsLabel, { flex: isMinistry ? 5.4 : 3.8 }]}>الإجمالي</Text>
            <Text style={[styles.totalsVal, { flex: 1 }]}>{totals.received}</Text>
            <Text style={[styles.totalsVal, { flex: 1 }]}>{totals.used}</Text>
            <Text style={[styles.totalsVal, { flex: 1 }]}>{totals.remaining}</Text>
          </View>
        )}
      </Page>
    </Document>
  )
}
