'use client'

import { useParams } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { db } from '@/lib/db/schema'
import { resolveDeckScope, noteMatchesFilterTags } from '@/lib/db/deck-scope'
import type { NoteType, DeckSettings } from '@/types/database'
import type { BrowsableNote } from '@/components/deck/NoteCard'
import { DeckDetailClient } from './DeckDetailClient'

interface DeckData {
  deckName: string
  deckSettings: Partial<DeckSettings>
  allDeckIds: string[]
  notes: BrowsableNote[]
  totalNoteCount: number
  totalCards: number
  dueCount: number
  newCount: number
  isOwner: boolean
  noteTypes: NoteType[]
  deckTags: string[]
  childDecks: Array<{ id: string; name: string }>
  canEdit: boolean
  userRole: string
  isFilterDeck: boolean
  /** フィルタサブデッキのタグ（ノート一覧・単語帳をこのタグで固定絞り込み）。通常デッキは null */
  lockedFilterTags: string[] | null
}

function DeckDetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="h-4 bg-gray-200 rounded-xl w-24 mb-2 animate-pulse" />
      <div className="h-8 bg-gray-200 rounded-xl w-48 mb-6 animate-pulse" />
      <div className="bg-white rounded-card border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="h-8 bg-gray-200 rounded w-12 mx-auto mb-1 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-16 mx-auto animate-pulse" />
          </div>
          <div>
            <div className="h-8 bg-gray-200 rounded w-12 mx-auto mb-1 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-16 mx-auto animate-pulse" />
          </div>
          <div>
            <div className="h-8 bg-gray-200 rounded w-12 mx-auto mb-1 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-16 mx-auto animate-pulse" />
          </div>
        </div>
      </div>
      <div className="h-12 bg-gray-200 rounded-2xl mb-6 animate-pulse" />
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-gray-200 rounded-2xl animate-pulse" />
        ))}
      </div>
    </div>
  )
}

type DeckDetailResult =
  | { kind: 'found'; data: DeckData }
  | { kind: 'not_found' }

export default function DeckDetailPage() {
  const params = useParams()
  // Fallback to window.location when rendered outside Next.js routing (offline mode)
  const deckId = (params.id as string) || (typeof window !== 'undefined' ? window.location.pathname.split('/decks/')[1]?.split('/')[0] : '') || ''
  const { profile, isLoading: authLoading } = useAuth()

  // liveQuery: re-runs whenever any read table changes in IndexedDB.
  // This is what makes the page auto-refresh when sync brings in deck/cards/notes
  // for a LINE deep-link landing on an empty IndexedDB.
  const result = useLiveQuery<DeckDetailResult | null>(
    async () => {
      if (authLoading || !profile || !deckId) return null
      try {
        const deck = await db.decks.get(deckId)
        if (!deck) return { kind: 'not_found' }

        // フィルタサブデッキはノート実体が親（ルート）ツリーにある
        // → ルートツリー全体から filter_tags で絞った結果を「このデッキの中身」として表示する
        const scope = await resolveDeckScope(deckId)
        const allDeckIds = scope.allDeckIds

        const rawNotes = await db.notes
          .where('deck_id')
          .anyOf(allDeckIds)
          .toArray()
        const allNotes = scope.isFilterDeck
          ? rawNotes.filter(n => noteMatchesFilterTags(n.tags, scope.filterTags))
          : rawNotes

        allNotes.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
          return dateB - dateA
        })

        const totalNoteCount = allNotes.length
        const pagedNotes = allNotes.slice(0, 50)

        const noteIds = pagedNotes.map(n => n.id)
        const allCards = noteIds.length > 0
          ? await db.cards.where('note_id').anyOf(noteIds).toArray()
          : []
        const cardsMap = new Map<string, Array<{ id: string }>>()
        for (const card of allCards) {
          if (!cardsMap.has(card.note_id)) cardsMap.set(card.note_id, [])
          cardsMap.get(card.note_id)!.push({ id: card.id })
        }

        const browsableNotes: BrowsableNote[] = pagedNotes.map(n => ({
          id: n.id,
          deck_id: n.deck_id,
          field_values: n.field_values,
          note_type_id: n.note_type_id,
          generated_content: n.generated_content || null,
          tags: n.tags || [],
          created_at: typeof n.created_at === 'string' ? n.created_at : new Date(n.created_at || Date.now()).toISOString(),
          cards: cardsMap.get(n.id) || [],
        }))

        // 統計: フィルタデッキは「絞ったノートに属するカード」を母集団にする（デッキ一覧チップと一致）
        let deckCards
        if (scope.isFilterDeck) {
          const matchedNoteIds = new Set(allNotes.map(n => n.id))
          const treeCards = await db.cards.where('deck_id').anyOf(allDeckIds).toArray()
          deckCards = treeCards.filter(c => matchedNoteIds.has(c.note_id))
        } else {
          deckCards = await db.cards.where('deck_id').equals(deckId).toArray()
        }
        const totalCards = deckCards.length

        const cardIds = deckCards.map(c => c.id)
        const cardStates = cardIds.length > 0
          ? await db.cardStates.where('card_id').anyOf(cardIds).toArray()
          : []
        const cardStateMap = new Map(cardStates.filter(cs => cs.user_id === profile.id).map(cs => [cs.card_id, cs]))

        const now = new Date()
        let dueCount = 0
        let newCount = 0
        for (const card of deckCards) {
          const cs = cardStateMap.get(card.id)
          if (!cs) {
            newCount++
          } else if (cs.due <= now && cs.state !== 'suspended') {
            dueCount++
          }
        }

        const noteTypeIdSet = new Set(allNotes.map(n => n.note_type_id))
        const allNoteTypes = await db.noteTypes.toArray()
        const noteTypes = allNoteTypes.filter(nt =>
          noteTypeIdSet.has(nt.id) ||
          nt.is_system ||
          nt.owner_id === profile.id
        ) as NoteType[]

        const tagSet = new Set<string>()
        for (const n of allNotes) {
          if (n.tags) {
            for (const tag of n.tags) tagSet.add(tag)
          }
        }
        const deckTags = Array.from(tagSet).sort()

        const childDecks = await db.decks
          .where('parent_deck_id')
          .equals(deckId)
          .toArray()
        childDecks.sort((a, b) => a.name.localeCompare(b.name))

        const isOwner = deck.owner_id === profile.id
        // 講師は他講師のデッキも共同編集できる（サーバー側 canManageDeck で最終判定）
        const isTeacher = profile.role === 'teacher' || profile.role === 'admin'
        const canEdit = isOwner || isTeacher
        const isFilterDeck = !!(deck.filter_tags && deck.filter_tags.length > 0 && deck.parent_deck_id)

        let mergedSettings: Partial<DeckSettings> = (deck.settings || {}) as Partial<DeckSettings>
        if (!canEdit) {
          try {
            const settingsKey = `${profile.id}:${deckId}`
            const userSettings = await db.userDeckSettings.get(settingsKey)
            if (userSettings?.settings) {
              mergedSettings = { ...mergedSettings, ...userSettings.settings } as Partial<DeckSettings>
            }
          } catch {
            // userDeckSettings table might not exist
          }
        }

        return {
          kind: 'found',
          data: {
            deckName: deck.name,
            deckSettings: mergedSettings,
            allDeckIds,
            notes: browsableNotes,
            totalNoteCount,
            totalCards,
            dueCount,
            newCount,
            isOwner,
            noteTypes,
            deckTags,
            childDecks: childDecks.map(d => ({ id: d.id, name: d.name })),
            canEdit,
            userRole: profile.role,
            isFilterDeck,
            lockedFilterTags: scope.isFilterDeck ? scope.filterTags : null,
          },
        }
      } catch (error) {
        console.error('Failed to load deck data from Dexie:', error)
        return { kind: 'not_found' }
      }
    },
    [deckId, profile?.id, authLoading],
  )

  if (authLoading || result === undefined || result === null) {
    return (
      <AppLayout>
        <DeckDetailSkeleton />
      </AppLayout>
    )
  }

  if (!profile) return null

  if (result.kind === 'not_found') {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6 text-center">
          <h1 className="text-2xl font-extrabold text-ai mb-4">デッキが見つかりません</h1>
          <p className="text-ink-2 mb-6">このデッキは存在しないか、アクセス権がありません。</p>
          <Link
            href="/decks"
            className="text-sora hover:text-sora-dark font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            デッキ一覧に戻る
          </Link>
        </div>
      </AppLayout>
    )
  }

  const deckData = result.data

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href="/decks"
              className="text-sm text-ink-3 hover:text-ink-2 font-bold mb-2 inline-flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              デッキ一覧
            </Link>
            <h1 className="text-2xl font-extrabold text-ai">{deckData.deckName}</h1>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-card border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-extrabold text-ai tabular-nums">{deckData.totalCards}</p>
              <p className="text-sm text-ink-3">総カード数</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-easy tabular-nums">{deckData.newCount}</p>
              <p className="text-sm text-ink-3">新規</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-good tabular-nums">{deckData.dueCount}</p>
              <p className="text-sm text-ink-3">復習待ち</p>
            </div>
          </div>
        </div>

        {/* Study Button (also shown for filter subdecks whose cards belong to parent) */}
        {(deckData.totalCards > 0 || deckData.isFilterDeck) && (
          <Link
            href={`/study?deck=${deckId}`}
            className="block w-full py-4 bg-nodo text-white text-center rounded-2xl hover:bg-nodo-dark shadow-[0_4px_14px_rgba(255,120,73,.35)] transition-all active:scale-95 font-extrabold mb-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            学習を開始
          </Link>
        )}

        {/* Child Decks */}
        {deckData.childDecks.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-ai mb-3">サブデッキ</h2>
            <div className="space-y-2">
              {deckData.childDecks.map((child) => (
                <Link
                  key={child.id}
                  href={`/decks/${child.id}`}
                  className="block bg-white rounded-2xl border border-gray-200 p-3 hover:border-gray-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="text-sm font-bold text-ai">{child.name}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Create Sub-deck Button */}
        {deckData.canEdit && (
          <div className="mb-6">
            <Link
              href={`/decks/new?parent=${deckId}`}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-ink-2 border border-dashed border-gray-300 rounded-2xl hover:border-sora hover:text-sora transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
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
          deckId={deckId}
          deckName={deckData.deckName}
          deckSettings={deckData.deckSettings}
          allDeckIds={deckData.allDeckIds}
          notes={deckData.notes}
          totalNoteCount={deckData.totalNoteCount}
          noteTypes={deckData.noteTypes}
          deckTags={deckData.deckTags}
          canEdit={deckData.canEdit}
          isOwner={deckData.isOwner}
          userRole={deckData.userRole}
          lockedFilterTags={deckData.lockedFilterTags}
        />
      </div>
    </AppLayout>
  )
}
