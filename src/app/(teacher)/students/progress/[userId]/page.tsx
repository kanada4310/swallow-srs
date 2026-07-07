'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  StatsOverview,
  DailyReviewChart,
  CardDistributionChart,
  AccuracyTrendChart,
  DeckProgressList,
  StatsSkeleton,
} from '@/components/stats'
import Link from 'next/link'
import { DeckAdvancedSettings } from '@/components/deck/DeckAdvancedSettings'
import type { DetailedStats, DeckSettings } from '@/types/database'

interface StudentInfo {
  id: string
  name: string
  email: string
}

type StatsData = {
  streak: number
  reviewsToday: number
  dueCards: number
  newCards: number
  learningCards: number
} & Partial<DetailedStats>

interface NoteProgress {
  noteId: string
  displayText: string
  tags: string[]
  status: string
  interval: number
  lastReview: string | null
  totalReviews: number
  accuracy: number | null
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: '新規', color: 'bg-easy-bg text-easy' },
  learning: { label: '学習中', color: 'bg-hard-bg text-hard' },
  relearning: { label: '再学習', color: 'bg-again-bg text-again' },
  review: { label: '復習', color: 'bg-good-bg text-good' },
  mastered: { label: '習得', color: 'bg-sora-soft text-sora' },
  suspended: { label: '停止', color: 'bg-gray-100 text-ink-3' },
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return '--'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return '今日'
  if (diffDays === 1) return '昨日'
  if (diffDays < 7) return `${diffDays}日前`
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
}

export default function StudentProgressDetailPage({ params }: { params: { userId: string } }) {
  const { profile, isLoading: authLoading } = useAuth()
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [period, setPeriod] = useState(7)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Note progress drill-down
  const [selectedDeck, setSelectedDeck] = useState<{ id: string; name: string } | null>(null)
  const [noteProgress, setNoteProgress] = useState<NoteProgress[] | null>(null)
  const [noteLoading, setNoteLoading] = useState(false)

  // この生徒のデッキ別学習設定（user_deck_settings を講師が編集）
  const [settingsDeck, setSettingsDeck] = useState<{ id: string; name: string } | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<Partial<DeckSettings>>({})
  const [settingsHasOverride, setSettingsHasOverride] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  // Handle dynamic route params - fallback to window.location
  const userId = params?.userId || (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '') || ''

  const fetchData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/teacher/student-progress?userId=${userId}&period=${period}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to fetch')
      }
      const data = await res.json()
      setStudent(data.student)
      setStats(data.stats)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [userId, period])

  useEffect(() => {
    if (!profile || profile.role === 'student') return
    fetchData()
  }, [profile, fetchData])

  const handleSettingsClick = useCallback(async (deckId: string, deckName: string) => {
    setSettingsDeck({ id: deckId, name: deckName })
    setSettingsError(null)
    setSettingsLoading(true)
    try {
      const res = await fetch(`/api/teacher/student-deck-settings?userId=${userId}&deckId=${deckId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '設定の取得に失敗しました')
      setSettingsDraft(data.merged || {})
      setSettingsHasOverride(!!data.override)
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : '設定の取得に失敗しました')
      setSettingsDraft({})
      setSettingsHasOverride(false)
    } finally {
      setSettingsLoading(false)
    }
  }, [userId])

  const handleSettingsSave = useCallback(async () => {
    if (!settingsDeck) return
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      const res = await fetch('/api/teacher/student-deck-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, deckId: settingsDeck.id, settings: settingsDraft }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '設定の保存に失敗しました')
      setSettingsDeck(null)
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : '設定の保存に失敗しました')
    } finally {
      setSettingsSaving(false)
    }
  }, [userId, settingsDeck, settingsDraft])

  const handleSettingsReset = useCallback(async () => {
    if (!settingsDeck) return
    setSettingsSaving(true)
    setSettingsError(null)
    try {
      const res = await fetch(
        `/api/teacher/student-deck-settings?userId=${userId}&deckId=${settingsDeck.id}`,
        { method: 'DELETE' }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'リセットに失敗しました')
      setSettingsDeck(null)
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'リセットに失敗しました')
    } finally {
      setSettingsSaving(false)
    }
  }, [userId, settingsDeck])

  const handleDeckClick = useCallback(async (deckId: string, deckName: string) => {
    if (selectedDeck?.id === deckId) {
      setSelectedDeck(null)
      setNoteProgress(null)
      return
    }
    setSelectedDeck({ id: deckId, name: deckName })
    setNoteLoading(true)
    try {
      const res = await fetch(`/api/teacher/student-progress?userId=${userId}&deckId=${deckId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setNoteProgress(data.notes)
    } catch {
      setNoteProgress([])
    } finally {
      setNoteLoading(false)
    }
  }, [userId, selectedDeck])

  if (authLoading || (loading && !stats)) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <StatsSkeleton />
        </div>
      </AppLayout>
    )
  }

  if (!profile || profile.role === 'student') return null

  if (error) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="bg-again-bg text-again p-4 rounded-card">{error}</div>
          <Link href="/students/progress" className="text-sora hover:text-sora-dark font-bold mt-4 inline-block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai">
            &larr; 一覧に戻る
          </Link>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Link
            href="/students/progress"
            className="text-ink-3 hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-ai">{student?.name}</h1>
            <p className="text-sm text-ink-2">{student?.email}</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-2 mb-6">
          {[7, 14, 30].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-2xl text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai ${
                period === p
                  ? 'bg-sora text-white'
                  : 'bg-gray-100 text-ink-2 hover:bg-gray-200'
              }`}
            >
              {p}日
            </button>
          ))}
        </div>

        {stats && (
          <div className="space-y-6">
            <StatsOverview
              streak={stats.streak}
              totalReviews={stats.totalReviews || 0}
              overallAccuracy={stats.overallAccuracy || 0}
              reviewsToday={stats.reviewsToday}
            />

            {stats.dailyReviews && (
              <DailyReviewChart data={stats.dailyReviews} />
            )}

            {stats.cardDistribution && (
              <CardDistributionChart data={stats.cardDistribution} />
            )}

            {stats.accuracyTrend && (
              <AccuracyTrendChart data={stats.accuracyTrend} />
            )}

            {stats.deckProgress && stats.deckProgress.length > 0 && (
              <>
                <DeckProgressList
                  data={stats.deckProgress}
                  onDeckClick={handleDeckClick}
                  onSettingsClick={handleSettingsClick}
                />

                {/* Note-level progress panel */}
                {selectedDeck && (
                  <div className="bg-white rounded-card border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-ai">
                        {selectedDeck.name} のノート進捗
                      </h3>
                      <button
                        onClick={() => { setSelectedDeck(null); setNoteProgress(null) }}
                        className="text-ink-3 hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {noteLoading ? (
                      <div className="space-y-2">
                        {[...Array(5)].map((_, i) => (
                          <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
                        ))}
                      </div>
                    ) : noteProgress && noteProgress.length === 0 ? (
                      <div className="text-center text-ink-3 text-sm py-6">ノートがありません</div>
                    ) : noteProgress && (
                      <div className="overflow-x-auto -mx-4 px-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-ink-3 border-b border-gray-100">
                              <th className="pb-2 pr-2 font-medium">ノート</th>
                              <th className="pb-2 px-2 font-medium w-16 text-center">状態</th>
                              <th className="pb-2 px-2 font-medium w-16 text-center">正答率</th>
                              <th className="pb-2 pl-2 font-medium w-16 text-center">最終</th>
                            </tr>
                          </thead>
                          <tbody>
                            {noteProgress.map(note => {
                              const statusInfo = STATUS_LABELS[note.status] || STATUS_LABELS.new
                              return (
                                <tr
                                  key={note.noteId}
                                  className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-sora-soft transition-colors"
                                  onClick={() => window.location.href = `/decks/${selectedDeck.id}?note=${note.noteId}`}
                                >
                                  <td className="py-2 pr-2">
                                    <div className="text-ink truncate max-w-[200px] sm:max-w-[300px]">
                                      {note.displayText || '(空)'}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full ${statusInfo.color}`}>
                                      {statusInfo.label}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-center tabular-nums">
                                    {note.accuracy !== null ? (
                                      <span className={`text-xs font-bold ${note.accuracy >= 80 ? 'text-good' : note.accuracy >= 60 ? 'text-hard' : 'text-again'}`}>
                                        {note.accuracy}%
                                      </span>
                                    ) : (
                                      <span className="text-xs text-ink-3">--</span>
                                    )}
                                  </td>
                                  <td className="py-2 pl-2 text-center">
                                    <span className="text-xs text-ink-3">
                                      {formatRelativeDate(note.lastReview)}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* この生徒の学習設定モーダル */}
        {settingsDeck && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-card shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-ai">
                    {student?.name} さんの学習設定 - {settingsDeck.name}
                  </h2>
                  <button
                    onClick={() => setSettingsDeck(null)}
                    aria-label="閉じる"
                    className="text-ink-3 hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="text-sm text-sora mt-2">
                  この設定はこの生徒の学習にのみ影響します（デッキ本体の設定は変わりません）。
                  反映は生徒側の次回同期（アプリを開いたとき）です。
                </p>
                {settingsHasOverride && (
                  <p className="text-xs text-ink-3 mt-1">
                    ※ この生徒には個別設定がすでにあります（デッキ既定より優先されています）
                  </p>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {settingsLoading ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <DeckAdvancedSettings settings={settingsDraft} onChange={setSettingsDraft} />
                )}

                {settingsError && (
                  <div className="mt-4 p-3 bg-again-bg rounded-xl text-again text-sm">
                    {settingsError}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-200 flex items-center justify-between gap-3">
                <button
                  onClick={handleSettingsReset}
                  disabled={settingsSaving || settingsLoading || !settingsHasOverride}
                  title={settingsHasOverride ? '個別設定を削除してデッキ既定に戻す' : '個別設定はありません'}
                  className="px-4 py-2 text-sm font-bold text-again border border-again/40 rounded-2xl hover:bg-again-bg disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                >
                  既定に戻す
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSettingsDeck(null)}
                    disabled={settingsSaving}
                    className="px-4 py-2 text-sm font-bold text-ink-2 border border-gray-300 rounded-2xl hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleSettingsSave}
                    disabled={settingsSaving || settingsLoading}
                    className="px-4 py-2 text-sm font-bold text-white bg-sora rounded-2xl hover:bg-sora-dark disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                  >
                    {settingsSaving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
