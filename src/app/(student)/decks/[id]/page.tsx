'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { db, getDescendantDeckIds } from '@/lib/db/schema'
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
}

function DeckDetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="h-4 bg-gray-200 rounded w-24 mb-2 animate-pulse" />
      <div className="h-8 bg-gray-200 rounded w-48 mb-6 animate-pulse" />
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
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
      <div className="h-12 bg-gray-200 rounded mb-6 animate-pulse" />
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
    </div>
  )
}

export default function DeckDetailPage() {
  const params = useParams()
  const deckId = params.id as string
  const { profile, isLoading: authLoading } = useAuth()
  const [deckData, setDeckData] = useState<DeckData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (authLoading || !profile || !deckId) return

    let cancelled = false

    async function loadDeckData() {
      try {
        // Get deck from Dexie
        const deck = await db.decks.get(deckId)
        if (!deck) {
          if (!cancelled) setNotFound(true)
          if (!cancelled) setIsLoading(false)
          return
        }

        // Get descendant deck IDs
        const descendantIds = await getDescendantDeckIds(deckId)
        const allDeckIds = [deckId, ...descendantIds]

        // Get notes (first 50) from all deck IDs
        const allNotes = await db.notes
          .where('deck_id')
          .anyOf(allDeckIds)
          .toArray()

        // Sort by created_at descending
        allNotes.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
          return dateB - dateA
        })

        const totalNoteCount = allNotes.length
        const pagedNotes = allNotes.slice(0, 50)

        // Get cards for paged notes
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

        // Get total card count for this deck (not subdecks)
        const deckCards = await db.cards.where('deck_id').equals(deckId).toArray()
        const totalCards = deckCards.length

        // Get card states for user
        const cardIds = deckCards.map(c => c.id)
        const cardStates = cardIds.length > 0
          ? await db.cardStates.where('card_id').anyOf(cardIds).toArray()
          : []
        const cardStateMap = new Map(cardStates.filter(cs => cs.user_id === profile!.id).map(cs => [cs.card_id, cs]))

        // Calculate due and new counts
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

        // Get unique note type IDs
        const noteTypeIdSet = new Set(allNotes.map(n => n.note_type_id))
        // Also get system and user-owned note types
        const allNoteTypes = await db.noteTypes.toArray()
        const noteTypes = allNoteTypes.filter(nt =>
          noteTypeIdSet.has(nt.id) ||
          nt.is_system ||
          nt.owner_id === profile!.id
        ) as NoteType[]

        // Get unique tags from notes
        const tagSet = new Set<string>()
        for (const n of allNotes) {
          if (n.tags) {
            for (const tag of n.tags) tagSet.add(tag)
          }
        }
        const deckTags = Array.from(tagSet).sort()

        // Get child decks
        const childDecks = await db.decks
          .where('parent_deck_id')
          .equals(deckId)
          .toArray()
        childDecks.sort((a, b) => a.name.localeCompare(b.name))

        const isOwner = deck.owner_id === profile!.id

        // Get user-specific deck settings override
        let mergedSettings: Partial<DeckSettings> = (deck.settings || {}) as Partial<DeckSettings>
        if (!isOwner) {
          try {
            const settingsKey = `${profile!.id}:${deckId}`
            const userSettings = await db.userDeckSettings.get(settingsKey)
            if (userSettings?.settings) {
              mergedSettings = { ...mergedSettings, ...userSettings.settings } as Partial<DeckSettings>
            }
          } catch {
            // userDeckSettings table might not exist
          }
        }

        if (!cancelled) {
          setDeckData({
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
            canEdit: isOwner,
            userRole: profile!.role,
          })
          setIsLoading(false)
        }
      } catch (error) {
        console.error('Failed to load deck data from Dexie:', error)
        if (!cancelled) {
          setNotFound(true)
          setIsLoading(false)
        }
      }
    }

    loadDeckData()
    return () => { cancelled = true }
  }, [deckId, profile, authLoading])

  if (authLoading || isLoading) {
    return (
      <AppLayout>
        <DeckDetailSkeleton />
      </AppLayout>
    )
  }

  if (!profile) return null

  if (notFound || !deckData) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">デッキが見つかりません</h1>
          <p className="text-gray-600 mb-6">このデッキは存在しないか、アクセス権がありません。</p>
          <Link
            href="/decks"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            デッキ一覧に戻る
          </Link>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
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
            <h1 className="text-2xl font-bold text-gray-900">{deckData.deckName}</h1>
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
            href={`/study?deck=${deckId}`}
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
              {deckData.childDecks.map((child) => (
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
        {deckData.canEdit && (
          <div className="mb-6">
            <Link
              href={`/decks/new?parent=${deckId}`}
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
        />
      </div>
    </AppLayout>
  )
}
