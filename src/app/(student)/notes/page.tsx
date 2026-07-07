'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { db } from '@/lib/db/schema'
import { NotesPageClient } from './NotesPageClient'
import type { NoteType } from '@/types/database'
import type { BrowsableNote } from '@/components/deck/NoteCard'

interface NotesData {
  initialNotes: BrowsableNote[]
  initialTotal: number
  noteTypes: NoteType[]
  deckNameEntries: [string, string][]
  ownDeckIds: string[]
}

function NotesSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="h-8 bg-gray-200 rounded-xl w-32 mb-6 animate-pulse" />
      <div className="h-10 bg-gray-200 rounded-xl mb-4 animate-pulse" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-20 bg-gray-200 rounded-2xl animate-pulse" />
        ))}
      </div>
    </div>
  )
}

export default function NotesPage() {
  const { profile, isLoading: authLoading } = useAuth()
  const [notesData, setNotesData] = useState<NotesData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (authLoading || !profile) return

    let cancelled = false

    async function loadNotesData() {
      try {
        // Get note types (system + user-owned)
        const allNoteTypes = await db.noteTypes.toArray()
        const noteTypes = allNoteTypes.filter(
          nt => nt.is_system || nt.owner_id === profile!.id
        ) as NoteType[]

        // Get all accessible decks from Dexie
        const allDecks = await db.decks.toArray()
        const deckMap = new Map<string, string>()

        // Own decks
        const ownDeckIds: string[] = []
        for (const d of allDecks) {
          deckMap.set(d.id, d.name)
          if (d.owner_id === profile!.id) {
            ownDeckIds.push(d.id)
          }
        }

        const allDeckIds = Array.from(deckMap.keys())

        // Get notes from all accessible decks (first 50)
        let allNotes: Array<{
          id: string
          deck_id: string
          field_values: Record<string, string>
          note_type_id: string
          generated_content: unknown
          tags: string[]
          created_at: string | Date
        }> = []

        if (allDeckIds.length > 0) {
          const notes = await db.notes
            .where('deck_id')
            .anyOf(allDeckIds)
            .toArray()

          // Sort by created_at descending
          notes.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
            return dateB - dateA
          })

          allNotes = notes
        }

        const initialTotal = allNotes.length
        const pagedNotes = allNotes.slice(0, 50)

        // Get cards for paged notes
        const noteIds = pagedNotes.map(n => n.id)
        const cardsMap: Record<string, Array<{ id: string }>> = {}
        if (noteIds.length > 0) {
          const cards = await db.cards
            .where('note_id')
            .anyOf(noteIds)
            .toArray()
          for (const card of cards) {
            if (!cardsMap[card.note_id]) cardsMap[card.note_id] = []
            cardsMap[card.note_id].push({ id: card.id })
          }
        }

        const initialNotes: BrowsableNote[] = pagedNotes.map(n => ({
          id: n.id,
          deck_id: n.deck_id,
          field_values: n.field_values,
          note_type_id: n.note_type_id,
          generated_content: (n.generated_content as BrowsableNote['generated_content']) || null,
          tags: n.tags || [],
          created_at: typeof n.created_at === 'string' ? n.created_at : new Date(n.created_at || Date.now()).toISOString(),
          cards: cardsMap[n.id] || [],
        }))

        // Also add note types referenced by notes that we don't have yet
        const noteTypeIdsInNotes = new Set(allNotes.map(n => n.note_type_id))
        const existingNoteTypeIds = new Set(noteTypes.map(nt => nt.id))
        const missingNoteTypeIds = Array.from(noteTypeIdsInNotes).filter(id => !existingNoteTypeIds.has(id))
        if (missingNoteTypeIds.length > 0) {
          const extraNoteTypes = await db.noteTypes
            .where('id')
            .anyOf(missingNoteTypeIds)
            .toArray()
          noteTypes.push(...(extraNoteTypes as NoteType[]))
        }

        const deckNameEntries = Array.from(deckMap.entries()) as [string, string][]

        if (!cancelled) {
          setNotesData({
            initialNotes,
            initialTotal,
            noteTypes,
            deckNameEntries,
            ownDeckIds,
          })
          setIsLoading(false)
        }
      } catch (error) {
        console.error('Failed to load notes data from Dexie:', error)
        if (!cancelled) {
          setNotesData({
            initialNotes: [],
            initialTotal: 0,
            noteTypes: [],
            deckNameEntries: [],
            ownDeckIds: [],
          })
          setIsLoading(false)
        }
      }
    }

    loadNotesData()
    return () => { cancelled = true }
  }, [profile, authLoading])

  if (authLoading || isLoading) {
    return (
      <AppLayout>
        <NotesSkeleton />
      </AppLayout>
    )
  }

  if (!profile) return null

  return (
    <AppLayout>
      <NotesPageClient
        initialNotes={notesData?.initialNotes}
        initialTotal={notesData?.initialTotal}
        noteTypes={notesData?.noteTypes}
        deckNameEntries={notesData?.deckNameEntries}
        ownDeckIds={notesData?.ownDeckIds}
        userProfile={{ id: profile.id, name: profile.name, role: profile.role }}
      />
    </AppLayout>
  )
}
