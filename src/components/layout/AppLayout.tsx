import { Header } from '@/components/ui/Header'
import { BottomNav } from '@/components/ui/BottomNav'
import { InstallPrompt } from '@/components/ui/InstallPrompt'

interface AppLayoutProps {
  children: React.ReactNode
  userName?: string
  userRole?: 'student' | 'teacher' | 'admin'
}

export function AppLayout({ children, userName, userRole = 'student' }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header userName={userName} userRole={userRole} />
      <main className="flex-1 pb-16">
        {children}
      </main>
      <BottomNav role={userRole} />
      <InstallPrompt />
    </div>
  )
}
