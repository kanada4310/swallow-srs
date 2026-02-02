import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import { StudySession } from '@/components/card/StudySession'
import Link from 'next/link'
import type { Profile } from '@/types/database'
import type { CardSchedule } from '@/lib/srs/scheduler'

interface CardData {
  id: string
  fieldValues: Record<string, string>
  template: {
    front: string
    back: string
    css: string
  }
  clozeNumber?: number
  schedule: CardSchedule
}

interface SearchParams {
  deck?: string
}

async function getStudyCards(userId: string, deckId: string): Promise<CardData[]> {
  const supabase = await createClient()
  const now = new Date()

  // Get all cards in the deck with their notes and note types
  const { data: cards } = await supabase
    .from('cards')
    .select(`
      id,
      template_index,
      notes!inner (
        field_values,
        note_type_id
      )
    `)
    .eq('deck_id', deckId)

  if (!cards || cards.length === 0) {
    return []
  }

  // Get unique note type IDs
  const noteTypeIds = Array.from(new Set(cards.map(c => {
    const noteData = c.notes as unknown as { field_values: Record<string, string>; note_type_id: string }
    return noteData.note_type_id
  })))

  // Get card templates for these note types
  const { data: templates } = await supabase
    .from('card_templates')
    .select('*')
    .in('note_type_id', noteTypeIds)
    .order('ordinal')

  // Create a map of note_type_id -> templates
  const templateMap = new Map<string, Array<{ front: string; back: string; css: string }>>()
  for (const template of templates || []) {
    const existing = templateMap.get(template.note_type_id) || []
    existing.push({
      front: template.front_template,
      back: template.back_template,
      css: template.css || '',
    })
    templateMap.set(template.note_type_id, existing)
  }

  // Get card states for this user
  const cardIds = cards.map(c => c.id)
  const { data: cardStates } = await supabase
    .from('card_states')
    .select('*')
    .eq('user_id', userId)
    .in('card_id', cardIds)

  const stateMap = new Map(cardStates?.map(cs => [cs.card_id, cs]) || [])

  // Get deck settings for new cards per day
  const { data: deck } = await supabase
    .from('decks')
    .select('settings')
    .eq('id', deckId)
    .single()

  const newCardsPerDay = deck?.settings?.new_cards_per_day ?? 20

  // Count how many new cards were introduced today
  const todayStart = new Date()
  todayStart.setHours(4, 0, 0, 0) // 4 AM reset
  if (now.getHours() < 4) {
    todayStart.setDate(todayStart.getDate() - 1)
  }

  const { count: newCardsToday } = await supabase
    .from('review_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('card_id', cardIds)
    .eq('last_interval', 0) // First review of a card
    .gte('reviewed_at', todayStart.toISOString())

  const remainingNewCards = Math.max(0, newCardsPerDay - (newCardsToday || 0))

  // Categorize cards
  const dueCards: CardData[] = []
  const newCards: CardData[] = []

  for (const card of cards) {
    const state = stateMap.get(card.id)
    const noteData = card.notes as unknown as { field_values: Record<string, string>; note_type_id: string }
    const fieldValues = noteData.field_values
    const noteTypeId = noteData.note_type_id

    // Get template for this card
    const cardTemplates = templateMap.get(noteTypeId) || []
    const templateIndex = card.template_index
    const template = cardTemplates[templateIndex] || {
      front: '<div>{{Front}}</div>',
      back: '<div>{{Front}}</div><hr><div>{{Back}}</div>',
      css: '',
    }

    const cardData: CardData = {
      id: card.id,
      fieldValues,
      template,
      schedule: state ? {
        due: new Date(state.due),
        interval: state.interval,
        easeFactor: state.ease_factor,
        repetitions: state.repetitions,
        state: state.state as CardSchedule['state'],
        learningStep: state.learning_step,
      } : {
        due: now,
        interval: 0,
        easeFactor: 2.5,
        repetitions: 0,
        state: 'new' as const,
        learningStep: 0,
      },
    }

    if (!state || state.state === 'new') {
      newCards.push(cardData)
    } else if (new Date(state.due) <= now) {
      dueCards.push(cardData)
    }
  }

  // Sort due cards by due date (oldest first)
  dueCards.sort((a, b) => a.schedule.due.getTime() - b.schedule.due.getTime())

  // Combine: due cards first, then new cards (limited)
  const studyCards = [
    ...dueCards,
    ...newCards.slice(0, remainingNewCards),
  ]

  return studyCards
}

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const deckId = params.deck

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

  // If no deck specified, show deck selection
  if (!deckId) {
    return (
      <AppLayout userName={profile.name} userRole={profile.role}>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">学習</h1>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">デッキを選択してください</h2>
            <p className="text-gray-500 mb-4">
              学習するデッキを選んで学習を始めましょう。
            </p>
            <Link
              href="/decks"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              デッキ一覧へ
            </Link>
          </div>
        </div>
      </AppLayout>
    )
  }

  // Get deck info
  const { data: deck } = await supabase
    .from('decks')
    .select('id, name')
    .eq('id', deckId)
    .single()

  if (!deck) {
    return (
      <AppLayout userName={profile.name} userRole={profile.role}>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            デッキが見つかりませんでした。
          </div>
        </div>
      </AppLayout>
    )
  }

  // Get study cards
  const studyCards = await getStudyCards(profile.id, deckId)

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <div className="max-w-4xl mx-auto px-4">
        <StudySession
          deckName={deck.name}
          initialCards={studyCards}
        />
      </div>
    </AppLayout>
  )
}
