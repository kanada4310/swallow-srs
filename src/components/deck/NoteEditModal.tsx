'use client'

import { useState } from 'react'
import type { NoteType, FieldDefinition, GenerationRule } from '@/types/database'
import { CLOZE_NOTE_TYPE_ID } from '@/lib/constants'
import { ImageUploadButton } from '@/components/ui/ImageUploadButton'
import type { BrowsableNote } from './NoteCard'

interface NoteEditModalProps {
  note: BrowsableNote
  noteType: NoteType
  deckTags?: string[]
  onSave: (updatedNote: BrowsableNote) => void
  onClose: () => void
}

export function NoteEditModal({ note, noteType, deckTags, onSave, onClose }: NoteEditModalProps) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({ ...note.field_values })
  const [tags, setTags] = useState<string[]>(note.tags || [])
  const [tagInput, setTagInput] = useState('')
  const [showTagSuggestions, setShowTagSuggestions] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clozeWarning, setClozeWarning] = useState<string | null>(null)
  const [showAiSection, setShowAiSection] = useState(false)
  const [generatingRuleId, setGeneratingRuleId] = useState<string | null>(null)
  const [generatingAll, setGeneratingAll] = useState(false)
  const [generatedRuleIds, setGeneratedRuleIds] = useState<Set<string>>(new Set())
  const [genError, setGenError] = useState<string | null>(null)

  // Tag autocomplete suggestions
  const tagSuggestions = (deckTags || []).filter(
    t => !tags.includes(t) && t.toLowerCase().includes(tagInput.toLowerCase())
  )

  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags(prev => [...prev, trimmed])
    }
    setTagInput('')
    setShowTagSuggestions(false)
  }

  const handleRemoveTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag))
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (tagInput.trim()) {
        handleAddTag(tagInput)
      }
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(prev => prev.slice(0, -1))
    }
  }

  const isCloze = note.note_type_id === CLOZE_NOTE_TYPE_ID
  const generationRules: GenerationRule[] = noteType.generation_rules || []

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

  const handleGenerateRule = async (rule: GenerationRule) => {
    setGeneratingRuleId(rule.id)
    setGenError(null)

    try {
      const response = await fetch('/api/generate-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId: note.id,
          ruleId: rule.id,
          regenerate: true,
          fieldValuesOverride: fieldValues,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '生成に失敗しました')
      }

      if (data.content && data.target_field) {
        setFieldValues(prev => ({ ...prev, [data.target_field]: data.content }))
        setGeneratedRuleIds(prev => {
          const next = new Set(prev)
          next.add(rule.id)
          return next
        })
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : '生成に失敗しました')
    } finally {
      setGeneratingRuleId(null)
    }
  }

  const handleGenerateAll = async () => {
    setGeneratingAll(true)
    setGenError(null)

    let currentValues = { ...fieldValues }

    for (const rule of generationRules) {
      if (!rule.target_field || !rule.instruction.trim()) continue

      setGeneratingRuleId(rule.id)
      try {
        const response = await fetch('/api/generate-examples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            noteId: note.id,
            ruleId: rule.id,
            regenerate: true,
            fieldValuesOverride: currentValues,
          }),
        })

        const data = await response.json()

        if (response.ok && data.content && data.target_field) {
          currentValues = { ...currentValues, [data.target_field]: data.content }
          setFieldValues(currentValues)
          setGeneratedRuleIds(prev => {
            const next = new Set(prev)
            next.add(rule.id)
            return next
          })
        }
      } catch {
        // Continue with remaining rules
      }
    }

    setGeneratingRuleId(null)
    setGeneratingAll(false)
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
        body: JSON.stringify({ field_values: fieldValues, tags }),
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
        tags,
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
      <div className="bg-white rounded-card shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-ai">ノートを編集</h2>
              <p className="text-sm text-ink-3 mt-1">{noteType.name}</p>
            </div>
            <button
              onClick={onClose}
              className="text-ink-3 hover:text-ink-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 bg-again-bg border border-again/20 rounded-xl text-again text-sm">
              {error}
            </div>
          )}

          {clozeWarning && (
            <div className="p-3 bg-hard-bg border border-hard/20 rounded-xl text-hard text-sm">
              {clozeWarning}
            </div>
          )}

          {/* Cloze Help */}
          {isCloze && (
            <div className="p-3 bg-sora-soft border border-sora/20 rounded-xl text-sm text-sora">
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
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-ink-2">
                    {field.name}
                    {isRequired && <span className="text-again ml-1">*</span>}
                  </label>
                  <ImageUploadButton
                    label="画像"
                    onUploaded={(url) =>
                      handleFieldChange(
                        field.name,
                        `${fieldValues[field.name] || ''}<img src="${url}">`.trim()
                      )
                    }
                  />
                </div>
                <textarea
                  value={fieldValues[field.name] || ''}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  rows={isLargeField ? 4 : 2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sora focus:border-sora outline-none resize-none"
                />
              </div>
            )
          })}

          {/* Tags Section */}
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-2">
              タグ
            </label>
            <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 border border-gray-300 rounded-xl focus-within:ring-2 focus-within:ring-sora focus-within:border-sora">
              {tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sora-soft text-sora text-xs font-bold">
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="text-sora/60 hover:text-sora"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              <div className="relative flex-1 min-w-[80px]">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value)
                    setShowTagSuggestions(true)
                  }}
                  onKeyDown={handleTagKeyDown}
                  onFocus={() => setShowTagSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
                  placeholder={tags.length === 0 ? 'タグを追加...' : ''}
                  className="w-full outline-none text-sm py-0.5"
                />
                {showTagSuggestions && tagSuggestions.length > 0 && (
                  <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-32 overflow-y-auto">
                    {tagSuggestions.slice(0, 8).map(suggestion => (
                      <button
                        key={suggestion}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleAddTag(suggestion)}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-sora-soft text-ink-2"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-ink-3">Enterで追加、Backspaceで削除</p>
          </div>

          {/* AI Generation Section */}
          {generationRules.length > 0 && (
            <div className="border border-sora/30 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAiSection(!showAiSection)}
                className="w-full flex items-center justify-between p-3 bg-sora-soft text-left hover:bg-sora/15 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-sora" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="text-sm font-bold text-sora">AI生成</span>
                  <span className="text-xs text-sora/60">({generationRules.length}ルール)</span>
                </div>
                <svg
                  className={`w-4 h-4 text-sora/60 transition-transform ${showAiSection ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showAiSection && (
                <div className="p-3 space-y-2 border-t border-sora/20">
                  {genError && (
                    <div className="p-2 bg-again-bg border border-again/20 rounded-xl text-again text-xs">
                      {genError}
                    </div>
                  )}

                  {generationRules.map(rule => {
                    const isGenerating = generatingRuleId === rule.id
                    const isGenerated = generatedRuleIds.has(rule.id)
                    const hasExistingValue = !!fieldValues[rule.target_field]?.trim()

                    return (
                      <div key={rule.id} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm text-ink-2 truncate">{rule.name}</span>
                          {rule.target_field && (
                            <span className="text-xs text-ink-3 flex-shrink-0">
                              → {rule.target_field}
                            </span>
                          )}
                          {(isGenerated || hasExistingValue) && !isGenerating && (
                            <svg className="w-3.5 h-3.5 text-good flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleGenerateRule(rule)}
                          disabled={isGenerating || generatingAll}
                          className="px-3 py-1 text-xs font-bold text-sora border border-sora/30 rounded-2xl hover:bg-sora-soft disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                        >
                          {isGenerating ? (
                            <span className="flex items-center gap-1">
                              <div className="w-3 h-3 animate-spin rounded-full border-2 border-sora-soft border-t-sora" />
                              生成中
                            </span>
                          ) : hasExistingValue ? '再生成' : '生成'}
                        </button>
                      </div>
                    )
                  })}

                  {generationRules.length > 1 && (
                    <div className="pt-2 border-t border-sora/20">
                      <button
                        type="button"
                        onClick={handleGenerateAll}
                        disabled={generatingAll || generatingRuleId !== null}
                        className="w-full px-3 py-1.5 text-xs font-bold text-white bg-sora rounded-2xl hover:bg-sora-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {generatingAll ? (
                          <span className="flex items-center justify-center gap-1">
                            <div className="w-3 h-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            すべて生成中...
                          </span>
                        ) : 'すべて生成'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-ink-2 rounded-2xl hover:bg-gray-50 transition-colors font-bold"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-sora text-white rounded-2xl hover:bg-sora-dark disabled:bg-sora/50 disabled:cursor-not-allowed transition-colors font-bold"
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
