'use client'

import { useState } from 'react'
import type { NoteType, FieldDefinition } from '@/types/database'
import { CLOZE_NOTE_TYPE_ID } from '@/lib/constants'
import type { BrowsableNote } from './NoteCard'

interface NoteEditModalProps {
  note: BrowsableNote
  noteType: NoteType
  onSave: (updatedNote: BrowsableNote) => void
  onClose: () => void
}

export function NoteEditModal({ note, noteType, onSave, onClose }: NoteEditModalProps) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({ ...note.field_values })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clozeWarning, setClozeWarning] = useState<string | null>(null)

  const isCloze = note.note_type_id === CLOZE_NOTE_TYPE_ID

  const handleFieldChange = (fieldName: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [fieldName]: value }))

    // Check cloze card count changes
    if (isCloze && fieldName === 'Text') {
      const oldText = note.field_values['Text'] || ''
      const oldNums = countClozeNumbers(oldText)
      const newNums = countClozeNumbers(value)

      const removed = oldNums.filter(n => !newNums.includes(n))
      if (removed.length > 0) {
        setClozeWarning(`Cloze番号 ${removed.join(', ')} のカードが削除されます。関連する学習記録も失われます。`)
      } else {
        setClozeWarning(null)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    // Validate required fields
    const hasEmptyRequired = (noteType.fields as FieldDefinition[]).some(field => {
      const isRequired = field.settings?.required !== false
      return isRequired && !fieldValues[field.name]?.trim()
    })
    if (hasEmptyRequired) {
      setError('必須フィールドをすべて入力してください')
      setIsSubmitting(false)
      return
    }

    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_values: fieldValues }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '保存に失敗しました')
      }

      // Update IndexedDB in background
      import('@/lib/db/schema').then(({ updateNoteLocally }) => {
        updateNoteLocally(note.id, fieldValues).catch(console.error)
      })

      onSave({
        ...note,
        field_values: fieldValues,
        cards: data.note?.cards || note.cards,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">ノートを編集</h2>
              <p className="text-sm text-gray-500 mt-1">{noteType.name}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {clozeWarning && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
              {clozeWarning}
            </div>
          )}

          {/* Cloze Help */}
          {isCloze && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <p className="font-medium mb-1">穴埋め記法:</p>
              <p className="font-mono">{'{{c1::答え}}'} または {'{{c1::答え::ヒント}}'}</p>
            </div>
          )}

          {/* Fields */}
          {(noteType.fields as FieldDefinition[]).map((field) => {
            const isRequired = field.settings?.required !== false
            const isLargeField = field.name === 'Text' || field.name === 'Extra' || field.name.toLowerCase().includes('text')

            return (
              <div key={field.name}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {field.name}
                  {isRequired && <span className="text-red-500 ml-1">*</span>}
                </label>
                <textarea
                  value={fieldValues[field.name] || ''}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  rows={isLargeField ? 4 : 2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                />
              </div>
            )
          })}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function countClozeNumbers(text: string): number[] {
  const regex = /\{\{c(\d+)::/g
  const numbers = new Set<number>()
  let match
  while ((match = regex.exec(text)) !== null) {
    numbers.add(parseInt(match[1], 10))
  }
  return Array.from(numbers).sort((a, b) => a - b)
}
