'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface DeckFormProps {
  mode: 'create' | 'edit'
  initialData?: {
    id: string
    name: string
    newCardsPerDay: number
  }
}

export function DeckForm({ mode, initialData }: DeckFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initialData?.name || '')
  const [newCardsPerDay, setNewCardsPerDay] = useState(initialData?.newCardsPerDay || 20)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, newCardsPerDay }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create deck')
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

      <div>
        <label htmlFor="newCardsPerDay" className="block text-sm font-medium text-gray-700 mb-2">
          1日の新規カード数
        </label>
        <input
          type="number"
          id="newCardsPerDay"
          value={newCardsPerDay}
          onChange={(e) => setNewCardsPerDay(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
          min="1"
          max="100"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
        />
        <p className="mt-1 text-sm text-gray-500">
          生徒が1日に学習する新しいカードの最大数（1〜100）
        </p>
      </div>

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
