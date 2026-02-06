import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import { StudyPageClient } from './StudyPageClient'
import type { Profile, GeneratedContent, FieldDefinition, DeckSettings } from '@/types/database'
import type { CardSchedule } from '@/lib/srs/scheduler'
import { resolveDeckSettings } from '@/lib/srs/scheduler'
import { orderStudyCards } from '@/lib/srs/card-ordering'

interface CardData {
  id: string
  noteId: string
  fieldValues: Record<string, string>
  audioUrls: Record<string, string> | null
  generatedContent: GeneratedContent | null
  template: {
    front: string
    back: string
    css: string
  }
  fields?: FieldDefinition[]
  clozeNumber?: number
  schedule: CardSchedule
}

interface SearchParams {
  deck?: string
}

async function getStudyCards(userId: string, deckId: string): Promise<{ cards: CardData[]; deckSettings: Partial<DeckSettings> }> {
  const supabase = await createClient()
  const now = new Date()

  // Get all descendant deck IDs for subdeck support (may fail if migration 008 hasn't been run)
  let allDeckIds = [deckId]
  try {
    const { data: descendantIds } = await supabase.rpc('get_descendant_deck_ids', { p_deck_id: deckId })
    if (descendantIds && Array.isArray(descendantIds) && descendantIds.length > 0) {
      allDeckIds = [deckId, ...descendantIds]
    }
  } catch {
    // RPC doesn't exist yet - subdeck feature not available
  }

  // Get all cards in the deck and its subdecks with their notes and note types
  const { data: cards } = await supabase
    .from('cards')
    .select(`
      id,
      template_index,
      note_id,
      notes!inner (
        id,
        field_values,
        audio_urls,
        generated_content,
        note_type_id
      )
    `)
    .in('deck_id', allDeckIds)

  if (!cards || cards.length === 0) {
    const { data: deck } = await supabase.from('decks').select('settings').eq('id', deckId).single()
    return { cards: [], deckSettings: deck?.settings ?? {} }
  }

  // Get unique note type IDs
  const noteTypeIds = Array.from(new Set(cards.map(c => {
    const noteData = c.notes as unknown as { id: string; field_values: Record<string, string>; audio_urls: Record<string, string> | null; generated_content: GeneratedContent | null; note_type_id: string }
    return noteData.note_type_id
  })))

  // Get note types with their fields
  const { data: noteTypes } = await supabase
    .from('note_types')
    .select('id, fields')
    .in('id', noteTypeIds)

  // Create a map of note_type_id -> fields
  const fieldsMap = new Map<string, FieldDefinition[]>()
  for (const nt of noteTypes || []) {
    fieldsMap.set(nt.id, nt.fields as FieldDefinition[])
  }

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

  // Get deck settings (full object)
  const { data: deck } = await supabase
    .from('decks')
    .select('settings')
    .eq('id', deckId)
    .single()

  const deckSettings: Partial<DeckSettings> = deck?.settings ?? {}
  const settings = resolveDeckSettings(deckSettings)

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

  const remainingNewCards = Math.max(0, settings.new_cards_per_day - (newCardsToday || 0))

  // Count today's review count (for max_reviews_per_day)
  const { count: todayReviewCount } = await supabase
    .from('review_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('card_id', cardIds)
    .gt('last_interval', 0) // Only review cards, not new
    .gte('reviewed_at', todayStart.toISOString())

  // Categorize cards
  const dueCards: CardData[] = []
  const newCards: CardData[] = []

  for (const card of cards) {
    const state = stateMap.get(card.id)
    const noteData = card.notes as unknown as { id: string; field_values: Record<string, string>; audio_urls: Record<string, string> | null; generated_content: GeneratedContent | null; note_type_id: string }
    const noteId = noteData.id
    const fieldValues = noteData.field_values
    const audioUrls = noteData.audio_urls
    const generatedContent = noteData.generated_content
    const noteTypeId = noteData.note_type_id

    // Skip suspended cards
    if (state?.state === 'suspended') continue

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
      noteId,
      fieldValues,
      audioUrls,
      generatedContent,
      template,
      fields: fieldsMap.get(noteTypeId),
      schedule: state ? {
        due: new Date(state.due),
        interval: state.interval,
        easeFactor: state.ease_factor,
        repetitions: state.repetitions,
        state: state.state as CardSchedule['state'],
        learningStep: state.learning_step,
        lapses: state.lapses ?? 0,
      } : {
        due: now,
        interval: 0,
        easeFactor: 2.5,
        repetitions: 0,
        state: 'new' as const,
        learningStep: 0,
        lapses: 0,
      },
    }

    if (!state || state.state === 'new') {
      newCards.push(cardData)
    } else if (new Date(state.due) <= now) {
      dueCards.push(cardData)
    }
  }

  // Use orderStudyCards for proper ordering
  const studyCards = orderStudyCards(
    dueCards,
    newCards,
    remainingNewCards,
    todayReviewCount || 0,
    settings
  )

  return { cards: studyCards, deckSettings }
}

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const deckId = params.deck || null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('id', user?.id)
    .single() as { data: Profile | null }

  // Offline or unauthenticated - render client-only fallback
  // StudyPageClient will load userId and cards from IndexedDB
  if (!profile) {
    return (
      <Suspense>
        <StudyPageClient deckId={deckId} />
      </Suspense>
    )
  }

  // If no deck specified, show deck selection
  if (!deckId) {
    return (
      <AppLayout userName={profile.name} userRole={profile.role}>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <StudyPageClient
            deckId={null}
            userId={profile.id}
            userProfile={{ name: profile.name, role: profile.role }}
          />
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
  const { cards: studyCards, deckSettings } = await getStudyCards(profile.id, deckId)

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <div className="max-w-4xl mx-auto px-4">
        <StudyPageClient
          deckId={deckId}
          deckName={deck.name}
          initialCards={studyCards}
          userId={profile.id}
          userProfile={{ name: profile.name, role: profile.role }}
          deckSettings={deckSettings}
        />
      </div>
    </AppLayout>
  )
}
