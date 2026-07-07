'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import Link from 'next/link'
import { ClassDetailClient } from './ClassDetailClient'
import { createClient } from '@/lib/supabase/client'

interface Member {
  id: string
  name: string
  email: string
  joinedAt: string
}

interface Student {
  id: string
  name: string
  email: string
}

export default function ClassDetailPage() {
  const params = useParams<{ id: string }>()
  // Fallback to window.location when rendered outside Next.js routing (offline mode)
  const id = params.id || (typeof window !== 'undefined' ? window.location.pathname.split('/students/class/')[1]?.split('/')[0] : '') || ''
  const { profile, isLoading } = useAuth()
  const [classData, setClassData] = useState<{ name: string; members: Member[]; availableStudents: Student[] } | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id || !profile || profile.role === 'student') return

    const loadClassData = async () => {
      try {
        const supabase = createClient()

        // Load class with members
        const { data: cls } = await supabase
          .from('classes')
          .select(`
            id,
            name,
            teacher_id,
            billing_template_id,
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
          .eq('id', id)
          .single()

        // Verify access: own class or billing-synced
        if (cls && cls.teacher_id !== profile.id && !cls.billing_template_id) {
          setNotFound(true)
          return
        }

        if (!cls) {
          setNotFound(true)
          return
        }

        interface ClassMember {
          user_id: string
          joined_at: string
          profiles: { id: string; name: string; email: string }
        }

        const members = ((cls.class_members as unknown as ClassMember[]) || []).map(m => ({
          id: m.user_id,
          name: m.profiles?.name || 'Unknown',
          email: m.profiles?.email || '',
          joinedAt: m.joined_at,
        }))

        // Load all students
        const { data: allStudents } = await supabase
          .from('profiles')
          .select('id, name, email')
          .eq('role', 'student')
          .order('name')

        const memberIds = new Set(members.map(m => m.id))
        const availableStudents = ((allStudents as Student[]) || []).filter(s => !memberIds.has(s.id))

        setClassData({
          name: cls.name as string,
          members,
          availableStudents,
        })
      } catch {
        setNotFound(true)
      }
    }

    loadClassData()
  }, [id, profile])

  if (isLoading || (!classData && !notFound)) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="h-4 bg-gray-200 rounded w-24 mb-2 animate-pulse" />
          <div className="h-8 bg-gray-200 rounded w-48 mb-6 animate-pulse" />
          <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 h-16 animate-pulse" />
          <div className="bg-white rounded-card border border-gray-200 p-4 h-48 animate-pulse" />
        </div>
      </AppLayout>
    )
  }

  if (notFound || !classData) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="bg-again-bg border border-again/20 rounded-card p-4 text-again">
            クラスが見つかりませんでした。
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/students"
            className="text-sm text-ink-3 hover:text-ink-2 font-bold mb-2 inline-flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            クラス一覧
          </Link>
          <h1 className="text-2xl font-extrabold text-ai">{classData.name}</h1>
        </div>

        <ClassDetailClient
          classId={id}
          className={classData.name}
          initialMembers={classData.members}
          availableStudents={classData.availableStudents}
        />
      </div>
    </AppLayout>
  )
}
