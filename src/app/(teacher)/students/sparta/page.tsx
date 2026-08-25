'use client'

/**
 * 講師向け「スパルタの管理」ページ。
 * スパルタプログラム（期間を定めた暗記の取り組み・達成報酬つき）を
 * 登録・編集・中止し、期間内の学習実績から達成状況を自動集計して一覧する。
 * 期間が終わったプログラムは達成サマリー（報酬判定の材料）を表示する。
 * 進捗はすべて既存の学習記録から導出し、金額の計算はしない。
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import Link from 'next/link'
import {
  GOAL_MASTERY_LABEL,
  SPARTA_PHASE_LABEL,
  type SpartaPhase,
  type SpartaGoalMastery,
} from '@/lib/sparta/logic'
import { MASTERY_LABEL, MASTERY_LEVELS, type MasteryLevel } from '@/lib/wordbook/mastery'

interface ProgramProgress {
  phase: SpartaPhase
  totalCards: number
  achievedNow: number
  baseline: number
  achievedInPeriod: number
  targetCount: number
  progressPct: number
  masteryBreakdown: Record<MasteryLevel, number>
  daysTotal: number
  daysElapsed: number
  daysRemaining: number
  daysStudied: number
  studiedToday: boolean
  currentStreak: number
  days: Array<{ key: string; count: number }>
}

interface Program {
  id: string
  userId: string
  studentName: string
  deckIds: string[]
  deckNames: string[]
  startDate: string
  endDate: string
  targetCardCount: number | null
  goalMastery: SpartaGoalMastery
  status: 'active' | 'canceled'
  memo: string | null
  progress: ProgramProgress
}

interface StudentOption {
  id: string
  name: string
}

interface DeckOption {
  id: string
  name: string
}

interface FormState {
  /** 編集中のプログラムID。null = 新規登録 */
  editingId: string | null
  userId: string
  deckIds: string[]
  startDate: string
  endDate: string
  /** '' = 対象デッキ全部 */
  targetCardCount: string
  goalMastery: SpartaGoalMastery
  memo: string
}

const PHASE_BADGE: Record<SpartaPhase, string> = {
  active: 'bg-good-bg text-good',
  upcoming: 'bg-sora-soft text-sora-dark',
  ended: 'bg-gray-100 text-ink-2',
  canceled: 'bg-gray-100 text-ink-3',
}

const MASTERY_CHIP: Record<MasteryLevel, string> = {
  new: 'bg-gray-100 text-ink-3',
  weak: 'bg-again-bg text-again',
  learning: 'bg-hard-bg text-hard',
  stable: 'bg-good-bg text-good',
  mastered: 'bg-easy-bg text-easy',
}

function formatDate(key: string): string {
  const [y, m, d] = key.split('-')
  return `${y}/${Number(m)}/${Number(d)}`
}

function todayKeyJst(): string {
  // 表示用の既定値（日本時間の今日）
  const shifted = new Date(Date.now() + 9 * 3_600_000)
  return shifted.toISOString().slice(0, 10)
}

function addDaysKey(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

function emptyForm(): FormState {
  const start = todayKeyJst()
  return {
    editingId: null,
    userId: '',
    deckIds: [],
    startDate: start,
    endDate: addDaysKey(start, 27), // 目安の4週間
    targetCardCount: '',
    goalMastery: 'stable',
    memo: '',
  }
}

export default function SpartaPage() {
  const { profile, isLoading: authLoading } = useAuth()
  const [programs, setPrograms] = useState<Program[] | null>(null)
  const [students, setStudents] = useState<StudentOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyRowId, setBusyRowId] = useState<string | null>(null)
  const [showFinished, setShowFinished] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/teacher/sparta')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '取得に失敗しました')
      }
      const data = await res.json()
      setPrograms(data.programs)
      setStudents(data.students)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました')
      setPrograms([])
    }
  }, [])

  useEffect(() => {
    if (!profile || profile.role === 'student') return
    fetchData()
  }, [profile, fetchData])

  const handleSubmit = useCallback(async () => {
    if (!form) return
    setBusy(true)
    setError(null)
    try {
      const payload = {
        userId: form.userId,
        deckIds: form.deckIds,
        startDate: form.startDate,
        endDate: form.endDate,
        targetCardCount: form.targetCardCount === '' ? null : Number(form.targetCardCount),
        goalMastery: form.goalMastery,
        memo: form.memo,
      }
      const res = await fetch('/api/teacher/sparta', {
        method: form.editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form.editingId ? { id: form.editingId, ...payload } : payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '保存に失敗しました')
      setForm(null)
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setBusy(false)
    }
  }, [form, fetchData])

  const handleStatusChange = useCallback(
    async (program: Program, status: 'active' | 'canceled') => {
      const label = status === 'canceled' ? '中止' : '再開'
      if (!confirm(`${program.studentName}さんのスパルタを${label}しますか？`)) return
      setBusyRowId(program.id)
      setError(null)
      try {
        const res = await fetch('/api/teacher/sparta', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: program.id, status }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || '操作に失敗しました')
        await fetchData()
      } catch (err) {
        setError(err instanceof Error ? err.message : '操作に失敗しました')
      } finally {
        setBusyRowId(null)
      }
    },
    [fetchData]
  )

  const handleDelete = useCallback(
    async (program: Program) => {
      if (
        !confirm(
          `${program.studentName}さんのスパルタを削除しますか？\n（誤登録の取り消し用。記録ごと消えます）`
        )
      )
        return
      setBusyRowId(program.id)
      setError(null)
      try {
        const res = await fetch(`/api/teacher/sparta?id=${program.id}`, { method: 'DELETE' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || '削除に失敗しました')
        await fetchData()
      } catch (err) {
        setError(err instanceof Error ? err.message : '削除に失敗しました')
      } finally {
        setBusyRowId(null)
      }
    },
    [fetchData]
  )

  const openEdit = useCallback((program: Program) => {
    setForm({
      editingId: program.id,
      userId: program.userId,
      deckIds: program.deckIds,
      startDate: program.startDate,
      endDate: program.endDate,
      targetCardCount: program.targetCardCount != null ? String(program.targetCardCount) : '',
      goalMastery: program.goalMastery,
      memo: program.memo || '',
    })
  }, [])

  const { running, finished } = useMemo(() => {
    const running: Program[] = []
    const finished: Program[] = []
    for (const p of programs || []) {
      if (p.progress.phase === 'active' || p.progress.phase === 'upcoming') running.push(p)
      else finished.push(p)
    }
    // 実施中は残り日数が少ない順、終了・中止は終了日が新しい順（APIの並びを維持）
    running.sort((a, b) => a.endDate.localeCompare(b.endDate))
    return { running, finished }
  }, [programs])

  if (authLoading || programs === null) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="h-8 bg-gray-200 rounded w-56 animate-pulse mb-6" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4 h-32 animate-pulse" />
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
          <h1 className="text-2xl font-extrabold text-ai">スパルタの管理</h1>
          <Link
            href="/students/progress"
            className="text-sm text-sora hover:text-sora-dark font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            取組状況
          </Link>
        </div>
        <p className="text-sm text-ink-2 mb-4">
          期間を定めた暗記の取り組みを登録すると、期間内の学習記録から達成状況を自動で集計します。
          生徒の毎日の報告は不要です。報酬の判定・金額は塾長が別途行います。
        </p>

        {error && <div className="bg-again-bg text-again p-3 rounded-2xl mb-4 text-sm">{error}</div>}

        <button
          onClick={() => setForm(emptyForm())}
          className="mb-5 px-4 py-2.5 bg-sora text-white text-sm font-extrabold rounded-2xl hover:bg-sora-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        >
          ＋ スパルタを登録
        </button>

        {/* 実施中・開始前 */}
        <div className="space-y-3">
          {running.length === 0 && (
            <div className="text-center text-ink-2 py-8">実施中のスパルタはありません</div>
          )}
          {running.map(p => (
            <ProgramCard
              key={p.id}
              program={p}
              busy={busyRowId === p.id}
              onEdit={() => openEdit(p)}
              onCancel={() => handleStatusChange(p, 'canceled')}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </div>

        {/* 終了・中止（達成サマリー） */}
        {finished.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowFinished(v => !v)}
              className="flex items-center gap-2 text-sm font-bold text-ink-2 mb-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showFinished ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              終了・中止したスパルタ（{finished.length}）
            </button>
            {showFinished && (
              <div className="space-y-3">
                {finished.map(p => (
                  <ProgramCard
                    key={p.id}
                    program={p}
                    busy={busyRowId === p.id}
                    onEdit={() => openEdit(p)}
                    onResume={
                      p.progress.phase === 'canceled' ? () => handleStatusChange(p, 'active') : undefined
                    }
                    onDelete={() => handleDelete(p)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {form && (
          <SpartaFormModal
            form={form}
            students={students}
            busy={busy}
            onChange={setForm}
            onSubmit={handleSubmit}
            onClose={() => setForm(null)}
          />
        )}
      </div>
    </AppLayout>
  )
}

function ProgramCard({
  program,
  busy,
  onEdit,
  onCancel,
  onResume,
  onDelete,
}: {
  program: Program
  busy: boolean
  onEdit: () => void
  onCancel?: () => void
  onResume?: () => void
  onDelete: () => void
}) {
  const pr = program.progress
  const isFinished = pr.phase === 'ended' || pr.phase === 'canceled'
  // 日々の実施ストリップは直近14日分に絞る（1ヶ月超の期間でも幅が保てる）
  const recentDays = pr.days.slice(-14)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={`/students/progress/${program.userId}`}
            className="font-bold text-ai hover:text-sora truncate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            {program.studentName}
          </Link>
          <span className={`shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full ${PHASE_BADGE[pr.phase]}`}>
            {SPARTA_PHASE_LABEL[pr.phase]}
          </span>
        </div>
        <div className="shrink-0 text-xs text-ink-3 tabular-nums">
          {formatDate(program.startDate)}〜{formatDate(program.endDate)}
          {pr.phase === 'active' && <span className="ml-1 font-bold text-hard">残り{pr.daysRemaining}日</span>}
        </div>
      </div>

      <div className="text-sm text-ink-2 truncate mb-2">{program.deckNames.join('、')}</div>

      {/* 進捗バー */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${pr.progressPct >= 100 ? 'bg-easy' : 'bg-sora'}`}
            style={{ width: `${Math.min(100, pr.progressPct)}%` }}
          />
        </div>
        <div className="shrink-0 text-sm font-extrabold text-ai tabular-nums">
          {pr.achievedInPeriod}/{pr.targetCount}
          <span className="ml-1 text-xs font-bold text-ink-3">({pr.progressPct}%)</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3 mb-2">
        <span>
          習得の基準: <b className="text-ink-2">{GOAL_MASTERY_LABEL[program.goalMastery]}</b>
        </span>
        <span>
          実施 <b className="text-ink-2 tabular-nums">{pr.daysStudied}/{pr.daysElapsed}日</b>
        </span>
        {pr.currentStreak > 0 && (
          <span>
            連続 <b className="text-ink-2 tabular-nums">{pr.currentStreak}日</b>
          </span>
        )}
        {pr.phase === 'active' && (
          <span className={pr.studiedToday ? 'text-good font-bold' : 'text-again font-bold'}>
            {pr.studiedToday ? '今日実施済み' : '今日まだ'}
          </span>
        )}
        {pr.baseline > 0 && <span>開始時習得 {pr.baseline}枚</span>}
      </div>

      {/* 日々の実施ストリップ（直近14日） */}
      {recentDays.length > 0 && (
        <div className="flex items-center gap-1 mb-2" title="日々の実施（直近14日）">
          {recentDays.map(d => (
            <div
              key={d.key}
              className={`w-3.5 h-3.5 rounded ${d.count > 0 ? 'bg-good' : 'bg-gray-200'}`}
              title={`${formatDate(d.key)}: ${d.count > 0 ? `${d.count}回` : '実施なし'}`}
            />
          ))}
        </div>
      )}

      {/* 終了サマリー: 習得度の内訳（報酬判定の材料） */}
      {isFinished && pr.phase === 'ended' && (
        <div className="mt-2 p-3 bg-paper rounded-xl">
          <div className="text-xs font-bold text-ink-2 mb-1.5">
            達成サマリー: 期間の成果 {pr.achievedInPeriod}枚 / 目標 {pr.targetCount}枚（{pr.progressPct}%）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MASTERY_LEVELS.map(level => (
              <span key={level} className={`text-xs font-bold px-2 py-0.5 rounded-full ${MASTERY_CHIP[level]}`}>
                {MASTERY_LABEL[level]} {pr.masteryBreakdown[level]}
              </span>
            ))}
          </div>
        </div>
      )}

      {program.memo && <div className="text-xs text-ink-3 mt-2">メモ: {program.memo}</div>}

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onEdit}
          disabled={busy}
          className="px-3 py-1.5 text-xs font-bold rounded-2xl border text-sora border-sora/40 hover:bg-sora-soft disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        >
          編集
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-bold rounded-2xl border text-again border-again/40 hover:bg-again-bg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            {busy ? '処理中...' : '中止'}
          </button>
        )}
        {onResume && (
          <button
            onClick={onResume}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-bold rounded-2xl border text-good border-good/40 hover:bg-good-bg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            {busy ? '処理中...' : '再開'}
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={busy}
          className="ml-auto px-3 py-1.5 text-xs font-bold rounded-2xl text-ink-3 hover:text-again hover:bg-again-bg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        >
          削除
        </button>
      </div>
    </div>
  )
}

function SpartaFormModal({
  form,
  students,
  busy,
  onChange,
  onSubmit,
  onClose,
}: {
  form: FormState
  students: StudentOption[]
  busy: boolean
  onChange: (f: FormState) => void
  onSubmit: () => void
  onClose: () => void
}) {
  const [deckOptions, setDeckOptions] = useState<DeckOption[] | null>(null)
  const [deckError, setDeckError] = useState<string | null>(null)

  // 生徒を選ぶと、その生徒が学習できるルートデッキの選択肢を読み込む
  useEffect(() => {
    if (!form.userId) {
      setDeckOptions(null)
      return
    }
    let stale = false
    setDeckOptions(null)
    setDeckError(null)
    fetch(`/api/teacher/sparta?options=${form.userId}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'デッキ一覧の取得に失敗しました')
        if (!stale) setDeckOptions(data.decks)
      })
      .catch(err => {
        if (!stale) {
          setDeckError(err instanceof Error ? err.message : 'デッキ一覧の取得に失敗しました')
          setDeckOptions([])
        }
      })
    return () => {
      stale = true
    }
  }, [form.userId])

  const toggleDeck = (deckId: string) => {
    const next = form.deckIds.includes(deckId)
      ? form.deckIds.filter(d => d !== deckId)
      : [...form.deckIds, deckId]
    onChange({ ...form, deckIds: next })
  }

  const canSubmit =
    form.userId !== '' &&
    form.deckIds.length > 0 &&
    form.startDate !== '' &&
    form.endDate !== '' &&
    form.endDate >= form.startDate &&
    (form.targetCardCount === '' || Number(form.targetCardCount) >= 1)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-extrabold text-ai mb-4">
          {form.editingId ? 'スパルタを編集' : 'スパルタを登録'}
        </h2>

        <div className="space-y-4">
          {/* 生徒 */}
          <div>
            <label className="block text-sm font-bold text-ink-2 mb-1">生徒</label>
            <select
              value={form.userId}
              onChange={e => onChange({ ...form, userId: e.target.value, deckIds: [] })}
              disabled={form.editingId !== null}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-sora focus:ring-2 focus:ring-sora disabled:bg-gray-50 disabled:text-ink-3"
            >
              <option value="">選択してください</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* 対象デッキ */}
          <div>
            <label className="block text-sm font-bold text-ink-2 mb-1">
              対象デッキ（1つ以上・サブデッキは親デッキに含まれます）
            </label>
            {!form.userId ? (
              <div className="text-xs text-ink-3 py-2">先に生徒を選んでください</div>
            ) : deckOptions === null ? (
              <div className="text-xs text-ink-3 py-2">読み込み中...</div>
            ) : deckError ? (
              <div className="text-xs text-again py-2">{deckError}</div>
            ) : deckOptions.length === 0 ? (
              <div className="text-xs text-ink-3 py-2">この生徒が学習できるデッキがありません</div>
            ) : (
              <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50">
                {deckOptions.map(d => (
                  <label key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-paper">
                    <input
                      type="checkbox"
                      checked={form.deckIds.includes(d.id)}
                      onChange={() => toggleDeck(d.id)}
                      className="rounded border-gray-300"
                    />
                    <span className="truncate">{d.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 期間 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-ink-2 mb-1">開始日</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => onChange({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-sora focus:ring-2 focus:ring-sora"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-ink-2 mb-1">終了日</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => onChange({ ...form, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-sora focus:ring-2 focus:ring-sora"
              />
            </div>
          </div>

          {/* 目標 */}
          <div>
            <label className="block text-sm font-bold text-ink-2 mb-1">目標カード数</label>
            <input
              type="number"
              min={1}
              placeholder="空欄 = 対象デッキ全部"
              value={form.targetCardCount}
              onChange={e => onChange({ ...form, targetCardCount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-sora focus:ring-2 focus:ring-sora"
            />
            <p className="text-xs text-ink-3 mt-1">目安: 1ヶ月1,000語。空欄なら対象デッキの全カード習得が目標になります</p>
          </div>

          {/* 習得の基準 */}
          <div>
            <label className="block text-sm font-bold text-ink-2 mb-1">習得と数える基準</label>
            <select
              value={form.goalMastery}
              onChange={e => onChange({ ...form, goalMastery: e.target.value as SpartaGoalMastery })}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-sora focus:ring-2 focus:ring-sora"
            >
              <option value="stable">{GOAL_MASTERY_LABEL.stable}（おすすめ）</option>
              <option value="mastered">{GOAL_MASTERY_LABEL.mastered}</option>
            </select>
            <p className="text-xs text-ink-3 mt-1">
              単語帳の定着度と同じ基準です。1ヶ月の取り組みでは「定着中以上」が現実的です
            </p>
          </div>

          {/* メモ */}
          <div>
            <label className="block text-sm font-bold text-ink-2 mb-1">メモ（任意）</label>
            <textarea
              value={form.memo}
              onChange={e => onChange({ ...form, memo: e.target.value })}
              rows={2}
              placeholder="コーチングで決めた条件など"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-sora focus:ring-2 focus:ring-sora"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-bold text-ink-2 rounded-2xl hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            キャンセル
          </button>
          <button
            onClick={onSubmit}
            disabled={busy || !canSubmit}
            className="px-5 py-2 text-sm font-extrabold text-white bg-sora rounded-2xl hover:bg-sora-dark disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            {busy ? '保存中...' : form.editingId ? '保存' : '登録'}
          </button>
        </div>
      </div>
    </div>
  )
}
