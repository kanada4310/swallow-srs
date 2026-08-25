'use client'

/**
 * 読解の一覧 — どの講をやるか選ぶ。
 *
 * 講の名前はここに焼き込まない。工房が届ける index.json がそのまま一覧になる（契約 C22）。
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { describeReadingError, lessonTitle, loadLessonIndex } from '@/lib/reading/lessons'
import { describeStep, summarizeProgress } from '@/lib/reading/progress'
import type { ReadingLessonIndexEntry, ReadingProgressState } from '@/lib/reading/types'

/** サーバーの置き場所がまだ無いときのために、端末の控えからも拾う */
function readLocalProgress(userId: string): Record<string, ReadingProgressState> {
  const out: Record<string, ReadingProgressState> = {}
  try {
    const prefix = `reading-progress:${userId}:`
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(prefix)) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const state = JSON.parse(raw) as ReadingProgressState
      if (state?.lessonId) out[state.lessonId] = state
    }
  } catch {
    // 端末の控えが読めなくても一覧は出す
  }
  return out
}

export default function ReadingIndexPage() {
  const { userId, isLoading: authLoading } = useAuth()
  const [lessons, setLessons] = useState<ReadingLessonIndexEntry[] | null>(null)
  const [error, setError] = useState<{ message: string; needsLogin: boolean } | null>(null)
  const [progress, setProgress] = useState<Record<string, ReadingProgressState>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await loadLessonIndex()
        if (!cancelled) {
          setLessons(list)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(describeReadingError(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const local = readLocalProgress(userId)
    if (!cancelled) setProgress(local)
    ;(async () => {
      try {
        const res = await fetch('/api/reading/progress')
        if (!res.ok) return
        const body = await res.json()
        if (cancelled || !Array.isArray(body.progress)) return
        const merged = { ...local }
        body.progress.forEach((row: { lessonId: string; state: ReadingProgressState }) => {
          const existing = merged[row.lessonId]
          if (
            !existing ||
            new Date(row.state.updatedAt).getTime() > new Date(existing.updatedAt).getTime()
          ) {
            merged[row.lessonId] = row.state
          }
        })
        setProgress(merged)
      } catch {
        // オフライン。端末の控えだけで出す
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  const body = useMemo(() => {
    if (error) {
      return (
        <div className="rounded-card border border-gray-200 bg-white p-5 shadow-card">
          <p className="mb-3 text-sm leading-relaxed text-ink">{error.message}</p>
          {error.needsLogin && (
            <a href="/login" className="inline-block rounded-xl bg-sora px-4 py-2.5 text-sm font-bold text-white">
              ログインし直す
            </a>
          )}
        </div>
      )
    }
    if (!lessons) {
      return (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-card bg-gray-200" />
          ))}
        </div>
      )
    }
    if (lessons.length === 0) {
      return (
        <div className="rounded-card border border-gray-200 bg-white p-5 text-sm text-ink-2 shadow-card">
          まだ教材が届いていません。
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {lessons.map((l) => {
          const state = progress[l.id]
          const summary = state ? summarizeProgress(state) : null
          return (
            <Link
              key={l.id}
              href={`/reading/${encodeURIComponent(l.id)}`}
              className="block rounded-card border border-gray-200 bg-white p-4 shadow-card transition-colors hover:bg-sora-soft"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-extrabold text-ai">{lessonTitle(l)}</h2>
                {summary ? (
                  <span
                    className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      summary.completed ? 'bg-good-bg text-good' : 'bg-hard-bg text-hard'
                    }`}
                  >
                    {summary.completed ? '終了' : '続きから'}
                  </span>
                ) : (
                  <span className="flex-shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-ink-3">
                    未着手
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-ink-3">{l.source}</p>
              <p className="mt-2 text-xs text-ink-2">
                {l.paragraphs} 段落 / 必須の切れ目 {l.requiredCuts} か所
                {summary && (
                  <>
                    {' ・ '}
                    <span className="font-bold text-ai">{describeStep(summary)}</span>
                  </>
                )}
              </p>
            </Link>
          )
        })}
      </div>
    )
  }, [error, lessons, progress])

  if (authLoading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="mb-4 h-8 w-24 animate-pulse rounded-xl bg-gray-200" />
          <div className="h-48 animate-pulse rounded-card bg-gray-200" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-1 text-2xl font-extrabold text-ai">読解</h1>
        <p className="mb-5 text-sm leading-relaxed text-ink-2">
          英語長文を「意味のまとまりで区切る → 大意を書く → 関係を組み立てる」の順に読み解きます。
          途中でやめても、次に開いたときに続きから始められます。
        </p>

        {body}

        <Link
          href="/reading/syntax"
          className="mt-4 block rounded-card border border-dashed border-gray-300 bg-white p-4 text-center shadow-sm transition-colors hover:bg-sora-soft"
        >
          <span className="block text-sm font-bold text-ai">構文の練習</span>
          <span className="mt-0.5 block text-xs text-ink-3">
            1文の品詞と働きを書き込む練習（採点つき）
          </span>
        </Link>
      </div>
    </AppLayout>
  )
}
