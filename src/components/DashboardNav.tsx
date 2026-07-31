"use client"

import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useRouter, usePathname } from "next/navigation"
import type { AuthUser } from "@/lib/auth"

const roleLabels: Record<string, string> = {
  hospital_entry: 'مدخل بيانات',
  hospital_verifier: 'موثق',
  moh_level1: 'وزارة - مستوى أول',
  moh_admin: 'الإدارة العليا',
  system_operator: 'مشغل النظام',
}

const roleDashboards: Record<string, string> = {
  hospital_entry: '/hospital-entry',
  hospital_verifier: '/hospital-verifier',
  moh_level1: '/moh-level1',
  moh_admin: '/moh-admin',
  system_operator: '/system-operator',
}

export default function DashboardNav({ user }: { user: AuthUser }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.refresh()
  }

  return (
    <nav className="bg-white shadow-sm border-b no-print">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={roleDashboards[user.role ?? ''] ?? '/'} className="text-lg font-bold text-gray-900 hover:text-blue-700">
            نظام تتبع تطعيم كبدي B
          </Link>
          {pathname !== roleDashboards[user.role ?? ''] && (
            <Link href={roleDashboards[user.role ?? ''] ?? '/'} className="text-sm text-blue-600 hover:text-blue-800">
              الرئيسية
            </Link>
          )}
          {user.role !== 'system_operator' && (
            <>
              <Link href="/reports" className={`text-sm ${pathname === '/reports' ? 'text-blue-800 font-semibold' : 'text-blue-600 hover:text-blue-800'}`}>
                التقارير
              </Link>
              <Link href="/reports/batches" className={`text-sm ${pathname.startsWith('/reports/batches') ? 'text-blue-800 font-semibold' : 'text-blue-600 hover:text-blue-800'}`}>
                حركة الطعوم
              </Link>
            </>
          )}
          <Link href="/account" className={`text-sm ${pathname.startsWith('/account') ? 'text-blue-800 font-semibold' : 'text-blue-600 hover:text-blue-800'}`}>
            حسابي
          </Link>
          <span className="text-sm bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
            {roleLabels[user.role ?? ''] ?? user.role}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user.fullName}</span>
          <button onClick={handleLogout} className="text-sm text-red-600 hover:text-red-800">
            تسجيل الخروج
          </button>
        </div>
      </div>
    </nav>
  )
}
