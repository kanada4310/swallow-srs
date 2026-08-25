'use client'

/**
 * 生徒ホームのスパルタカード。
 * 自分のスパルタ（期間を定めた暗記の取り組み）の対象デッキ・期限・進捗を表示する。
 * サーバー集計（/api/sparta/mine）を読むだけの表示層。
 * オフラインや未登録のときは何も表示しない（ホームを邪魔しない）。
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface MineProgram {
  id: string
  deckIds: string[]
  deckNames: string[]
  startDate: string
  endDate: string
  phase: 'upcoming' | 'active' | 'ended' | 'canceled'
  achievedInPeriod: number
  targetCount: number
  progressPct: number
  daysRemaining: number
  daysTotal: number
  studiedToday: boolean
  currentStreak: number
}

function formatDate(key: string): string {
  const [, m, d] = key.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function SpartaCard() {
  const [programs, setPrograms] = useState<MineProgram[]>([])

  useEffect(() => {
    let stale = false
    fetch('/api/sparta/mine')
      .then(res => (res.ok ? res.json() : { programs: [] }))
      .then(data => {
        if (!stale) setPrograms(data.programs || [])
      })
      .catch(() => {
        // オフライン等では非表示のまま
      })
    return () => {
      stale = true
    }
  }, [])

  const visible = programs.filter(p => p.phase === 'active' || p.phase === 'upcoming')
  if (visible.length === 0) return null

  return (
    <section className="space-y-3">
      {visible.map(p => (
        <div key={p.id} className="bg-white rounded-card border-2 border-nodo/30 shadow-card p-5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-bold tracking-widest text-nodo-dark">スパルタ</span>
              {p.phase === 'upcoming' ? (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sora-soft text-sora-dark">
                  {formatDate(p.startDate)}から
                </span>
              ) : (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.studiedToday ? 'bg-good-bg text-good' : 'bg-again-bg text-again'}`}>
                  {p.studiedToday ? '今日実施済み' : '今日まだ'}
                </span>
              )}
            </div>
            <span className="shrink-0 text-xs font-bold text-ink-2 tabular-nums">
              〜{formatDate(p.endDate)}
              {p.phase === 'active' && <span className="ml-1 text-hard">残り{p.daysRemaining}日</span>}
            </span>
          </div>

          <div className="text-sm font-bold text-ai truncate mb-2">{p.deckNames.join('、')}</div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${p.progressPct >= 100 ? 'bg-easy' : 'bg-nodo'}`}
                style={{ width: `${Math.min(100, p.progressPct)}%` }}
              />
            </div>
            <div className="shrink-0 text-sm font-extrabold text-ai tabular-nums">
              {p.achievedInPeriod}/{p.targetCount}
              <span className="ml-1 text-xs font-bold text-ink-3">({p.progressPct}%)</span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-ink-3">
              覚えたカードの数で進みます
              {p.currentStreak > 0 && <>・連続{p.currentStreak}日</>}
            </span>
            {p.phase === 'active' && p.deckIds.length > 0 && (
              <Link
                href={`/study?deck=${p.deckIds[0]}`}
                className="text-xs font-extrabold text-sora hover:text-sora-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              >
                学習する →
              </Link>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}
