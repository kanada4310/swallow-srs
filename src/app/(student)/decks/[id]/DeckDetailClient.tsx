'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NoteEditor } from '@/components/deck/NoteEditor'
import type { NoteType } from '@/types/database'

interface Note {
  id: string
  field_values: Record<string, string>
  note_type_id: string
  created_at: string
  cards: Array<{ id: string }>
}

interface DeckDetailClientProps {
  deckId: string
  notes: Note[]
  noteTypes: NoteType[]
  canEdit: boolean
}

export function DeckDetailClient({ deckId, notes, noteTypes, canEdit }: DeckDetailClientProps) {
  const router = useRouter()
  const [isAddingNote, setIsAddingNote] = useState(false)

  const handleNoteAdded = () => {
    setIsAddingNote(false)
    router.refresh() // Refresh to show new note
  }

  // Note type name lookup
  const noteTypeNames: Record<string, string> = {}
  for (const nt of noteTypes) {
    noteTypeNames[nt.id] = nt.name
  }

  return (
    <div>
      {/* Add Note Section */}
      {canEdit && (
        <div className="mb-6">
          {isAddingNote ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">ノートを追加</h2>
              <NoteEditor
                deckId={deckId}
                noteTypes={noteTypes}
                onNoteAdded={handleNoteAdded}
                onCancel={() => setIsAddingNote(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setIsAddingNote(true)}
              className="w-full py-3 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              ノートを追加
            </button>
          )}
        </div>
      )}

      {/* Notes List */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          ノート一覧
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({notes.length}件)
          </span>
        </h2>

        {notes.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500">
              {canEdit
                ? 'ノートがありません。上のボタンから追加してください。'
                : 'まだノートがありません。'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                noteTypeName={noteTypeNames[note.note_type_id] || 'Unknown'}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NoteCard({ note, noteTypeName }: { note: Note; noteTypeName: string }) {
  // Get first two fields for display
  const fieldEntries = Object.entries(note.field_values).slice(0, 2)
  const cardCount = note.cards?.length || 0

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {fieldEntries.map(([key, value], idx) => (
            <div key={key} className={idx === 0 ? 'font-medium text-gray-900 truncate' : 'text-sm text-gray-500 truncate mt-1'}>
              {truncateText(value, 100)}
            </div>
          ))}
        </div>
        <div className="ml-4 flex-shrink-0 text-right">
          <span className="text-xs text-gray-400 block">{noteTypeName}</span>
          <span className="text-xs text-gray-500">{cardCount}枚</span>
        </div>
      </div>
    </div>
  )
}

function truncateText(text: string, maxLength: number): string {
  // Remove HTML tags and cloze markers for display
  const cleanText = text
    .replace(/<[^>]*>/g, '')
    .replace(/\{\{c\d+::(.*?)(?:::[^}]*)?\}\}/g, '[$1]')

  if (cleanText.length <= maxLength) return cleanText
  return cleanText.slice(0, maxLength) + '...'
}
