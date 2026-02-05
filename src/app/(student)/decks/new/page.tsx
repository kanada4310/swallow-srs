import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import { DeckForm } from '@/components/deck/DeckForm'
import { redirect } from 'next/navigation'
import type { Profile } from '@/types/database'

interface SearchParams {
  parent?: string
}

export default async function NewDeckPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const parentId = params.parent || ''

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

  // Only teachers and admins can create decks
  if (profile.role === 'student') {
    redirect('/decks')
  }

  // Fetch user's decks for parent selection
  const { data: userDecks } = await supabase
    .from('decks')
    .select('id, name')
    .eq('owner_id', profile.id)
    .order('name')

  const parentDecks = (userDecks || []).map(d => ({ id: d.id, name: d.name }))

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">新しいデッキを作成</h1>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <DeckForm
            mode="create"
            parentDecks={parentDecks}
            defaultParentId={parentId}
          />
        </div>
      </div>
    </AppLayout>
  )
}
