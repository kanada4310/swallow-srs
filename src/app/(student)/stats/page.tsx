import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import { StatsContent } from './StatsContent'

interface Profile {
  id: string
  name: string
  role: 'student' | 'teacher' | 'admin'
}

export default async function StatsPage() {
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
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">学習統計</h1>
        <StatsContent />
      </div>
    </AppLayout>
  )
}
