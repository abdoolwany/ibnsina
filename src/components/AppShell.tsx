import type { AuthUser } from '@/lib/auth'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

interface Props {
  user: AuthUser
  children: React.ReactNode
  maxWidth?: string
}

// هيكل عام لكل الصفحات المحمية: قائمة جانبية يمين + شريط علوي ثابت + محتوى.
// الصفحة نفسها تحدد صلاحية الوصول، وهنا يُعرض الهيكل فقط (فصل الطبقات — القسم 12).
export default function AppShell({ user, children, maxWidth = 'max-w-7xl' }: Props) {
  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <Sidebar user={user} />
      <div className="app-main">
        <TopBar user={user} />
        <main className={`${maxWidth} w-full mx-auto px-4 py-6 flex-1`}>
          {children}
        </main>
      </div>
    </div>
  )
}
