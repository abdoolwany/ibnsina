import { NextResponse } from 'next/server'
import { recordHealthCheck } from '@/lib/db/monitoring'

// GET /api/health — نقطة فحص الصحة التي تستهبلها المؤقتات الخارجية
// (GitHub Actions كل 48 ساعة أو UptimeRobot) — تُسجَّل نبضة فحص في قاعدة البيانات
export async function GET() {
  await recordHealthCheck('github_actions', 'ok')
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    project: 'ibnsina',
  })
}
