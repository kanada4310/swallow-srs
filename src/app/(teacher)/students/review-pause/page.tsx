'use client'

/**
 * 講師向け「復習通知の管理」ページ。
 * どの生徒のどのデッキの復習（LINE通知）が走っているかを一覧し、
 * デッキ単位で通知の停止/再開ができる。
 * 停止しても学習スケジュール（card_states）は変わらない。
 * 生徒が自分でそのデッキを学習すると停止は自動解除される。
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import Link from 'next/link'

interface StudentDeckRow {
  deckId: string
  deckName: string
  dueCount: number
  lastReviewedAt: string | null
  paused: boolean
  pausedAt: string | null
}

interface StudentRow {
  userId: string
  name: string
  decks: StudentDeckRow[]
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return '--'
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (diffDays <= 0) return '今日'
  if (diffDays === 1) return '昨日'
  if (diffDays < 30) return `${diffDays}日前`
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function ReviewPausePage() {
  const { profile, isLoading: authLoading } = useAuth()
  const [students, setStudents] = useState<StudentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/teacher/deck-review-pause')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '取得に失敗しました')
      }
      const data = await res.json()
      setStudents(data.students)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました')
      setStudents([])
    }
  }, [])

  useEffect(() => {
    if (!profile || profile.role === 'student') return
    fetchData()
  }, [profile, fetchData])

  const handleToggle = useCallback(
    async (userId: string, deck: StudentDeckRow) => {
      const key = `${userId}:${deck.deckId}`
      setBusyKey(key)
      setError(null)
      try {
        const res = await fetch('/api/teacher/deck-review-pause', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            deckId: deck.deckId,
            action: deck.paused ? 'resume' : 'pause',
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || '操作に失敗しました')
        // 楽観的更新（サーバー結果で paused を反映）
        setStudents(prev =>
          prev
            ? prev.map(s =>
                s.userId === userId
                  ? {
                      ...s,
                      decks: s.decks.map(d =>
                        d.deckId === deck.deckId
                          ? { ...d, paused: !deck.paused, pausedAt: !deck.paused ? new Date().toISOString() : null }
                          : d
                      ),
                    }
                  : s
              )
            : prev
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : '操作に失敗しました')
      } finally {
        setBusyKey(null)
      }
    },
    []
  )

  const filteredStudents = useMemo(() => {
    if (!students) return null
    if (!searchQuery) return students
    const q = searchQuery.toLowerCase()
    return students.filter(s => s.name.toLowerCase().includes(q))
  }, [students, searchQuery])

  const pausedTotal = useMemo(
    () => (students || []).reduce((sum, s) => sum + s.decks.filter(d => d.paused).length, 0),
    [students]
  )

  if (authLoading || students === null) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="h-8 bg-gray-200 rounded w-56 animate-pulse mb-6" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4 h-24 animate-pulse" />
            ))}
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!profile || profile.role === 'student') return null

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-extrabold text-ai">復習通知の管理</h1>
          <Link
            href="/students/progress"
            className="text-sm text-sora hover:text-sora-dark font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            取組状況
          </Link>
        </div>
        <p className="text-sm text-ink-2 mb-4">
          期限切れの復習があるデッキ（=LINE通知の対象）の一覧です。「通知を停止」するとそのデッキは通知から外れます。
          学習スケジュールは変わらず、生徒が自分でそのデッキを学習すると停止は自動で解除されます。
        </p>

        {error && (
          <div className="bg-again-bg text-again p-3 rounded-2xl mb-4 text-sm">{error}</div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="生徒名で検索..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-sora focus:ring-2 focus:ring-sora"
          />
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-3 text-center">
            <div className="text-2xl font-extrabold text-ai tabular-nums">{students.length}</div>
            <div className="text-xs text-ink-3">復習が走っている生徒</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-3 text-center">
            <div className="text-2xl font-extrabold text-hard tabular-nums">{pausedTotal}</div>
            <div className="text-xs text-ink-3">停止中のデッキ</div>
          </div>
        </div>

        {/* Student × deck list */}
        <div className="space-y-3">
          {filteredStudents && filteredStudents.length === 0 && (
            <div className="text-center text-ink-2 py-8">
              {searchQuery ? '該当する生徒がいません' : '期限切れの復習がある生徒はいません'}
            </div>
          )}

          {filteredStudents?.map(student => (
            <div
              key={student.userId}
              className="bg-white rounded-2xl border border-gray-200 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <Link
                  href={`/students/progress/${student.userId}`}
                  className="font-bold text-ai hover:text-sora truncate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                >
                  {student.name}
                </Link>
                <span className="text-xs text-ink-3 tabular-nums">
                  期限切れ 計{student.decks.reduce((sum, d) => sum + d.dueCount, 0)}枚
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {student.decks.map(deck => {
                  const key = `${student.userId}:${deck.deckId}`
                  return (
                    <div key={deck.deckId} className="py-2 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm truncate ${deck.paused ? 'text-ink-3' : 'text-ink'}`}>
                          {deck.deckName}
                        </div>
                        <div className="text-xs text-ink-3">
                          最終学習: {formatRelativeDate(deck.lastReviewedAt)}
                        </div>
                      </div>
                      <div className="text-center shrink-0 w-16">
                        <div className={`text-sm font-bold tabular-nums ${deck.paused ? 'text-ink-3' : deck.dueCount > 0 ? 'text-hard' : 'text-ink-3'}`}>
                          {deck.dueCount}
                        </div>
                        <div className="text-xs text-ink-3">期限切れ</div>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          deck.paused ? 'bg-gray-100 text-ink-3' : 'bg-good-bg text-good'
                        }`}
                      >
                        {deck.paused ? '停止中' : '通知中'}
                      </span>
                      <button
                        onClick={() => handleToggle(student.userId, deck)}
                        disabled={busyKey === key}
                        className={`shrink-0 px-3 py-1.5 text-xs font-bold rounded-2xl border transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai ${
                          deck.paused
                            ? 'text-sora border-sora/40 hover:bg-sora-soft'
                            : 'text-again border-again/40 hover:bg-again-bg'
                        }`}
                      >
                        {busyKey === key ? '処理中...' : deck.paused ? '通知を再開' : '通知を停止'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
