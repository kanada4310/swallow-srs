'use client'

import type { DeckProgressData } from '@/types/database'

interface DeckProgressListProps {
  data: DeckProgressData[]
}

export function DeckProgressList({ data }: DeckProgressListProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">デッキ別進捗</h3>
        <div className="text-center text-gray-400 text-sm py-8">
          デッキがありません
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-4">デッキ別進捗</h3>
      <div className="space-y-4">
        {data.map((deck) => (
          <DeckProgressItem key={deck.deckId} deck={deck} />
        ))}
      </div>
    </div>
  )
}

function DeckProgressItem({ deck }: { deck: DeckProgressData }) {
  const { deckName, totalCards, masteredCards, learningCards, newCards } = deck

  if (totalCards === 0) {
    return (
      <div className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-800 truncate">{deckName}</span>
          <span className="text-xs text-gray-400">0枚</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden" />
      </div>
    )
  }

  const masteredPercent = (masteredCards / totalCards) * 100
  const learningPercent = (learningCards / totalCards) * 100
  const reviewPercent = ((totalCards - masteredCards - learningCards - newCards) / totalCards) * 100
  const newPercent = (newCards / totalCards) * 100

  return (
    <div className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-800 truncate max-w-[60%]">{deckName}</span>
        <span className="text-xs text-gray-500">
          {masteredCards}/{totalCards}枚 完了
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
        {masteredPercent > 0 && (
          <div
            className="bg-green-500 h-full"
            style={{ width: `${masteredPercent}%` }}
            title={`完了: ${masteredCards}枚`}
          />
        )}
        {reviewPercent > 0 && (
          <div
            className="bg-emerald-300 h-full"
            style={{ width: `${reviewPercent}%` }}
            title={`復習中: ${totalCards - masteredCards - learningCards - newCards}枚`}
          />
        )}
        {learningPercent > 0 && (
          <div
            className="bg-amber-400 h-full"
            style={{ width: `${learningPercent}%` }}
            title={`学習中: ${learningCards}枚`}
          />
        )}
        {newPercent > 0 && (
          <div
            className="bg-blue-400 h-full"
            style={{ width: `${newPercent}%` }}
            title={`新規: ${newCards}枚`}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{Math.round(masteredPercent)}% 完了</span>
        <div className="flex gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />完了
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400" />学習中
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400" />新規
          </span>
        </div>
      </div>
    </div>
  )
}
