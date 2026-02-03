'use client'

import { useState } from 'react'
import type { FieldDefinition } from '@/types/database'

// Note type IDs for special handling
const BASIC_NOTE_TYPE_ID = '00000000-0000-0000-0000-000000000001'
const CLOZE_NOTE_TYPE_ID = '00000000-0000-0000-0000-000000000002'

interface NoteType {
  id: string
  name: string
  fields: FieldDefinition[]
}

interface NoteEditorProps {
  deckId: string
  noteTypes: NoteType[]
  onNoteAdded: () => void
  onCancel: () => void
}

export function NoteEditor({ deckId, noteTypes, onNoteAdded, onCancel }: NoteEditorProps) {
  const [selectedNoteType, setSelectedNoteType] = useState<NoteType>(
    noteTypes.find(nt => nt.id === BASIC_NOTE_TYPE_ID) || noteTypes[0]
  )
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleNoteTypeChange = (noteTypeId: string) => {
    const noteType = noteTypes.find(nt => nt.id === noteTypeId)
    if (noteType) {
      setSelectedNoteType(noteType)
      setFieldValues({}) // Reset field values when changing note type
    }
  }

  const handleFieldChange = (fieldName: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [fieldName]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    // Validate that required fields are filled
    const hasEmptyFields = selectedNoteType.fields.some(
      field => {
        const isRequired = field.settings?.required !== false
        return isRequired && !fieldValues[field.name]?.trim()
      }
    )
    if (hasEmptyFields) {
      setError('全てのフィールドを入力してください')
      setIsSubmitting(false)
      return
    }

    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId,
          noteTypeId: selectedNoteType.id,
          fieldValues,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add note')
      }

      // Clear form and notify parent
      setFieldValues({})
      onNoteAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isCloze = selectedNoteType.id === CLOZE_NOTE_TYPE_ID

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Note Type Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          ノートタイプ
        </label>
        <select
          value={selectedNoteType.id}
          onChange={(e) => handleNoteTypeChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          {noteTypes.map(nt => (
            <option key={nt.id} value={nt.id}>{nt.name}</option>
          ))}
        </select>
      </div>

      {/* Cloze Help */}
      {isCloze && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <p className="font-medium mb-1">穴埋め記法:</p>
          <p className="font-mono">{'{{c1::答え}}'} または {'{{c1::答え::ヒント}}'}</p>
          <p className="mt-1 text-blue-600">例: The {'{{c1::capital::首都}}'} of Japan is Tokyo.</p>
        </div>
      )}

      {/* Fields */}
      {selectedNoteType.fields.map((field) => {
        const isRequired = field.settings?.required !== false
        const placeholder = field.settings?.placeholder || getPlaceholder(selectedNoteType.id, field.name)
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
              placeholder={placeholder}
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
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isSubmitting ? '追加中...' : 'ノートを追加'}
        </button>
      </div>
    </form>
  )
}

function getPlaceholder(noteTypeId: string, fieldName: string): string {
  if (noteTypeId === BASIC_NOTE_TYPE_ID) {
    if (fieldName === 'Front') return '例: apple'
    if (fieldName === 'Back') return '例: りんご'
  } else if (noteTypeId === CLOZE_NOTE_TYPE_ID) {
    if (fieldName === 'Text') return '例: The {{c1::capital}} of Japan is {{c2::Tokyo}}.'
    if (fieldName === 'Extra') return '補足情報（オプション）'
  }
  return ''
}
