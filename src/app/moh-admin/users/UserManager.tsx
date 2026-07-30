"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import type { Hospital, UserRole } from "@/types/database"

interface UserProfile {
  id: string
  full_name: string
  role: UserRole
  user_hospital_links: { hospital_id: string }[]
}

const roleLabels: Record<UserRole, string> = {
  hospital_entry: 'مدخل بيانات',
  hospital_verifier: 'موثق',
  moh_level1: 'وزارة - مستوى أول',
  moh_admin: 'إدارة عليا',
}

export default function UserManager({ hospitals }: { hospitals: Hospital[] }) {
  const router = useRouter()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState("")

  // New user form
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [role, setRole] = useState<UserRole>('hospital_entry')
  const [selectedHospitals, setSelectedHospitals] = useState<string[]>([])

  async function loadUsers() {
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    setUsers(data.users ?? [])
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName, role, hospitalIds: selectedHospitals }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }
    setShowForm(false)
    setEmail(""); setPassword(""); setFullName(""); setRole('hospital_entry'); setSelectedHospitals([])
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

  function toggleHospital(arr: string[], id: string): string[] {
    return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]
  }

  if (loading) return <p className="text-gray-500">جاري التحميل...</p>

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
        {showForm ? 'إلغاء' : '+ إنشاء مستخدم جديد'}
      </button>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-lg shadow p-4 space-y-3 max-w-lg">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700">الاسم الكامل</label>
              <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">البريد الإلكتروني</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
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
                {Object.entries(roleLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
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
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">إنشاء المستخدم</button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-right">
              <th className="py-3 px-4">الاسم</th>
              <th className="py-3 px-4">البريد</th>
              <th className="py-3 px-4">الدور</th>
              <th className="py-3 px-4">المستشفيات</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4">{u.full_name}</td>
                <td className="py-3 px-4 text-gray-500">-</td>
                <td className="py-3 px-4">
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">
                    {roleLabels[u.role] || u.role}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1">
                    {u.role !== 'moh_admin' && hospitals.map(h => (
                      <button key={h.id}
                        onClick={() => handleUpdateLinks(u.id, toggleHospital(u.user_hospital_links?.map(l => l.hospital_id) ?? [], h.id))}
                        className={`text-xs px-2 py-0.5 rounded border ${(u.user_hospital_links || []).some(l => l.hospital_id === h.id) ? 'bg-green-100 border-green-300 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                        {h.name}
                      </button>
                    ))}
                    {u.role === 'moh_admin' && <span className="text-xs text-gray-400">كل النظام</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
