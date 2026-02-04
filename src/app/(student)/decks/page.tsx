import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import Link from 'next/link'
import type { Profile } from '@/types/database'

interface DeckWithStats {
  id: string
  name: string
  owner_id: string
  is_distributed: boolean
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
      .select('id, name, owner_id, is_distributed')
      .eq('owner_id', userId),
    supabase
      .from('decks')
      .select('id, name, owner_id, is_distributed')
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

  if (!profile) {
    return null
  }

  const decks = await getDecksWithStats(profile.id)

  const ownDecks = decks.filter(d => d.is_own)
  const assignedDecks = decks.filter(d => !d.is_own)

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">デッキ一覧</h1>
          {profile.role !== 'student' && (
            <Link
              href="/decks/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              新規作成
            </Link>
          )}
        </div>

        {/* 自分のデッキ */}
        {ownDecks.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">マイデッキ</h2>
            <div className="space-y-3">
              {ownDecks.map((deck) => (
                <DeckCard key={deck.id} deck={deck} />
              ))}
            </div>
          </section>
        )}

        {/* 配布されたデッキ */}
        {assignedDecks.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">配布デッキ</h2>
            <div className="space-y-3">
              {assignedDecks.map((deck) => (
                <DeckCard key={deck.id} deck={deck} />
              ))}
            </div>
          </section>
        )}

        {/* デッキがない場合 */}
        {decks.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">デッキがありません</h2>
            <p className="text-gray-500">
              {profile.role === 'student'
                ? '講師からデッキが配布されるのを待ちましょう。'
                : 'デッキを作成して、生徒に配布しましょう。'}
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function DeckCard({ deck }: { deck: DeckWithStats }) {
  const hasDueCards = deck.review_count > 0 || deck.learning_count > 0 || deck.new_count > 0

  return (
    <Link
      href={`/decks/${deck.id}`}
      className="block bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{deck.name}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {deck.total_cards} 枚のカード
            {!deck.is_own && <span className="ml-2 text-blue-600">（配布）</span>}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 学習状況バッジ */}
          <div className="flex items-center gap-2 text-sm">
            {deck.new_count > 0 && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded font-medium">
                新規 {deck.new_count}
              </span>
            )}
            {deck.learning_count > 0 && (
              <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded font-medium">
                学習中 {deck.learning_count}
              </span>
            )}
            {deck.review_count > 0 && (
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded font-medium">
                復習 {deck.review_count}
              </span>
            )}
            {!hasDueCards && deck.total_cards > 0 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded">
                完了
              </span>
            )}
          </div>

          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  )
}
