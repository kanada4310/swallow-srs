'use client'

import Link from 'next/link'
import type { WitheredPlant } from '@/lib/garden/garden-data'
import { IsoTile } from './IsoTile'

/**
 * 枯れ株一覧（Phase 10.3）— 全デッキ横断で枯れた株を並べ、
 * 各株から「水やり（=その株を最優先で復習）」へ導く復活導線。
 *
 * 枯れは見た目のみ。水やり（復習）で FSRS が自然に芽吹き直す（永久ロストなし＝安全弁）。
 */
export function WitheredList({
  plants,
  onClose,
}: {
  plants: WitheredPlant[]
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            <span className="mr-1.5" aria-hidden>🍂</span>枯れ株（{plants.length}）
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-sm"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <p className="px-5 py-3 text-xs text-gray-500">
          しばらく水やりできていない株です。水やり（復習）でまた芽吹きます。もう一度育てましょう。
        </p>

        {plants.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">
            枯れた株はありません。よく世話できています 🌿
          </div>
        ) : (
          <ul className="overflow-y-auto px-3 pb-4 divide-y divide-gray-100">
            {plants.map((p) => (
              <li key={p.cardId} className="flex items-center gap-3 py-2.5 px-2">
                <svg viewBox="-44 -62 88 92" width="44" height="46" role="img" aria-hidden className="flex-shrink-0">
                  <IsoTile plant={p.plant} variety={p.variety} animate={false} />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 truncate">
                    {p.label || '（名札なし）'}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {p.deckName} ・ {formatOverdue(p.plant.overdueDays)}放置
                  </div>
                </div>
                <Link
                  href={`/study?deck=${p.deckId}&card=${p.cardId}`}
                  className="flex-shrink-0 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  水やり
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** 放置日数を「N日」表記に（端数切り捨て、0日は「1日未満」） */
function formatOverdue(days: number): string {
  const d = Math.floor(days)
  return d < 1 ? '1日未満' : `${d}日`
}
