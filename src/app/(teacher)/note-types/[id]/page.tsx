import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import { NoteTypeEditorClient } from './NoteTypeEditorClient'
import type { NoteTypeWithTemplates, CardTemplate } from '@/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getNoteType(id: string): Promise<NoteTypeWithTemplates | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: noteType, error } = await supabase
    .from('note_types')
    .select(`
      *,
      card_templates (*)
    `)
    .eq('id', id)
    .or(`is_system.eq.true,owner_id.eq.${user.id}`)
    .single()

  if (error || !noteType) return null

  // Sort templates by ordinal
  if (noteType.card_templates) {
    noteType.card_templates.sort((a: CardTemplate, b: CardTemplate) => a.ordinal - b.ordinal)
  }

  return noteType as NoteTypeWithTemplates
}

export default async function EditNoteTypePage({ params }: PageProps) {
  const { id } = await params
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

  const noteType = await getNoteType(id)
  if (!noteType) {
    notFound()
  }

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <NoteTypeEditorClient mode="edit" noteType={noteType} />
      </div>
    </AppLayout>
  )
}
