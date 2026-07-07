'use client'

import Link from 'next/link'
import type { MissionDeck } from '@/app/page'

interface StudyDeckPickerProps {
  decks: MissionDeck[]
  onClose: () => void
}

/**
 * ホームの「学習をはじめる」で、今日やるカードがあるデッキが複数あるときの選択モーダル。
 * 行をタップするとそのデッキで学習開始（/study?deck=X）。
 */
export function StudyDeckPicker({ decks, onClose }: StudyDeckPickerProps) {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-card shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-ai">どのデッキから始める？</h2>
            <p className="text-sm text-ink-3 mt-0.5">タップするとそのデッキで学習が始まります</p>
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="p-2 text-ink-3 hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-3 space-y-2">
          {decks.map((d) => (
            <Link
              key={d.deckId}
              href={`/study?deck=${d.deckId}`}
              className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-gray-200 hover:border-sora hover:bg-sora-soft transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ai truncate">{d.deckName}</span>
                <span className="mt-1 flex items-center gap-1.5">
                  {d.due > 0 && (
                    <span className="inline-flex items-center rounded-full bg-good-bg px-2 py-0.5 text-xs font-bold text-good">
                      復習 {d.due}
                    </span>
                  )}
                  {d.newToday > 0 && (
                    <span className="inline-flex items-center rounded-full bg-easy-bg px-2 py-0.5 text-xs font-bold text-easy">
                      新規 {d.newToday}
                    </span>
                  )}
                </span>
              </span>
              <svg className="w-5 h-5 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
