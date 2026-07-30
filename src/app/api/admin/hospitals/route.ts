import { NextResponse } from 'next/server'
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single() as never as { data: { role: string } | null }
  if (profile?.role !== 'moh_admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const admin = await createServiceRoleClient()
  const { data: hospitals } = await admin.from('hospitals').select('*').order('name')

  return NextResponse.json({ hospitals })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single() as never as { data: { role: string } | null }
  if (profile?.role !== 'moh_admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { name } = await request.json()
  if (!name) return NextResponse.json({ error: 'اسم المستشفى مطلوب' }, { status: 400 })

  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('hospitals').insert({ name }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ hospital: data })
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single() as never as { data: { role: string } | null }
  if (profile?.role !== 'moh_admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { id } = await request.json()
  const admin = await createServiceRoleClient()
  const { error } = await admin.from('hospitals').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
