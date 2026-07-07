'use client'

import { useState, useEffect } from 'react'

interface DeckItem {
  id: string
  name: string
  parent_deck_id: string | null
}

interface DeckSelectorModalProps {
  title: string
  description: string
  confirmLabel: string
  excludeDeckIds?: string[]
  onSelect: (deckId: string) => Promise<void>
  onClose: () => void
}

export function DeckSelectorModal({
  title,
  description,
  confirmLabel,
  excludeDeckIds = [],
  onSelect,
  onClose,
}: DeckSelectorModalProps) {
  const [decks, setDecks] = useState<DeckItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDecks = async () => {
      try {
        const response = await fetch('/api/decks')
        if (response.ok) {
          const data = await response.json()
          setDecks(data.decks || data || [])
        }
      } catch {
        // Silent
      } finally {
        setIsLoading(false)
      }
    }
    fetchDecks()
  }, [])

  const excludeSet = new Set(excludeDeckIds)
  const filteredDecks = decks
    .filter(d => !excludeSet.has(d.id))
    .filter(d => !filter.trim() || d.name.toLowerCase().includes(filter.toLowerCase()))

  const handleConfirm = async () => {
    if (!selectedDeckId) return
    setIsProcessing(true)
    setError(null)
    try {
      await onSelect(selectedDeckId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作に失敗しました')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-card shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-ai">{title}</h3>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="text-ink-3 hover:text-ink-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-ink-2 mt-1">{description}</p>
        </div>

        <div className="p-4 border-b border-gray-100">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="デッキ名で絞り込み..."
            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sora focus:border-sora outline-none text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: '300px' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sora" />
            </div>
          ) : filteredDecks.length === 0 ? (
            <div className="text-center py-8 text-sm text-ink-3">
              {filter ? '一致するデッキがありません' : '利用可能なデッキがありません'}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredDecks.map(deck => (
                <button
                  key={deck.id}
                  onClick={() => setSelectedDeckId(deck.id)}
                  disabled={isProcessing}
                  className={`w-full text-left px-3 py-2.5 rounded-2xl text-sm transition-colors ${
                    selectedDeckId === deck.id
                      ? 'bg-sora-soft border border-sora text-sora font-bold'
                      : 'hover:bg-gray-50 border border-transparent text-ink-2'
                  } disabled:opacity-50`}
                >
                  {deck.parent_deck_id && (
                    <span className="text-ink-3 mr-1">└</span>
                  )}
                  {deck.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 bg-again-bg text-again text-sm">
            {error}
          </div>
        )}

        <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-sm text-ink-2 border border-gray-300 rounded-2xl hover:bg-gray-50 transition-colors font-bold"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedDeckId || isProcessing}
            className="px-4 py-2 text-sm text-white bg-sora rounded-2xl hover:bg-sora-dark disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-bold"
          >
            {isProcessing ? '処理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
