'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  getWordbookForDeck,
  MASTERY_ORDER,
  MASTERY_LABEL,
  MASTERY_LEVELS,
  type MasteryLevel,
  type WordbookEntry,
} from '@/lib/wordbook'

interface WordbookViewProps {
  deckId: string
  userId: string | null
}

type Filter = 'all' | MasteryLevel

/** レベルごとの見た目（チップ・ドット・行） */
const LEVEL_STYLE: Record<MasteryLevel, { chip: string; dot: string; text: string }> = {
  new: { chip: 'bg-gray-100 text-ink-3 border-gray-200', dot: 'bg-gray-300', text: 'text-ink-3' },
  weak: { chip: 'bg-again-bg text-again border-again/30', dot: 'bg-again', text: 'text-again' },
  learning: { chip: 'bg-hard-bg text-hard border-hard/30', dot: 'bg-hard', text: 'text-hard' },
  stable: { chip: 'bg-good-bg text-good border-good/30', dot: 'bg-good', text: 'text-good' },
  mastered: { chip: 'bg-easy-bg text-easy border-easy/30', dot: 'bg-easy', text: 'text-easy' },
}

const PAGE = 100

export function WordbookView({ deckId, userId }: WordbookViewProps) {
  const entries = useLiveQuery(
    () => (userId ? getWordbookForDeck(deckId, userId) : Promise.resolve([])),
    [deckId, userId]
  )

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const counts = useMemo(() => {
    const c: Record<MasteryLevel, number> = { new: 0, weak: 0, learning: 0, stable: 0, mastered: 0 }
    for (const e of entries ?? []) c[e.mastery] += 1
    return c
  }, [entries])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = (entries ?? []).filter((e) => {
      if (filter !== 'all' && e.mastery !== filter) return false
      if (q && !e.label.toLowerCase().includes(q) && !e.sub.toLowerCase().includes(q)) return false
      return true
    })
    // 苦手が上 → 定着済みが下、同レベルは見出し語の五十音順
    list.sort((a, b) => {
      const d = MASTERY_ORDER[a.mastery] - MASTERY_ORDER[b.mastery]
      if (d !== 0) return d
      return a.label.localeCompare(b.label, 'ja')
    })
    return list
  }, [entries, filter, search])

  // フィルタ/検索を変えたら表示数をリセット
  const visible = filtered.slice(0, limit)

  if (entries === undefined) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-card border border-gray-200 p-8 text-center text-ink-2">
        まだ学習データがありません。学習を進めると、ここに単語ごとの定着度が表示されます。
      </div>
    )
  }

  const total = entries.length

  return (
    <div>
      {/* 定着度フィルタチップ */}
      <div className="mb-3 flex flex-wrap gap-2">
        <FilterChip
          active={filter === 'all'}
          onClick={() => {
            setFilter('all')
            setLimit(PAGE)
          }}
          className="bg-white text-ink-2 border-gray-300"
          activeClassName="bg-ai text-white border-ai"
          label="すべて"
          count={total}
        />
        {MASTERY_LEVELS.map((lv) => (
          <FilterChip
            key={lv}
            active={filter === lv}
            onClick={() => {
              setFilter(lv)
              setLimit(PAGE)
            }}
            className={LEVEL_STYLE[lv].chip}
            activeClassName="ring-2 ring-offset-1 ring-ai/40"
            label={MASTERY_LABEL[lv]}
            count={counts[lv]}
            dot={LEVEL_STYLE[lv].dot}
          />
        ))}
      </div>

      {/* 検索 */}
      <div className="mb-4 relative">
        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setLimit(PAGE)
          }}
          placeholder="単語・意味で絞り込み..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sora focus:border-sora outline-none text-sm"
        />
      </div>

      {/* 件数 */}
      <div className="mb-2 text-sm text-ink-3">
        {filter === 'all' && !search ? `全${total}語` : `${filtered.length}語`}
      </div>

      {/* 一覧 */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-card border border-gray-200 p-8 text-center text-ink-2">
          条件に一致する単語がありません。
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((e) => (
            <WordRow key={e.key} entry={e} />
          ))}
          {filtered.length > visible.length && (
            <div className="text-center pt-4">
              <button
                onClick={() => setLimit((l) => l + PAGE)}
                className="px-6 py-2 text-sm font-bold bg-white text-sora border-2 border-sora rounded-2xl hover:bg-sora-soft transition-colors"
              >
                もっと見る（残り{filtered.length - visible.length}語）
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  className,
  activeClassName,
  label,
  count,
  dot,
}: {
  active: boolean
  onClick: () => void
  className: string
  activeClassName: string
  label: string
  count: number
  dot?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-bold transition-all ${className} ${active ? activeClassName : ''}`}
    >
      {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
      {label}
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  )
}

function WordRow({ entry }: { entry: WordbookEntry }) {
  const s = LEVEL_STYLE[entry.mastery]
  return (
    <Link
      href={`/study?deck=${entry.reviewDeckId}&card=${entry.reviewCardId}`}
      className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 p-3.5 hover:border-sora hover:bg-sora-soft/40 transition-colors"
    >
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-ink truncate">{entry.label || '（無題）'}</span>
          {entry.pos && <span className="text-[11px] text-ink-3 flex-shrink-0">{entry.pos}</span>}
        </div>
        {entry.sub && <div className="text-xs text-ink-3 truncate mt-0.5">{entry.sub}</div>}
      </div>
      <span className={`text-xs font-bold flex-shrink-0 ${s.text}`}>{MASTERY_LABEL[entry.mastery]}</span>
      <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}
