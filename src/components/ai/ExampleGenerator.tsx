'use client'

import { useState } from 'react'
import type { GenerationRule } from '@/types/database'

interface GeneratedContent {
  examples: string[]
  collocations?: string[]
}

interface ExampleGeneratorProps {
  noteId: string
  word: string
  meaning?: string
  existingContent?: GeneratedContent | null
  onGenerated?: (content: GeneratedContent) => void
  compact?: boolean
}

export function ExampleGenerator({
  noteId,
  word,
  meaning,
  existingContent,
  onGenerated,
  compact = false,
}: ExampleGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState<GeneratedContent | null>(existingContent || null)

  const handleGenerate = async (regenerate: boolean = false) => {
    if (!word.trim()) {
      setError('単語を入力してください')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/generate-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId,
          word: word.trim(),
          meaning: meaning?.trim(),
          includeCollocations: true,
          regenerate,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate examples')
      }

      const newContent: GeneratedContent = {
        examples: data.content.examples,
        collocations: data.content.collocations,
      }

      setContent(newContent)
      onGenerated?.(newContent)
    } catch (err) {
      setError(err instanceof Error ? err.message : '例文の生成に失敗しました')
    } finally {
      setIsGenerating(false)
    }
  }

  if (compact && !content) {
    return (
      <button
        type="button"
        onClick={() => handleGenerate(false)}
        disabled={isGenerating || !word.trim()}
        className="text-sm text-purple-600 hover:text-purple-700 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center gap-1"
      >
        {isGenerating ? (
          <>
            <span className="animate-spin inline-block w-3 h-3 border border-purple-600 border-t-transparent rounded-full"></span>
            生成中...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            例文を生成
          </>
        )}
      </button>
    )
  }

  return (
    <div className="mt-4">
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {!content ? (
        <button
          type="button"
          onClick={() => handleGenerate(false)}
          disabled={isGenerating || !word.trim()}
          className="w-full py-2 px-4 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full"></span>
              例文を生成中...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              AIで例文を生成
            </>
          )}
        </button>
      ) : (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-purple-800 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              AI生成コンテンツ
            </h4>
            <button
              type="button"
              onClick={() => handleGenerate(true)}
              disabled={isGenerating}
              className="text-xs text-purple-600 hover:text-purple-700 disabled:text-gray-400 flex items-center gap-1"
            >
              {isGenerating ? (
                <>
                  <span className="animate-spin inline-block w-3 h-3 border border-purple-600 border-t-transparent rounded-full"></span>
                  再生成中...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  再生成
                </>
              )}
            </button>
          </div>

          {/* Examples */}
          <div className="mb-3">
            <p className="text-xs font-medium text-purple-700 mb-1">例文:</p>
            <ul className="space-y-1">
              {content.examples.map((example, idx) => (
                <li key={idx} className="text-sm text-gray-700 pl-3 border-l-2 border-purple-300">
                  {example}
                </li>
              ))}
            </ul>
          </div>

          {/* Collocations */}
          {content.collocations && content.collocations.length > 0 && (
            <div>
              <p className="text-xs font-medium text-purple-700 mb-1">コロケーション:</p>
              <div className="flex flex-wrap gap-1">
                {content.collocations.map((collocation, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded"
                  >
                    {collocation}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Bulk generation component for deck detail page
interface NoteForBulk {
  id: string
  field_values: Record<string, string>
  note_type_id: string
  generated_content?: { examples: string[] } | null
}

interface NoteTypeForBulk {
  id: string
  name: string
  fields: Array<{ name: string; ord: number; settings?: { example_source?: boolean; example_context?: boolean } }>
  generation_rules?: GenerationRule[]
}

interface BulkExampleGeneratorProps {
  deckId: string
  notes: NoteForBulk[]
  noteTypes: NoteTypeForBulk[]
  onComplete: () => void
  onClose: () => void
}

export function BulkExampleGenerator({
  notes,
  noteTypes,
  onComplete,
  onClose,
}: BulkExampleGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [regenerateExisting, setRegenerateExisting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set())

  // Collect all generation rules from all note types used in this deck
  const noteTypeMap = new Map(noteTypes.map(nt => [nt.id, nt]))
  const usedNoteTypeIds = Array.from(new Set(notes.map(n => n.note_type_id)))

  // Build a list of available rules grouped by note type
  const rulesByNoteType: Array<{
    noteTypeId: string
    noteTypeName: string
    rules: GenerationRule[]
    noteCount: number
  }> = []

  for (const ntId of usedNoteTypeIds) {
    const nt = noteTypeMap.get(ntId)
    if (nt?.generation_rules && nt.generation_rules.length > 0) {
      rulesByNoteType.push({
        noteTypeId: ntId,
        noteTypeName: nt.name,
        rules: nt.generation_rules,
        noteCount: notes.filter(n => n.note_type_id === ntId).length,
      })
    }
  }

  const hasRules = rulesByNoteType.length > 0

  // For legacy mode: check notes with source fields
  const hasLegacyNotes = !hasRules && notes.some(n => {
    const nt = noteTypeMap.get(n.note_type_id)
    if (!nt) return false
    const sourceField = nt.fields.find(f => f.settings?.example_source)
    const fallbackField = n.field_values['Front'] || n.field_values['Text']
    return sourceField ? !!n.field_values[sourceField.name] : !!fallbackField
  })

  // Toggle rule selection
  const toggleRule = (ruleId: string) => {
    setSelectedRuleIds(prev => {
      const next = new Set(prev)
      if (next.has(ruleId)) {
        next.delete(ruleId)
      } else {
        next.add(ruleId)
      }
      return next
    })
  }

  // Select all rules
  const selectAllRules = () => {
    const allIds = rulesByNoteType.flatMap(g => g.rules.map(r => r.id))
    setSelectedRuleIds(new Set(allIds))
  }

  // Get legacy target notes
  const getLegacyTargetNotes = () => {
    return notes.filter(n => {
      const nt = noteTypeMap.get(n.note_type_id)
      if (!nt) return false
      const sourceField = nt.fields.find(f => f.settings?.example_source)
      const hasSource = sourceField ? !!n.field_values[sourceField.name] : (!!n.field_values['Front'] || !!n.field_values['Text'])
      if (!hasSource) return false
      if (!regenerateExisting && n.generated_content) return false
      return true
    })
  }

  // Get rule-based target note count
  const getRuleTargetCount = () => {
    const noteIds: string[] = []
    const ruleIds = Array.from(selectedRuleIds)
    for (const ruleId of ruleIds) {
      for (const group of rulesByNoteType) {
        const rule = group.rules.find(r => r.id === ruleId)
        if (!rule) continue
        const groupNotes = notes.filter(n => n.note_type_id === group.noteTypeId)
        for (const note of groupNotes) {
          if (!regenerateExisting && note.field_values[rule.target_field]) continue
          if (!noteIds.includes(note.id)) noteIds.push(note.id)
        }
      }
    }
    return noteIds.length
  }

  const targetCount = hasRules ? getRuleTargetCount() : getLegacyTargetNotes().length

  // Calculate total API calls needed
  const getTotalApiCalls = () => {
    if (!hasRules) return targetCount
    let total = 0
    const ruleIds = Array.from(selectedRuleIds)
    for (const ruleId of ruleIds) {
      for (const group of rulesByNoteType) {
        const rule = group.rules.find(r => r.id === ruleId)
        if (!rule) continue
        const groupNotes = notes.filter(n => n.note_type_id === group.noteTypeId)
        for (const note of groupNotes) {
          if (!regenerateExisting && note.field_values[rule.target_field]) continue
          total++
        }
      }
    }
    return total
  }

  const totalApiCalls = getTotalApiCalls()

  const handleBulkGenerate = async () => {
    if (hasRules && selectedRuleIds.size === 0) return
    if (totalApiCalls === 0) return

    setIsGenerating(true)
    setError(null)
    setProgress({ current: 0, total: totalApiCalls })

    let successCount = 0
    let failCount = 0

    if (hasRules) {
      // Rule-based generation
      const ruleIds = Array.from(selectedRuleIds)
      for (const ruleId of ruleIds) {
        for (const group of rulesByNoteType) {
          const rule = group.rules.find(r => r.id === ruleId)
          if (!rule) continue

          const groupNotes = notes.filter(n => n.note_type_id === group.noteTypeId)
          for (const note of groupNotes) {
            if (!regenerateExisting && note.field_values[rule.target_field]) continue

            try {
              const response = await fetch('/api/generate-examples', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  noteId: note.id,
                  ruleId: rule.id,
                  regenerate: regenerateExisting,
                }),
              })

              if (response.ok) {
                successCount++
              } else {
                failCount++
              }
            } catch {
              failCount++
            }

            setProgress(prev => ({ ...prev, current: prev.current + 1 }))
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }
      }
    } else {
      // Legacy mode
      const targetNotes = getLegacyTargetNotes()

      for (const note of targetNotes) {
        const nt = noteTypeMap.get(note.note_type_id)
        const sourceField = nt?.fields.find(f => f.settings?.example_source)
        const contextField = nt?.fields.find(f => f.settings?.example_context)

        const word = sourceField
          ? note.field_values[sourceField.name]
          : (note.field_values['Front'] || note.field_values['Text'] || '')
        const meaning = contextField
          ? note.field_values[contextField.name]
          : (note.field_values['Back'] || note.field_values['Extra'] || '')

        try {
          const response = await fetch('/api/generate-examples', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              noteId: note.id,
              word,
              meaning,
              includeCollocations: true,
              regenerate: regenerateExisting,
            }),
          })

          if (response.ok) {
            successCount++
          } else {
            failCount++
          }
        } catch {
          failCount++
        }

        setProgress(prev => ({ ...prev, current: prev.current + 1 }))
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    setIsGenerating(false)

    if (failCount > 0) {
      setError(`${failCount}件の生成に失敗しました`)
    }

    if (successCount > 0) {
      onComplete()
    }
  }

  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            AI一括生成
          </h2>
          {!isGenerating && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {!isGenerating ? (
          <>
            {hasRules ? (
              /* Rule-based UI */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    実行する生成ルールを選択してください
                  </p>
                  <button
                    type="button"
                    onClick={selectAllRules}
                    className="text-xs text-purple-600 hover:text-purple-700"
                  >
                    すべて選択
                  </button>
                </div>

                {rulesByNoteType.map((group) => (
                  <div key={group.noteTypeId} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2">
                      <span className="text-sm font-medium text-gray-700">{group.noteTypeName}</span>
                      <span className="text-xs text-gray-500 ml-2">({group.noteCount}件のノート)</span>
                    </div>
                    <div className="p-3 space-y-2">
                      {group.rules.map((rule) => {
                        const affectedNotes = notes.filter(n => {
                          if (n.note_type_id !== group.noteTypeId) return false
                          if (!regenerateExisting && n.field_values[rule.target_field]) return false
                          return true
                        })
                        return (
                          <label
                            key={rule.id}
                            className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedRuleIds.has(rule.id)}
                              onChange={() => toggleRule(rule.id)}
                              className="mt-0.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">{rule.name}</span>
                                <span className="text-xs text-gray-500">
                                  ({affectedNotes.length}件対象)
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {rule.source_fields.join(', ')} → {rule.target_field}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                                {rule.instruction}
                              </p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={regenerateExisting}
                    onChange={(e) => setRegenerateExisting(e.target.checked)}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  既に生成済みのフィールドも再生成する
                </label>

                <p className="text-sm text-gray-600">
                  合計: <span className="font-medium text-gray-900">{totalApiCalls}件</span>のAPI呼び出し
                </p>
              </div>
            ) : hasLegacyNotes ? (
              /* Legacy UI */
              <div className="mb-4">
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    このデッキのノートタイプにはAI生成ルールが設定されていません。
                    レガシーモード（例文＋コロケーション自動生成）で実行します。
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    ノートタイプ編集画面でAI生成ルールを設定すると、より柔軟な生成が可能になります。
                  </p>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  対象: <span className="font-medium text-gray-900">{targetCount}件</span>
                </p>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={regenerateExisting}
                    onChange={(e) => setRegenerateExisting(e.target.checked)}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  既に生成済みのものも再生成する
                </label>
              </div>
            ) : (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg text-center">
                <p className="text-sm text-gray-600">
                  生成可能なノートがありません。
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  ノートタイプ編集画面でAI生成ルールを設定してください。
                </p>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button
                onClick={onClose}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleBulkGenerate}
                disabled={hasRules ? selectedRuleIds.size === 0 || totalApiCalls === 0 : targetCount === 0}
                className="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                生成開始
              </button>
            </div>
          </>
        ) : (
          <div>
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>進捗</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-purple-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">{progressPercent}%</p>
            </div>

            <p className="text-sm text-gray-500 text-center">
              生成中です。このウィンドウを閉じないでください...
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
