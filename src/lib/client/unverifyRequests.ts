import { createClient } from '@/lib/supabase/client'

// دوال تُستدعى فقط من مكوّنات "use client" — لا تستورد next/headers.

// حسم الطلب من الوزارة (اعتماد/رفض) عبر RPC آمن (resolve_unverify_request)
export async function resolveUnverifyRequest(
  requestId: string,
  decision: 'approve' | 'reject'
): Promise<{ error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const { error } = await supabase.rpc('resolve_unverify_request', {
    req_id: requestId,
    decision,
  })
  return error ? { error: error.message } : {}
}
