import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import { NotesPageClient } from './NotesPageClient'
import type { Profile, GeneratedContent } from '@/types/database'

export default async function NotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('id', user?.id)
    .single() as { data: Profile | null }

  if (!profile) {
    return <NotesPageClient />
  }

  // Fetch note types
  const { data: noteTypes } = await supabase
    .from('note_types')
    .select('*')
    .or(`owner_id.eq.${profile.id},is_system.eq.true`)
    .order('name')

  // Fetch all accessible deck IDs + names for cross-deck search
  const [{ data: ownDecks }, { data: directAssignments }, { data: classMembers }] = await Promise.all([
    supabase.from('decks').select('id, name').eq('owner_id', profile.id),
    supabase.from('deck_assignments').select('deck_id').eq('user_id', profile.id),
    supabase.from('class_members').select('class_id').eq('user_id', profile.id),
  ])

  const deckMap = new Map<string, string>()
  for (const d of ownDecks || []) deckMap.set(d.id, d.name)

  // Get assigned deck details
  const assignedDeckIds: string[] = []
  for (const a of directAssignments || []) {
    if (!deckMap.has(a.deck_id)) assignedDeckIds.push(a.deck_id)
  }

  const classIds = (classMembers || []).map(cm => cm.class_id)
  if (classIds.length > 0) {
    const { data: classAssignments } = await supabase
      .from('deck_assignments')
      .select('deck_id')
      .in('class_id', classIds)
    for (const a of classAssignments || []) {
      if (!deckMap.has(a.deck_id)) assignedDeckIds.push(a.deck_id)
    }
  }

  // Fetch names for assigned decks
  if (assignedDeckIds.length > 0) {
    const { data: assignedDeckDetails } = await supabase
      .from('decks')
      .select('id, name')
      .in('id', assignedDeckIds)
    for (const d of assignedDeckDetails || []) deckMap.set(d.id, d.name)
  }

  // Also fetch subdeck names (children of known decks)
  const allDeckIds = Array.from(deckMap.keys())
  if (allDeckIds.length > 0) {
    const { data: subDecks } = await supabase
      .from('decks')
      .select('id, name')
      .in('parent_deck_id', allDeckIds)
    for (const d of subDecks || []) deckMap.set(d.id, d.name)
  }

  const allSearchDeckIds = Array.from(deckMap.keys())

  let initialNotes: Array<{
    id: string
    deck_id?: string
    field_values: Record<string, string>
    note_type_id: string
    generated_content: GeneratedContent | null
    tags: string[]
    created_at: string
    cards: Array<{ id: string }>
  }> = []
  let initialTotal = 0

  if (allSearchDeckIds.length > 0) {
    // Use direct query instead of RPC to avoid function overloading issues
    // (007 and 008 migrations created two overloaded search_notes functions)
    const { data: notesData, count } = await supabase
      .from('notes')
      .select('id, deck_id, field_values, note_type_id, generated_content, tags, created_at', { count: 'exact' })
      .in('deck_id', allSearchDeckIds)
      .order('created_at', { ascending: false })
      .range(0, 49)

    initialTotal = count || 0
    const rows = notesData || []

    // Get cards for these notes
    const noteIds = rows.map(r => r.id)
    const cardsMap: Record<string, Array<{ id: string }>> = {}
    if (noteIds.length > 0) {
      const { data: cards } = await supabase
        .from('cards')
        .select('id, note_id')
        .in('note_id', noteIds)
      if (cards) {
        for (const card of cards) {
          if (!cardsMap[card.note_id]) cardsMap[card.note_id] = []
          cardsMap[card.note_id].push({ id: card.id })
        }
      }
    }

    initialNotes = rows.map(row => ({
      id: row.id,
      deck_id: row.deck_id || undefined,
      field_values: row.field_values as Record<string, string>,
      note_type_id: row.note_type_id,
      generated_content: (row.generated_content as GeneratedContent | null) || null,
      tags: (row.tags as string[]) || [],
      created_at: row.created_at,
      cards: cardsMap[row.id] || [],
    }))
  }

  // Serialize deckNameMap for client
  const deckNameEntries = Array.from(deckMap.entries())

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <NotesPageClient
        initialNotes={initialNotes}
        initialTotal={initialTotal}
        noteTypes={noteTypes || []}
        deckNameEntries={deckNameEntries}
        userProfile={{ id: profile.id, name: profile.name, role: profile.role }}
      />
    </AppLayout>
  )
}
