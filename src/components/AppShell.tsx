"use client"

import { useState } from "react"
import type { AuthUser } from '@/lib/auth'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

interface Props {
  user: AuthUser
  children: React.ReactNode
  maxWidth?: string
}

// هيكل عام لكل الصفحات المحمية: قائمة جانبية يمين + شريط علوي ثابت + محتوى.
// القائمة قابلة للطي عبر زر ثلاث الخطوط في الشريط العلوي (الديفولت مفتوحة) —
// لإخفائها كاملةً وتوفير مساحة أكبر للمحتوى (طلب المستخدم).
export default function AppShell({ user, children, maxWidth = 'max-w-7xl' }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <Sidebar user={user} collapsed={collapsed} />
      <div className={`app-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar user={user} onToggleSidebar={() => setCollapsed(c => !c)} collapsed={collapsed} />
        <main className={`${maxWidth} w-full mx-auto px-4 py-6 flex-1`}>
          {children}
        </main>
      </div>
    </div>
  )
}
