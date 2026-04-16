'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { DeckSettings } from '@/types/database'
import { DeckAdvancedSettings } from './DeckAdvancedSettings'
import { db } from '@/lib/db/schema'

interface ParentDeckOption {
  id: string
  name: string
}

interface DeckFormProps {
  mode: 'create' | 'edit'
  initialData?: {
    id: string
    name: string
    newCardsPerDay: number
    settings?: Partial<DeckSettings>
    filterTags?: string[]
  }
  parentDecks?: ParentDeckOption[]
  defaultParentId?: string
}

export function DeckForm({ mode, initialData, parentDecks, defaultParentId }: DeckFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initialData?.name || '')
  const [parentDeckId, setParentDeckId] = useState(defaultParentId || '')
  const [filterTags, setFilterTags] = useState<string[]>(initialData?.filterTags || [])
  const [filterTagInput, setFilterTagInput] = useState('')
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize settings from initialData or with legacy newCardsPerDay
  const [advancedSettings, setAdvancedSettings] = useState<Partial<DeckSettings>>(() => {
    if (initialData?.settings) return initialData.settings
    if (initialData?.newCardsPerDay !== undefined) {
      return { new_cards_per_day: initialData.newCardsPerDay }
    }
    return {}
  })

  // Load available tags from parent deck's notes
  useEffect(() => {
    if (!parentDeckId) {
      setAvailableTags([])
      return
    }
    const loadTags = async () => {
      try {
        const { getDescendantDeckIds } = await import('@/lib/db/schema')
        const descendantIds = await getDescendantDeckIds(parentDeckId)
        const allDeckIds = [parentDeckId, ...descendantIds]
        const notes = await db.notes.where('deck_id').anyOf(allDeckIds).toArray()
        const tagSet = new Set<string>()
        for (const note of notes) {
          if (note.tags) {
            for (const tag of note.tags) {
              tagSet.add(tag)
            }
          }
        }
        setAvailableTags(Array.from(tagSet).sort())
      } catch {
        // Non-critical
      }
    }
    loadTags()
  }, [parentDeckId])

  const addFilterTag = useCallback((tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !filterTags.includes(trimmed)) {
      setFilterTags(prev => [...prev, trimmed])
    }
    setFilterTagInput('')
  }, [filterTags])

  const removeFilterTag = useCallback((tag: string) => {
    setFilterTags(prev => prev.filter(t => t !== tag))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          settings: advancedSettings,
          parentDeckId: parentDeckId || undefined,
          filterTags: parentDeckId && filterTags.length > 0 ? filterTags : undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create deck')
      }

      // Save to Dexie so deck detail page can find it immediately
      try {
        const deck = data.deck
        await db.decks.put({
          id: deck.id,
          name: deck.name,
          owner_id: deck.owner_id,
          is_distributed: deck.is_distributed || false,
          parent_deck_id: deck.parent_deck_id || null,
          filter_tags: deck.filter_tags || [],
          settings: deck.settings || {},
          created_at: deck.created_at,
          updated_at: deck.updated_at,
        })
      } catch {
        // Non-critical: deck will sync later via background sync
      }

      // Redirect to deck detail page to add notes
      router.push(`/decks/${data.deck.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
          デッキ名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 英単語ターゲット1900"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
          required
          autoFocus
        />
      </div>

      {/* Parent Deck Selector */}
      {parentDecks && parentDecks.length > 0 && (
        <div>
          <label htmlFor="parentDeckId" className="block text-sm font-medium text-gray-700 mb-2">
            親デッキ
          </label>
          <select
            id="parentDeckId"
            value={parentDeckId}
            onChange={(e) => setParentDeckId(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
          >
            <option value="">なし（トップレベル）</option>
            {parentDecks.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <p className="mt-1 text-sm text-gray-500">
            サブデッキとして作成する場合は親デッキを選択（最大3段）
          </p>
        </div>
      )}

      {/* Filter Tags (only for subdecks) */}
      {parentDeckId && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            フィルタータグ
          </label>
          <p className="text-sm text-gray-500 mb-3">
            新規カードをタグで絞り込みます。空の場合はすべての新規カードが対象です。復習カードはフィルタに関係なく表示されます。
          </p>

          {/* Current filter tags */}
          {filterTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {filterTags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-sm"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeFilterTag(tag)}
                    className="text-purple-500 hover:text-purple-800"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Tag input */}
          <div className="relative">
            <input
              type="text"
              value={filterTagInput}
              onChange={(e) => setFilterTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addFilterTag(filterTagInput)
                }
              }}
              placeholder="タグを入力してEnter"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-colors text-sm"
            />
          </div>

          {/* Available tags from parent deck */}
          {availableTags.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-400 mb-1">利用可能なタグ:</p>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {availableTags
                  .filter(t => !filterTags.includes(t))
                  .filter(t => !filterTagInput || t.toLowerCase().includes(filterTagInput.toLowerCase()))
                  .map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addFilterTag(tag)}
                      className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs hover:bg-purple-100 hover:text-purple-700 transition-colors"
                    >
                      + {tag}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced Settings */}
      <DeckAdvancedSettings
        settings={advancedSettings}
        onChange={setAdvancedSettings}
      />

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isSubmitting ? '作成中...' : mode === 'create' ? 'デッキを作成' : '保存'}
        </button>
      </div>
    </form>
  )
}
