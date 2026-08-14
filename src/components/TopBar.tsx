"use client"

import { useEffect, useState } from "react"
import { Syringe, Clock, Menu, PanelRightOpen } from "lucide-react"
import type { AuthUser } from "@/lib/auth"

const roleLabels: Record<string, string> = {
  hospital_entry: 'مدخل بيانات',
  hospital_verifier: 'موثق',
  moh_level1: 'وزارة - مستوى أول',
  moh_admin: 'الإدارة العليا',
  system_operator: 'مشغل النظام',
}

// ساعة رقمية حية بلون #17D4FE (بند 1/2) — تُحدَّث كل ثانية بتوقيت القاهرة
const clockFormatter = new Intl.DateTimeFormat('ar-EG', {
  timeZone: 'Africa/Cairo',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})

function useLiveClock() {
  const [now, setNow] = useState("")
  useEffect(() => {
    const update = () => setNow(clockFormatter.format(new Date()))
    const t = setInterval(update, 1000)
    // تحديث فوري بعد أول تيك لتجنب ظهور الساعة فارغة عند التحميل
    const id = setTimeout(update, 0)
    return () => { clearInterval(t); clearTimeout(id) }
  }, [])
  return now
}

export default function TopBar({
  user,
  onToggleSidebar,
  collapsed,
}: {
  user: AuthUser
  onToggleSidebar: () => void
  collapsed: boolean
}) {
  const clock = useLiveClock()

  return (
    <header className="topbar topbar-gradient no-print" dir="rtl">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3">
        {/* زر طي/إظهار القائمة الجانبية (ثلاث خطوط): يخفيها كاملةً ويوسّعها بنقرة أخرى */}
        <button
          onClick={onToggleSidebar}
          title={collapsed ? 'إظهار القائمة' : 'إخفاء القائمة'}
          className="grid place-items-center w-9 h-9 rounded-lg bg-white/15 text-white hover:bg-white/25 transition-colors shrink-0"
        >
          {collapsed ? <PanelRightOpen size={20} /> : <Menu size={20} />}
        </button>

        <div className="flex items-center gap-3 min-w-0">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-white/15 text-white shrink-0">
            <Syringe size={20} />
          </span>
          <span className="font-bold text-white hidden sm:inline">منظومة تطعيم الكبدي B</span>
        </div>

        {/* اسم النظام الكامل في المنتصف — أو اسم المستشفى لمدخل/موثق البيانات */}
        <h1 className="font-bold text-white text-base sm:text-lg text-center leading-snug">
          {user.role === 'hospital_entry' || user.role === 'hospital_verifier'
            ? (user.hospitalNames[0] ?? 'المستشفى')
            : 'منظومة تتبع توزيع لقاحات الالتهاب الكبدي B'}
        </h1>

        <div className="flex items-center gap-4 min-w-0">
          <span className="flex items-center gap-2 text-[#17D4FE] font-semibold text-sm" dir="ltr">
            <Clock size={16} className="shrink-0" />
            <span className="inline-block w-24 text-left tabular-nums shrink-0">{clock}</span>
          </span>
          <div className="hidden md:block text-left">
            <p className="text-sm font-semibold text-white truncate max-w-[160px]">{user.fullName ?? user.email}</p>
            <p className="text-[11px] text-white/75">{roleLabels[user.role ?? ''] ?? user.role}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
