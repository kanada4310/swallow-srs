'use client'

import type { NoteType, GeneratedContent } from '@/types/database'

export interface BrowsableNote {
  id: string
  field_values: Record<string, string>
  note_type_id: string
  generated_content: GeneratedContent | null
  created_at: string
  cards: Array<{ id: string }>
}

interface NoteCardProps {
  note: BrowsableNote
  noteType: NoteType | undefined
  canEdit: boolean
  isSelectMode: boolean
  isSelected: boolean
  onToggleSelect: () => void
  onEdit: () => void
  onDelete: () => void
  isDeleting: boolean
}

export function NoteCard({
  note,
  noteType,
  canEdit,
  isSelectMode,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
  isDeleting,
}: NoteCardProps) {
  const fieldEntries = Object.entries(note.field_values)
  const displayEntries = fieldEntries.slice(0, 2)
  const cardCount = note.cards?.length || 0
  const hasGeneratedContent = note.generated_content && note.generated_content.examples && note.generated_content.examples.length > 0
  const noteTypeName = noteType?.name || 'Unknown'

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border p-4 transition-colors ${
        isSelectMode && isSelected
          ? 'border-blue-400 bg-blue-50'
          : 'border-gray-200'
      } ${isSelectMode ? 'cursor-pointer' : ''}`}
      onClick={isSelectMode ? onToggleSelect : undefined}
    >
      <div className="flex items-start justify-between">
        {isSelectMode && (
          <div className="mr-3 flex-shrink-0 pt-0.5">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              onClick={e => e.stopPropagation()}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {displayEntries.map(([key, value], idx) => (
            <div key={key} className={idx === 0 ? 'font-medium text-gray-900 truncate' : 'text-sm text-gray-500 truncate mt-1'}>
              {truncateText(value, 100)}
            </div>
          ))}
        </div>
        <div className="ml-4 flex-shrink-0 text-right flex items-start gap-2">
          <div>
            <span className="text-xs text-gray-400 block">{noteTypeName}</span>
            <div className="flex items-center gap-2 mt-1">
              {hasGeneratedContent && (
                <span className="text-xs text-purple-600 flex items-center gap-0.5" title="例文生成済み">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </span>
              )}
              <span className="text-xs text-gray-500">{cardCount}枚</span>
            </div>
          </div>
          {!isSelectMode && canEdit && (
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
                className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                title="ノートを編集"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm('このノートを削除しますか？関連するカード・学習記録も削除されます。')) {
                    onDelete()
                  }
                }}
                disabled={isDeleting}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                title="ノートを削除"
              >
                {isDeleting ? (
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-300 border-t-red-600" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function truncateText(text: string, maxLength: number): string {
  const cleanText = text
    .replace(/<[^>]*>/g, '')
    .replace(/\{\{c\d+::(.*?)(?:::[^}]*)?\}\}/g, '[$1]')

  if (cleanText.length <= maxLength) return cleanText
  return cleanText.slice(0, maxLength) + '...'
}
