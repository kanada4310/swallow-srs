import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import { DecksPageClient } from './DecksPageClient'
import type { Profile } from '@/types/database'

interface DeckWithStats {
  id: string
  name: string
  owner_id: string
  is_distributed: boolean
  parent_deck_id: string | null
  is_own: boolean
  total_cards: number
  new_count: number
  learning_count: number
  review_count: number
}

async function getDecksWithStats(userId: string): Promise<DeckWithStats[]> {
  const supabase = await createClient()

  // Get own decks and assigned decks in parallel
  const [{ data: ownDecks }, { data: assignedDecks }] = await Promise.all([
    supabase
      .from('decks')
      .select('id, name, owner_id, is_distributed, parent_deck_id')
      .eq('owner_id', userId),
    supabase
      .from('decks')
      .select('id, name, owner_id, is_distributed, parent_deck_id')
      .neq('owner_id', userId),
  ])

  const allDecks = [
    ...(ownDecks || []).map(d => ({ ...d, is_own: true })),
    ...(assignedDecks || []).map(d => ({ ...d, is_own: false })),
  ]

  if (allDecks.length === 0) return []

  const deckIds = allDecks.map(d => d.id)

  // Batch: get all cards for all decks + all card_states for this user in 2 queries
  const [{ data: allCards }, { data: allCardStates }] = await Promise.all([
    supabase
      .from('cards')
      .select('id, deck_id')
      .in('deck_id', deckIds),
    supabase
      .from('card_states')
      .select('card_id, state')
      .eq('user_id', userId),
  ])

  // Build lookup maps
  const cardsByDeck = new Map<string, string[]>()
  for (const card of allCards || []) {
    const list = cardsByDeck.get(card.deck_id) || []
    list.push(card.id)
    cardsByDeck.set(card.deck_id, list)
  }

  const stateByCard = new Map<string, string>()
  for (const cs of allCardStates || []) {
    stateByCard.set(cs.card_id, cs.state)
  }

  // Aggregate stats per deck
  return allDecks.map(deck => {
    const cardIds = cardsByDeck.get(deck.id) || []
    let newCount = 0
    let learningCount = 0
    let reviewCount = 0

    for (const cardId of cardIds) {
      const state = stateByCard.get(cardId)
      if (!state || state === 'new') {
        newCount++
      } else if (state === 'learning' || state === 'relearning') {
        learningCount++
      } else if (state === 'review') {
        reviewCount++
      }
    }

    return {
      ...deck,
      parent_deck_id: deck.parent_deck_id || null,
      total_cards: cardIds.length,
      new_count: newCount,
      learning_count: learningCount,
      review_count: reviewCount,
    }
  })
}

export default async function DecksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('id', user?.id)
    .single() as { data: Profile | null }

  // Offline or unauthenticated - render client-only fallback
  // DecksPageClient will load profile and decks from IndexedDB
  if (!profile) {
    return <DecksPageClient />
  }

  const decks = await getDecksWithStats(profile.id)

  // Fetch note types for the full note browser
  const { data: noteTypes } = await supabase
    .from('note_types')
    .select('*')
    .or(`owner_id.eq.${profile.id},is_system.eq.true`)
    .order('name')

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <DecksPageClient
        initialDecks={decks}
        noteTypes={noteTypes || []}
        userProfile={{ id: profile.id, name: profile.name, role: profile.role }}
      />
    </AppLayout>
  )
}
