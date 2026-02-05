import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import type { Profile, NoteType } from '@/types/database'
import { DeckDetailClient } from './DeckDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getDeckWithNotes(deckId: string, userId: string) {
  const supabase = await createClient()

  // Get deck
  const { data: deck } = await supabase
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .single()

  if (!deck) return null

  // Get notes with their cards
  const { data: notes } = await supabase
    .from('notes')
    .select(`
      id,
      field_values,
      note_type_id,
      generated_content,
      created_at,
      cards (id)
    `)
    .eq('deck_id', deckId)
    .order('created_at', { ascending: false })

  // Get card count
  const { count: totalCards } = await supabase
    .from('cards')
    .select('*', { count: 'exact', head: true })
    .eq('deck_id', deckId)

  // Get due cards count for this user
  const now = new Date().toISOString()
  const { data: dueCards } = await supabase
    .from('card_states')
    .select('card_id')
    .eq('user_id', userId)
    .lte('due', now)

  const dueCardIds = new Set(dueCards?.map(c => c.card_id) || [])

  // Get cards in this deck that are due
  const { data: deckCards } = await supabase
    .from('cards')
    .select('id')
    .eq('deck_id', deckId)

  let dueCount = 0
  for (const card of deckCards || []) {
    if (dueCardIds.has(card.id)) {
      dueCount++
    }
  }

  // New cards are those without card_state
  const { data: cardStatesForDeck } = await supabase
    .from('card_states')
    .select('card_id')
    .eq('user_id', userId)

  const studiedCardIds = new Set(cardStatesForDeck?.map(cs => cs.card_id) || [])
  let newCount = 0
  for (const card of deckCards || []) {
    if (!studiedCardIds.has(card.id)) {
      newCount++
    }
  }

  return {
    deck,
    notes: notes || [],
    totalCards: totalCards || 0,
    dueCount,
    newCount,
    isOwner: deck.owner_id === userId,
  }
}

async function getNoteTypes(userId: string) {
  const supabase = await createClient()

  // Get system note types and custom note types owned by the user
  const { data: noteTypes } = await supabase
    .from('note_types')
    .select('id, name, fields, generation_rules')
    .or(`is_system.eq.true,owner_id.eq.${userId}`)
    .order('is_system', { ascending: false })
    .order('name')

  return noteTypes || []
}

export default async function DeckDetailPage({ params }: PageProps) {
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

  const deckData = await getDeckWithNotes(id, profile.id)

  if (!deckData) {
    notFound()
  }

  const noteTypes = await getNoteTypes(profile.id)
  const canEdit = deckData.isOwner && profile.role !== 'student'

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href="/decks"
              className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              デッキ一覧
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">{deckData.deck.name}</h1>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">{deckData.totalCards}</p>
              <p className="text-sm text-gray-500">総カード数</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{deckData.newCount}</p>
              <p className="text-sm text-gray-500">新規</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{deckData.dueCount}</p>
              <p className="text-sm text-gray-500">復習待ち</p>
            </div>
          </div>
        </div>

        {/* Study Button */}
        {deckData.totalCards > 0 && (
          <Link
            href={`/study?deck=${id}`}
            className="block w-full py-4 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 transition-colors font-medium mb-6"
          >
            学習を開始
          </Link>
        )}

        {/* Client Component for Note Management */}
        <DeckDetailClient
          deckId={id}
          notes={deckData.notes}
          noteTypes={noteTypes as NoteType[]}
          canEdit={canEdit}
        />
      </div>
    </AppLayout>
  )
}
