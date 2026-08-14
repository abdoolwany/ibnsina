// دوال تُستدعى فقط من مكوّنات "use client" — لا تستورد next/headers.

// ضمانة التسليم قبل الحذف الفردي: تُدرج آخر حالة السجل في الأرشيف إن كان
// مؤهلًا (مؤرشف مسبقًا أو أقدم من حد الأقدمية). إن فشلت تُرجع خطأً
// فيُلغي المتصل الحذف (لا يُحذف سجل بلا نسخة محدثة).
export async function protectRecordBeforeDelete(id: string): Promise<{ error?: string }> {
  const res = await fetch('/api/system/archive/protect-record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) {
    const j = await res.json().catch(() => null)
    return { error: j?.error ?? 'فشلت حماية الأرشيف قبل الحذف' }
  }
  return {}
}
