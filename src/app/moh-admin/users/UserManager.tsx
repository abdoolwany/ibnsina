"use client"

import { useState, useEffect, useCallback } from "react"
import type { Hospital, UserRole } from "@/types/database"

interface UserProfile {
  id: string
  full_name: string
  username?: string | null
  role: UserRole
  user_hospital_links: { hospital_id: string }[]
}

const roleLabels: Record<UserRole, string> = {
  hospital_entry: 'مدخل بيانات',
  hospital_verifier: 'موثق',
  moh_level1: 'وزارة - مستوى أول',
  moh_admin: 'إدارة عليا',
  system_operator: 'مشغل النظام',
}

// الأدوار التي يستطيع كل مدير إنشاؤها/تعديلها (تتوافق مع /api/admin/users)
// system_operator: كل الأدوار. moh_admin: الحسابات الدنيا فقط ولا يرى مشغل النظام.
const ALL_ROLES: UserRole[] = ['hospital_entry', 'hospital_verifier', 'moh_level1', 'moh_admin', 'system_operator']
const MOH_ADMIN_MANAGED_ROLES: UserRole[] = ['hospital_entry', 'hospital_verifier', 'moh_level1']

export default function UserManager({ hospitals, currentUserId, managerRole }: { hospitals: Hospital[]; currentUserId: string; managerRole: 'moh_admin' | 'system_operator' }) {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editRole, setEditRole] = useState<UserRole>('hospital_entry')
  const [editUsername, setEditUsername] = useState("")
  const [editPassword, setEditPassword] = useState("")

  // New user form
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [role, setRole] = useState<UserRole>('hospital_entry')
  const [selectedHospitals, setSelectedHospitals] = useState<string[]>([])

  const manageableRoles = managerRole === 'system_operator' ? ALL_ROLES : MOH_ADMIN_MANAGED_ROLES

  // جلب البيانات يُعيدها فقط (بدون setState)؛ والتحديث يتم داخل callbacks غير متزامنة
  // حتى لا يتسبب تحديث الحالة المتزامن داخل الـ effect في إعادة رسم متتالية.
  const fetchUsers = useCallback(async (): Promise<UserProfile[]> => {
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'خطأ في جلب المستخدمين')
    return data.users ?? []
  }, [])

  const loadUsers = useCallback(() => {
    fetchUsers()
      .then(users => setUsers(users))
      .catch(err => setError(err instanceof Error ? err.message : 'خطأ في جلب المستخدمين'))
      .finally(() => setLoading(false))
  }, [fetchUsers])

  useEffect(() => { loadUsers() }, [loadUsers])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, fullName, role, hospitalIds: selectedHospitals }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }
    setShowForm(false)
    setUsername(""); setPassword(""); setFullName(""); setRole('hospital_entry'); setSelectedHospitals([])
    loadUsers()
  }

  async function handleUpdateLinks(userId: string, hospitalIds: string[]) {
    await fetch('/api/admin/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, hospitalIds }),
    })
    loadUsers()
  }

  async function handleSaveEdit(u: UserProfile) {
    const res = await fetch('/api/admin/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.id, fullName: editName, role: editRole, username: editUsername, newPassword: editPassword || undefined }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }
    setEditingId(null)
    setError("")
    loadUsers()
  }

  async function handleDelete(u: UserProfile) {
    if (!confirm(`هل أنت متأكد من حذف المستخدم "${u.full_name}"؟ لا يمكن التراجع.`)) return
    setError("")
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.id }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }
    loadUsers()
  }

  function toggleHospital(arr: string[], id: string): string[] {
    return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]
  }

  function startEdit(u: UserProfile) {
    setEditingId(u.id)
    setEditName(u.full_name)
    setEditRole(u.role)
    setEditUsername(u.username ?? '')
    setEditPassword("")
  }

  // moh_admin لا يرى حسابات moh_admin أو system_operator في القائمة إطلاقًا
  const visibleUsers = managerRole === 'system_operator' ? users : users.filter(u => manageableRoles.includes(u.role))

  if (loading) return <p className="text-gray-500">جاري التحميل...</p>

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
        {showForm ? 'إلغاء' : '+ إنشاء مستخدم جديد'}
      </button>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-4 space-y-3 max-w-lg">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">الاسم الكامل</label>
              <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">اسم المستخدم</label>
              <input type="text" required value={username} onChange={e => setUsername(e.target.value)}
                placeholder="بدون @"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">كلمة المرور</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">الدور</label>
              <select value={role} onChange={e => setRole(e.target.value as UserRole)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {manageableRoles.map(key => (
                  <option key={key} value={key}>{roleLabels[key]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">المستشفيات المرتبطة</label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {hospitals.map(h => (
                <label key={h.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedHospitals.includes(h.id)}
                    onChange={() => setSelectedHospitals(toggleHospital(selectedHospitals, h.id))} />
                  {h.name}
                </label>
              ))}
            </div>
          </div>
          {error && <div className="bg-red-50 p-2 text-sm text-red-700 rounded">{error}</div>}
          <button type="submit" className="btn btn-success">إنشاء المستخدم</button>
        </form>
      )}

      {error && <div className="bg-red-50 p-3 text-sm text-red-700 rounded">{error}</div>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-right">
                <th className="py-3 px-4">اسم المستخدم</th>
                <th className="py-3 px-4">الاسم</th>
                <th className="py-3 px-4">الدور</th>
                <th className="py-3 px-4">المستشفيات</th>
                <th className="py-3 px-4">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map(u => (
              <tr key={u.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-mono text-xs">
                  {editingId === u.id ? (
                    <input type="text" value={editUsername} onChange={e => setEditUsername(e.target.value)}
                      placeholder="بدون @"
                      className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                  ) : (
                    <span className="text-primary">{u.username ?? '-'}</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {editingId === u.id ? (
                    <div className="space-y-2">
                      <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                      <select value={editRole} onChange={e => setEditRole(e.target.value as UserRole)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm">
                        {manageableRoles.map(key => (
                          <option key={key} value={key}>{roleLabels[key]}</option>
                        ))}
                      </select>
                      <input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)}
                        placeholder="كلمة سر جديدة (اتركها فارغة لعدم التغيير)"
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                      <div className="flex gap-2">
                        <button onClick={() => handleSaveEdit(u)} className="btn btn-success px-3 py-1 text-xs">حفظ</button>
                        <button onClick={() => setEditingId(null)} className="btn btn-secondary px-3 py-1 text-xs">إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <span>{u.full_name}</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <span className={`badge ${u.role === 'moh_admin' ? 'badge-purple' : u.role === 'system_operator' ? 'badge-danger' : 'badge-info'}`}>
                    {roleLabels[u.role] || u.role}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1">
                    {manageableRoles.includes(u.role) && hospitals.map(h => (
                      <button key={h.id}
                        onClick={() => handleUpdateLinks(u.id, toggleHospital(u.user_hospital_links?.map(l => l.hospital_id) ?? [], h.id))}
                        className={`text-xs px-2 py-0.5 rounded border ${(u.user_hospital_links || []).some(l => l.hospital_id === h.id) ? 'bg-green-100 border-green-300 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                        {h.name}
                      </button>
                    ))}
                    {u.role === 'moh_admin' && <span className="text-xs text-gray-400">كل النظام</span>}
                    {u.role === 'system_operator' && <span className="text-xs text-gray-400">—</span>}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(u)} className="text-primary hover:text-primary-dark text-sm">تعديل</button>
                    {u.id !== currentUserId && (
                      <button onClick={() => handleDelete(u)} className="text-red-600 hover:text-red-800 text-sm">حذف</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
