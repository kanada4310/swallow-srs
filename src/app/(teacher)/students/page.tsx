import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import { redirect } from 'next/navigation'
import { StudentsClient } from './StudentsClient'

interface Profile {
  id: string
  name: string
  role: 'student' | 'teacher' | 'admin'
}

interface ClassWithMembers {
  id: string
  name: string
  created_at: string
  updated_at: string
  class_members: { user_id: string }[]
}

async function getClasses(userId: string) {
  const supabase = await createClient()

  const { data: classes } = await supabase
    .from('classes')
    .select(`
      id,
      name,
      created_at,
      updated_at,
      class_members (user_id)
    `)
    .eq('teacher_id', userId)
    .order('created_at', { ascending: false })

  return (classes as ClassWithMembers[] | null)?.map(c => ({
    id: c.id,
    name: c.name,
    memberCount: c.class_members?.length || 0,
    created_at: c.created_at,
  })) || []
}

export default async function StudentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('id', user?.id)
    .single() as { data: Profile | null }

  if (!profile) {
    redirect('/login')
  }

  // Only teachers and admins can access this page
  if (profile.role === 'student') {
    redirect('/decks')
  }

  const classes = await getClasses(profile.id)

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <StudentsClient initialClasses={classes} />
      </div>
    </AppLayout>
  )
}
