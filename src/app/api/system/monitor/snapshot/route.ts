import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { recordResourceSnapshot } from '@/lib/db/monitoring'

// POST /api/system/monitor/snapshot
// يسجل لقطة لحجم قاعدة البيانات والاستهلاك — تُستخدم لاحقًا في توقع تاريخ النفاذ
// يُستدعى من: مؤقت GitHub Actions اليومي (عبر رأس x-cron-secret) أو يدويًا من حساب system_operator
export async function POST(request: Request) {
  const user = await getCurrentUser()
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = request.headers.get('x-cron-secret')

  const authorized =
    (user && user.role === 'system_operator') ||
    (cronSecret && headerSecret && headerSecret === cronSecret)

  if (!authorized) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }

  try {
    const metrics = await recordResourceSnapshot()
    return NextResponse.json({
      success: true,
      captured_at: metrics.captured_at,
      database_size_pretty: metrics.database_size_pretty,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'خطأ غير متوقع' },
      { status: 500 }
    )
  }
}
