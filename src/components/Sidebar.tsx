"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Home,
  FileText,
  Activity,
  UserCircle,
  Baby,
  Users,
  Building2,
  ShieldCheck,
  LogOut,
  Syringe,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { AuthUser } from "@/lib/auth"

const roleLabels: Record<string, string> = {
  hospital_entry: 'مدخل بيانات',
  hospital_verifier: 'موثق',
  moh_level1: 'وزارة - مستوى أول',
  moh_admin: 'الإدارة العليا',
  system_operator: 'مشغل النظام',
}

interface NavItem {
  href: string
  label: string
  icon: typeof Home
  matchExact?: boolean
}

// ترتيب القائمة بحسب صلاحيات كل دور (بند 3): لا يظهر عنصر غير متاح لدور المستخدم
function getNavItems(role: string): NavItem[] {
  const dashboard = role === 'system_operator' ? '/system-operator' : role === 'hospital_entry' ? '/hospital-entry' : role === 'hospital_verifier' ? '/hospital-verifier' : role === 'moh_level1' ? '/moh-level1' : '/moh-admin'
  const items: NavItem[] = [{ href: dashboard, label: 'الرئيسية', icon: Home, matchExact: true }]

  if (role === 'hospital_entry') {
    items.push({ href: '/hospital-entry/new', label: 'تسجيل طفل جديد', icon: Baby, matchExact: true })
  }
  if (role === 'hospital_verifier') {
    items.push({ href: '/hospital-verifier/vaccinators', label: 'القائمون بالتطعيم', icon: Syringe, matchExact: true })
  }
  if (role === 'moh_admin') {
    items.push({ href: '/moh-admin/hospitals', label: 'المستشفيات', icon: Building2, matchExact: true })
    items.push({ href: '/moh-admin/users', label: 'المستخدمون', icon: Users, matchExact: true })
  }

  if (role !== 'system_operator') {
    items.push({ href: '/reports', label: 'التقارير والبحث', icon: FileText, matchExact: true })
    items.push({ href: '/reports/batches', label: 'حركة الطعوم', icon: Activity, matchExact: true })
  }

  if (role !== 'system_operator') {
    items.push({ href: '/account', label: 'حسابي', icon: UserCircle, matchExact: true })
  }

  return items
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.matchExact) return pathname === item.href
  return pathname.startsWith(item.href)
}

export default function Sidebar({ user }: { user: AuthUser }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const items = getNavItems(user.role ?? '')

  async function handleLogout() {
    await supabase.auth.signOut()
    router.refresh()
  }

  return (
    <aside className="sidebar sidebar-gradient no-print" dir="rtl">
      <div className="px-5 py-5 border-b border-white/15 flex items-center gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-white/15 text-white">
          <ShieldCheck size={22} />
        </span>
        <div>
          <p className="font-bold text-white leading-tight">منظومة التطعيم</p>
          <p className="text-[11px] text-white/80">الالتهاب الكبدي B</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {items.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-item ${isActive(pathname, item) ? 'active' : ''}`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="px-3 pb-4">
        <div className="px-2 py-2 border-t border-white/15 flex items-center gap-3 mb-1">
          <span className="grid place-items-center w-9 h-9 rounded-full bg-white/15 text-white text-sm font-bold">
            {(user.fullName ?? user.email ?? '؟').charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{user.fullName ?? user.email}</p>
            <p className="text-[11px] text-white/75">{roleLabels[user.role ?? ''] ?? user.role}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="sidebar-item sidebar-logout w-full text-right">
          <LogOut size={18} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  )
}
