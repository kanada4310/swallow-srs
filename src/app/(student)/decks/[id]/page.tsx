import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import type { Profile, NoteType } from '@/types/database'
import type { BrowsableNote } from '@/components/deck/NoteCard'
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

  // Get all descendant deck IDs for subdeck note inclusion
  let allDeckIds = [deckId]
  try {
    const { data: descendantIds } = await supabase.rpc('get_descendant_deck_ids', { p_deck_id: deckId })
    if (descendantIds && Array.isArray(descendantIds) && descendantIds.length > 0) {
      allDeckIds = [deckId, ...descendantIds]
    }
  } catch {
    // RPC doesn't exist yet - subdeck feature not available
  }

  // Get notes with their cards (first page + total count)
  // Try with tags column first; if migration 008 hasn't been run, fall back without
  let notes: Array<Record<string, unknown>> | null = null
  let totalNoteCount: number | null = null

  const notesResult = await supabase
    .from('notes')
    .select(`
      id,
      field_values,
      note_type_id,
      generated_content,
      tags,
      created_at,
      cards (id)
    `, { count: 'exact' })
    .in('deck_id', allDeckIds)
    .order('created_at', { ascending: false })
    .range(0, 49)

  if (notesResult.error && notesResult.error.message?.includes('tags')) {
    const fallback = await supabase
      .from('notes')
      .select(`
        id,
        field_values,
        note_type_id,
        generated_content,
        created_at,
        cards (id)
      `, { count: 'exact' })
      .in('deck_id', allDeckIds)
      .order('created_at', { ascending: false })
      .range(0, 49)
    notes = fallback.data
    totalNoteCount = fallback.count
  } else {
    notes = notesResult.data
    totalNoteCount = notesResult.count
  }

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

  // Get unique tags for this deck (may fail if migration 008 hasn't been run)
  let deckTags: string[] = []
  try {
    const { data: deckTagsData } = await supabase.rpc('get_deck_tags', { p_deck_id: deckId })
    deckTags = (deckTagsData as string[] | null) || []
  } catch {
    // RPC doesn't exist yet - tags feature not available
  }

  // Get child decks
  const { data: childDecks } = await supabase
    .from('decks')
    .select('id, name, parent_deck_id')
    .eq('parent_deck_id', deckId)
    .order('name')

  return {
    deck,
    notes: notes || [],
    totalNoteCount: totalNoteCount || 0,
    totalCards: totalCards || 0,
    dueCount,
    newCount,
    isOwner: deck.owner_id === userId,
    deckTags,
    childDecks: childDecks || [],
    allDeckIds,
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

        {/* Child Decks */}
        {deckData.childDecks.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">サブデッキ</h2>
            <div className="space-y-2">
              {deckData.childDecks.map((child: { id: string; name: string }) => (
                <Link
                  key={child.id}
                  href={`/decks/${child.id}`}
                  className="block bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-md hover:border-gray-300 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-900">{child.name}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Create Sub-deck Button */}
        {canEdit && (
          <div className="mb-6">
            <Link
              href={`/decks/new?parent=${id}`}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              サブデッキを作成
            </Link>
          </div>
        )}

        {/* Client Component for Note Management */}
        <DeckDetailClient
          deckId={id}
          allDeckIds={deckData.allDeckIds}
          notes={deckData.notes as unknown as BrowsableNote[]}
          totalNoteCount={deckData.totalNoteCount}
          noteTypes={noteTypes as NoteType[]}
          deckTags={deckData.deckTags}
          canEdit={canEdit}
        />
      </div>
    </AppLayout>
  )
}
