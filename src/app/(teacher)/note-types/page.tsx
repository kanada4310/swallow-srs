import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import Link from 'next/link'
import { NoteTypeListClient } from './NoteTypeListClient'

async function getNoteTypes() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return []

  const { data: noteTypes } = await supabase
    .from('note_types')
    .select(`
      *,
      card_templates (id)
    `)
    .or(`is_system.eq.true,owner_id.eq.${user.id}`)
    .order('is_system', { ascending: false })
    .order('name')

  if (!noteTypes) return []

  return noteTypes.map(nt => ({
    ...nt,
    template_count: nt.card_templates?.length || 0,
  }))
}

export default async function NoteTypesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
    redirect('/')
  }

  const noteTypes = await getNoteTypes()

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ノートタイプ管理</h1>
            <p className="text-sm text-gray-500 mt-1">
              カード表示用のテンプレートを管理します
            </p>
          </div>
          <Link
            href="/note-types/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新規作成
          </Link>
        </div>

        <NoteTypeListClient initialNoteTypes={noteTypes} />
      </div>
    </AppLayout>
  )
}
