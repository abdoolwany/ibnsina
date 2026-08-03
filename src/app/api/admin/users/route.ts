import { NextResponse } from 'next/server'
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUsername, usernameToEmail } from '@/lib/validation'
import type { UserRole } from '@/types/database'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single() as never as { data: { role: string } | null }
  if (profile?.role !== 'moh_admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const admin = await createServiceRoleClient()
  const { data: users } = await admin.from('user_profiles').select('*, user_hospital_links(hospital_id)')

  return NextResponse.json({ users })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single() as never as { data: { role: string } | null }
  if (profile?.role !== 'moh_admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { username, password, fullName, role, hospitalIds } = await request.json()

  if (!username || !password || !fullName || !role) {
    return NextResponse.json({ error: 'جميع الحقول مطلوبة' }, { status: 400 })
  }

  if (!isValidUsername(username)) {
    return NextResponse.json({ error: 'اسم المستخدم غير صالح (3-30 حرفًا: أحرف، أرقام، . _ - بدون @)' }, { status: 400 })
  }

  const validRoles: UserRole[] = ['hospital_entry', 'hospital_verifier', 'moh_level1', 'moh_admin', 'system_operator']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'دور غير صحيح' }, { status: 400 })
  }

  const admin = await createServiceRoleClient()

  // التحقق من عدم تكرار اسم المستخدم
  const { data: existing } = await admin.from('user_profiles').select('id').eq('username', username.toLowerCase()).maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'اسم المستخدم مستخدم بالفعل' }, { status: 409 })
  }

  const email = usernameToEmail(username)

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: username.toLowerCase() },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  const { error: profileError } = await admin.from('user_profiles').insert({
    id: authData.user.id,
    role,
    full_name: fullName,
    username: username.toLowerCase(),
  })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  if (hospitalIds && hospitalIds.length > 0) {
    const { error: linkError } = await admin.from('user_hospital_links').insert(
      hospitalIds.map((hid: string) => ({ user_id: authData.user.id, hospital_id: hid }))
    )
    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, userId: authData.user.id })
}

export async function PUT(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single() as never as { data: { role: string } | null }
  if (profile?.role !== 'moh_admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { userId, role, fullName, username, hospitalIds, newPassword } = await request.json()
  const admin = await createServiceRoleClient()

  if (newPassword !== undefined) {
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, { status: 400 })
    }
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
    if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 })
  }

  if (username !== undefined) {
    if (!isValidUsername(username)) {
      return NextResponse.json({ error: 'اسم المستخدم غير صالح' }, { status: 400 })
    }
    const newUsername = username.toLowerCase()
    const { data: existing } = await admin.from('user_profiles').select('id').eq('username', newUsername).maybeSingle()
    if (existing && existing.id !== userId) {
      return NextResponse.json({ error: 'اسم المستخدم مستخدم بالفعل' }, { status: 409 })
    }
    const newEmail = usernameToEmail(newUsername)
    const { error: emailErr } = await admin.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
      user_metadata: { username: newUsername },
    })
    if (emailErr) return NextResponse.json({ error: emailErr.message }, { status: 500 })
    await admin.from('user_profiles').update({ username: newUsername }).eq('id', userId)
  }
  if (role) {
    await admin.from('user_profiles').update({ role } as never).eq('id', userId)
  }
  if (fullName) {
    await admin.from('user_profiles').update({ full_name: fullName } as never).eq('id', userId)
  }
  if (hospitalIds !== undefined) {
    await admin.from('user_hospital_links').delete().eq('user_id', userId)
    if (hospitalIds.length > 0) {
      await admin.from('user_hospital_links').insert(
        hospitalIds.map((hid: string) => ({ user_id: userId, hospital_id: hid }))
      )
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single() as never as { data: { role: string } | null }
  if (profile?.role !== 'moh_admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'معرّف المستخدم مطلوب' }, { status: 400 })

  if (userId === user.id) {
    return NextResponse.json({ error: 'لا يمكنك حذف حسابك الحالي' }, { status: 400 })
  }

  const admin = await createServiceRoleClient()

  // 1) قوائم التطعيم التي أضافها المستخدم:
  //    تُحذف تلقائيًا إن لم تكن مرتبطة بأي سجل أطفال، وإلا نمنع الحذف برسالة واضحة
  //    (عمود added_by إلزامي، وهو العائق الوحيد الذي سبّب رسالة الخطأ الفارغة {} سابقًا)
  const { data: vaccinators } = await admin
    .from('vaccinators')
    .select('id')
    .eq('added_by', userId)

  if (vaccinators && vaccinators.length > 0) {
    const { data: usedVaccinators } = await admin
      .from('child_vaccination_records')
      .select('vaccinator_id')
      .in('vaccinator_id', vaccinators.map(v => v.id))

    if (usedVaccinators && usedVaccinators.length > 0) {
      return NextResponse.json({
        error: `لا يمكن حذف المستخدم: ${usedVaccinators.length} من قوائم التطعيم التي أضافها لا تزال مرتبطة بسجلات أطفال. أوقف هذه القوائم من حساب الموثّق أولًا ثم أعد المحاولة.`,
      }, { status: 409 })
    }

    const { error: vaccinatorsError } = await admin.from('vaccinators').delete().eq('added_by', userId)
    if (vaccinatorsError) return NextResponse.json({ error: vaccinatorsError.message }, { status: 500 })
  }

  // 2) سجلات أطفال مرتبطة بالمستخدم (كمدخل أو كموثّق) تمنع حذفه
  const { data: childRefs } = await admin
    .from('child_vaccination_records')
    .select('id')
    .or(`entered_by.eq.${userId},verified_by.eq.${userId}`)

  if (childRefs && childRefs.length > 0) {
    return NextResponse.json({
      error: `لا يمكن حذف المستخدم: مرتبط بـ ${childRefs.length} سجل أطفال (إدخال أو توثيق).`,
    }, { status: 409 })
  }

  // 3) دفعات/طلبيات أنشأها المستخدم تمنع حذفه
  const { data: batchRefs } = await admin
    .from('vaccine_batches')
    .select('id')
    .eq('created_by', userId)

  if (batchRefs && batchRefs.length > 0) {
    return NextResponse.json({
      error: `لا يمكن حذف المستخدم: مرتبط بـ ${batchRefs.length} دفعة/طلبية سجّلها.`,
    }, { status: 409 })
  }

  // 4) سجلات أرشيف عمليات الحذف التي نفّذها المستخدم
  const { data: archiveRefs } = await admin
    .from('deleted_child_vaccination_records')
    .select('id')
    .eq('deleted_by', userId)

  if (archiveRefs && archiveRefs.length > 0) {
    return NextResponse.json({
      error: `لا يمكن حذف المستخدم: مرتبط بـ ${archiveRefs.length} سجل في أرشيف الحذف.`,
    }, { status: 409 })
  }

  // 5) الحذف الفعلي بالترتيب الآمن:
  //    audit_log.performed_by و unverify_requests.resolved_by يُفرّغان تلقائيًا (SET NULL)،
  //    و unverify_requests.requested_by و user_hospital_links.user_id يُحذفان تلقائيًا (CASCADE)
  await admin.from('user_hospital_links').delete().eq('user_id', userId)
  await admin.from('user_profiles').delete().eq('id', userId)

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
