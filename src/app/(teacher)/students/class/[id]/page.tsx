import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ClassDetailClient } from './ClassDetailClient'

interface Profile {
  id: string
  name: string
  role: 'student' | 'teacher' | 'admin'
}

interface PageProps {
  params: Promise<{ id: string }>
}

interface ClassMember {
  user_id: string
  joined_at: string
  profiles: {
    id: string
    name: string
    email: string
  }
}

interface ClassWithMembers {
  id: string
  name: string
  teacher_id: string
  created_at: string
  class_members: ClassMember[]
}

interface Student {
  id: string
  name: string
  email: string
}

async function getClassWithMembers(classId: string, teacherId: string) {
  const supabase = await createClient()

  const { data: classData } = await supabase
    .from('classes')
    .select(`
      id,
      name,
      teacher_id,
      created_at,
      class_members (
        user_id,
        joined_at,
        profiles:user_id (
          id,
          name,
          email
        )
      )
    `)
    .eq('id', classId)
    .eq('teacher_id', teacherId)
    .single()

  return classData as ClassWithMembers | null
}

async function getAllStudents() {
  const supabase = await createClient()

  const { data: students } = await supabase
    .from('profiles')
    .select('id, name, email')
    .eq('role', 'student')
    .order('name')

  return students as Student[] || []
}

export default async function ClassDetailPage({ params }: PageProps) {
  const { id } = await params
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

  if (profile.role === 'student') {
    redirect('/decks')
  }

  const classData = await getClassWithMembers(id, profile.id)

  if (!classData) {
    notFound()
  }

  const allStudents = await getAllStudents()

  // Transform members
  const members = classData.class_members?.map(m => ({
    id: m.user_id,
    name: m.profiles?.name || 'Unknown',
    email: m.profiles?.email || '',
    joinedAt: m.joined_at,
  })) || []

  // Filter out students who are already members
  const memberIds = new Set(members.map(m => m.id))
  const availableStudents = allStudents.filter(s => !memberIds.has(s.id))

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/students"
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            クラス一覧
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{classData.name}</h1>
        </div>

        <ClassDetailClient
          classId={id}
          className={classData.name}
          initialMembers={members}
          availableStudents={availableStudents}
        />
      </div>
    </AppLayout>
  )
}
