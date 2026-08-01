"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export default function AccountForm({ email, fullName }: { email: string; fullName: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (newPassword.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين')
      return
    }
    if (newPassword === currentPassword) {
      setError('كلمة المرور الجديدة يجب أن تختلف عن الحالية')
      return
    }

    setLoading(true)

    // 1) التحقق من كلمة المرور الحالية بإعادة تسجيل الدخول
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })

    if (signInError) {
      setError('كلمة المرور الحالية غير صحيحة')
      setLoading(false)
      return
    }

    // 2) تحديث كلمة المرور
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setSuccess('تم تغيير كلمة المرور بنجاح')
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setLoading(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">الاسم</label>
        <input type="text" value={fullName} disabled
          className="mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">كلمة المرور الحالية</label>
        <input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">كلمة المرور الجديدة</label>
        <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">تأكيد كلمة المرور الجديدة</label>
        <input type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>

      {error && <div className="bg-red-50 p-3 text-sm text-red-700 rounded" role="alert">{error}</div>}
      {success && <div className="bg-green-50 p-3 text-sm text-green-700 rounded">{success}</div>}

      <button type="submit" disabled={loading}
        className="btn btn-primary w-full">
        {loading ? 'جاري الحفظ...' : 'تغيير كلمة المرور'}
      </button>
    </form>
  )
}
