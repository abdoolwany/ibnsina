import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { startArchiveReview, getOpenArchiveReviewSession } from '@/lib/db/archiveReview'

// GET  /api/archive/review — جلسة المراجعة المفتوحة حاليًا (لاستئناف العرض)
// POST /api/archive/review — بدء جلسة مراجعة لشهر معين body: { year, month }
// الصلاحية: moh_admin + system_operator فقط

async function assertRole(): Promise<{ userId: string } | NextResponse> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'moh_admin' && user.role !== 'system_operator')) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }
  return { userId: user.id }
}

export async function GET() {
  const guard = await assertRole()
  if (guard instanceof NextResponse) return guard

  try {
    const session = await getOpenArchiveReviewSession()
    return NextResponse.json({ session })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'خطأ غير متوقع' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const guard = await assertRole()
  if (guard instanceof NextResponse) return guard

  const { year, month } = await request.json()
  const y = Number(year)
  const m = Number(month)
  if (!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12) {
    return NextResponse.json({ error: 'سنة أو شهر غير صالحين' }, { status: 400 })
  }

  try {
    const result = await startArchiveReview(guard.userId, y, m)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
