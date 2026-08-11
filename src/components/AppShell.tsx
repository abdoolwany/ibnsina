"use client"

import { useEffect, useState } from "react"
import type { AuthUser } from '@/lib/auth'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

interface Props {
  user: AuthUser
  children: React.ReactNode
  maxWidth?: string
}

export default function AppShell({ user, children, maxWidth = 'max-w-7xl' }: Props) {
  // على الشاشات الكبيرة تبدأ القائمة مفتوحة (طلب المستخدم) وزر ثلاث الخطوط يطويها.
  // على الهاتف تبدأ مطوية افتراضيًا حتى لا تبتلع مساحة المحتوى، وتنفتح كطبقة فوقية
  // فوق الصفحة (مع خلفية معتمة تُغلقها عند النقر خارجها) — إصلاح مشكلة طغيانها.
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => {
      const mobile = mq.matches
      setIsMobile(mobile)
      setCollapsed(mobile) // الهاتف: مطوية افتراضيًا | الشاشة الكبيرة: مفتوحة
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return (
    <div dir="rtl" className="min-h-screen min-h-dvh bg-background">
      <Sidebar user={user} collapsed={collapsed} />
      {/* خلفية معتمة عند فتح القائمة على الهاتف فقط — النقر عليها يطويها */}
      {isMobile && !collapsed && (
        <div className="sidebar-backdrop no-print" onClick={() => setCollapsed(true)} aria-hidden="true" />
      )}
      <div className={`app-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar user={user} onToggleSidebar={() => setCollapsed(c => !c)} collapsed={collapsed} />
        <main className={`${maxWidth} w-full mx-auto px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] flex-1`}>
          {children}
        </main>
      </div>
    </div>
  )
}
