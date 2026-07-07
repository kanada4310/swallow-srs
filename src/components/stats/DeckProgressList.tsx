'use client'

import type { DeckProgressData } from '@/types/database'

interface DeckProgressListProps {
  data: DeckProgressData[]
  onDeckClick?: (deckId: string, deckName: string) => void
  /** 指定するとルートデッキ行に⚙（この生徒の学習設定）を表示（講師用） */
  onSettingsClick?: (deckId: string, deckName: string) => void
}

export function DeckProgressList({ data, onDeckClick, onSettingsClick }: DeckProgressListProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-card border border-gray-200 p-6">
        <h3 className="text-sm font-bold text-ai mb-4">デッキ別進捗</h3>
        <div className="text-center text-ink-3 text-sm py-8">
          デッキがありません
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-card border border-gray-200 p-6">
      <h3 className="text-sm font-bold text-ai mb-4">デッキ別進捗</h3>
      <div className="space-y-4">
        {data.map((deck) => (
          <DeckProgressItem key={deck.deckId} deck={deck} onClick={onDeckClick} onSettingsClick={onSettingsClick} />
        ))}
      </div>
    </div>
  )
}

function DeckProgressItem({ deck, onClick, onSettingsClick }: {
  deck: DeckProgressData
  onClick?: (deckId: string, deckName: string) => void
  onSettingsClick?: (deckId: string, deckName: string) => void
}) {
  const { deckId, deckName, totalCards, masteredCards, learningCards, newCards } = deck
  const clickable = !!onClick
  // 学習設定はルートデッキ単位（サブデッキは親の設定を共有）なので、ルート行にのみ⚙を出す
  const showSettings = !!onSettingsClick && !deck.parentDeckId

  if (totalCards === 0) {
    return (
      <div className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-ink truncate">{deckName}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-3 tabular-nums">0枚</span>
            {showSettings && (
              <button
                onClick={() => onSettingsClick!(deckId, deckName)}
                aria-label={`${deckName} の学習設定`}
                title="この生徒の学習設定"
                className="p-1 text-ink-3 hover:text-sora transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
          </div>
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
    <div
      className={`border-b border-gray-100 pb-3 last:border-0 last:pb-0 ${clickable ? 'cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1 rounded-xl transition-colors' : ''}`}
      onClick={clickable ? () => onClick(deckId, deckName) : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-ink truncate max-w-[60%]">{deckName}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-3 tabular-nums">
            {masteredCards}/{totalCards}枚 完了
          </span>
          {showSettings && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSettingsClick!(deckId, deckName)
              }}
              aria-label={`${deckName} の学習設定`}
              title="この生徒の学習設定"
              className="p-1 text-ink-3 hover:text-sora transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
          {clickable && (
            <svg className="w-3.5 h-3.5 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
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
      <div className="flex justify-between text-xs text-ink-3 mt-1">
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
