'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { StudentsClient } from './StudentsClient'
import { createClient } from '@/lib/supabase/client'
import { db } from '@/lib/db/schema'

interface ClassData {
  id: string
  name: string
  memberCount: number
  created_at: string
}

export default function StudentsPage() {
  const { profile, isLoading } = useAuth()
  const [classes, setClasses] = useState<ClassData[] | null>(null)

  useEffect(() => {
    if (!profile || profile.role === 'student') return

    const loadClasses = async () => {
      // Try loading from Dexie first (instant)
      try {
        const localClasses = await db.classes
          .where('teacher_id')
          .equals(profile.id)
          .toArray()

        if (localClasses.length > 0) {
          const localMembers = await db.classMembers.toArray()
          const memberCountMap = new Map<string, number>()
          for (const m of localMembers) {
            memberCountMap.set(m.class_id, (memberCountMap.get(m.class_id) || 0) + 1)
          }

          const mapped = localClasses
            .map(c => ({
              id: c.id,
              name: c.name,
              memberCount: memberCountMap.get(c.id) || 0,
              created_at: c.created_at,
            }))
            .sort((a, b) => b.created_at.localeCompare(a.created_at))

          setClasses(mapped)
        }
      } catch {
        // Dexie not available
      }

      // Refresh from Supabase
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('classes')
          .select(`
            id,
            name,
            created_at,
            updated_at,
            class_members (user_id)
          `)
          .eq('teacher_id', profile.id)
          .order('created_at', { ascending: false })

        interface ClassWithMembers {
          id: string
          name: string
          created_at: string
          class_members: { user_id: string }[]
        }

        const mapped = ((data as ClassWithMembers[] | null) || []).map(c => ({
          id: c.id,
          name: c.name,
          memberCount: c.class_members?.length || 0,
          created_at: c.created_at,
        }))

        setClasses(mapped)
      } catch {
        if (!classes) setClasses([])
      }
    }

    loadClasses()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  if (isLoading || classes === null) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="h-8 bg-gray-200 rounded w-32 animate-pulse" />
            <div className="h-10 bg-gray-200 rounded w-32 animate-pulse" />
          </div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 h-16 animate-pulse" />
            ))}
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!profile || profile.role === 'student') return null

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <StudentsClient initialClasses={classes} />
      </div>
    </AppLayout>
  )
}
