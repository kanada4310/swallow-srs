import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import { TTSSettings } from '@/components/audio/TTSSettings'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface Profile {
  id: string
  name: string
  role: 'student' | 'teacher' | 'admin'
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('id', user?.id)
    .single() as { data: Profile | null }

  if (!profile) {
    return null
  }

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        </div>

        <div className="space-y-6">
          <TTSSettings />
        </div>
      </div>
    </AppLayout>
  )
}
