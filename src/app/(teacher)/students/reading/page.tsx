'use client'

/**
 * 講師向け「読解の取組状況」。
 *
 * 誰が・どの講を・どこまで進めたか。ヒントを何段まで使ったか（自力／場所／手がかり語／開示）。
 * 「自力」が増えていくかどうかが、切れ目を見つける力が伸びているかの目安になる。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { describeStep, type ProgressSummary } from '@/lib/reading/progress'

interface StudentRow {
  userId: string
  name: string
  lessons: Array<{ lessonId: string; summary: ProgressSummary }>
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return '今日'
  if (days === 1) return '昨日'
  if (days < 30) return `${days}日前`
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function TeacherReadingProgressPage() {
  const { profile, isLoading: authLoading } = useAuth()
  const [students, setStudents] = useState<StudentRow[] | null>(null)
  const [tableMissing, setTableMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/teacher/reading-progress')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || '取得に失敗しました')
      }
      const body = await res.json()
      setStudents(body.students ?? [])
      setTableMissing(!!body.tableMissing)
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

  const filtered = useMemo(() => {
    if (!students) return null
    const q = query.trim()
    if (!q) return students
    return students.filter((s) => s.name.includes(q))
  }, [students, query])

  if (authLoading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="h-48 animate-pulse rounded-card bg-gray-200" />
        </div>
      </AppLayout>
    )
  }

  if (profile && profile.role === 'student') {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-4 py-6">
          <p className="rounded-card border border-gray-200 bg-white p-5 text-sm text-ink-2 shadow-card">
            この画面は講師用です。
          </p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Link href="/students/progress" className="text-xs font-semibold text-sora-dark">
          ← 生徒の取組状況
        </Link>
        <h1 className="mb-1 mt-1 text-2xl font-extrabold text-ai">読解の取組状況</h1>
        <p className="mb-4 text-sm leading-relaxed text-ink-2">
          誰がどの講をどこまで進めたか、ヒントをどこまで使ったかが分かります。
          「自力」が増えていくことが、切れ目を自分で見つけられるようになった証拠です。
        </p>

        {tableMissing && (
          <div className="mb-4 rounded-card border border-hard bg-hard-bg p-4 text-sm leading-relaxed text-ink">
            まだ生徒の作業を集める置き場所が用意されていません。
            用意されるまでは、生徒の入力はその端末の中にだけ残ります（消えません）。
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-card border border-again bg-again-bg p-4 text-sm text-again">
            {error}
          </div>
        )}

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="生徒の名前で絞り込む"
          className="mb-4 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
        />

        {!filtered ? (
          <div className="h-48 animate-pulse rounded-card bg-gray-200" />
        ) : filtered.length === 0 ? (
          <p className="rounded-card border border-gray-200 bg-white p-5 text-sm text-ink-2 shadow-card">
            {tableMissing
              ? '（置き場所が用意されると、ここに一覧が出ます）'
              : 'まだ読解に取り組んだ生徒はいません。'}
          </p>
        ) : (
          <div className="space-y-4">
            {filtered.map((s) => (
              <section
                key={s.userId}
                className="rounded-card border border-gray-200 bg-white p-4 shadow-card"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-base font-extrabold text-ai">{s.name}</h2>
                  <Link
                    href={`/students/progress/${s.userId}`}
                    className="text-xs font-semibold text-sora-dark"
                  >
                    カードの学習を見る →
                  </Link>
                </div>

                <div className="space-y-2">
                  {s.lessons.map((l) => {
                    const key = `${s.userId}:${l.lessonId}`
                    const sum = l.summary
                    const open = openKey === key
                    return (
                      <div key={key} className="rounded-2xl border border-gray-200">
                        <button
                          type="button"
                          onClick={() => setOpenKey(open ? null : key)}
                          className="w-full p-3 text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0">
                              <span className="block text-sm font-bold text-ink">{l.lessonId}</span>
                              <span className="mt-0.5 block text-xs text-ink-2">
                                {describeStep(sum)} ・ 必須の切れ目 {sum.cutsFound}/{sum.requiredCutsTotal}
                              </span>
                            </span>
                            <span
                              className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                sum.completed ? 'bg-good-bg text-good' : 'bg-hard-bg text-hard'
                              }`}
                            >
                              {sum.completed ? '終了' : '作業中'}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                            <Chip tone="good">自力 {sum.hints.self}</Chip>
                            <Chip tone="neutral">場所 {sum.hints.para + sum.hints.sentence}</Chip>
                            <Chip tone="hard">手がかり語 {sum.hints.cue}</Chip>
                            <Chip tone="again">開示 {sum.hints.reveal}</Chip>
                            <Chip tone="neutral">最終 {formatWhen(sum.updatedAt)}</Chip>
                          </div>
                        </button>

                        {open && (
                          <div className="border-t border-gray-100 p-3">
                            <div className="-mx-1 overflow-x-auto">
                              <table className="w-full min-w-[24rem] border-collapse text-xs">
                                <thead>
                                  <tr className="bg-paper text-ink-2">
                                    <th className="border border-gray-200 px-2 py-1 text-left">段落</th>
                                    <th className="border border-gray-200 px-2 py-1">必須</th>
                                    <th className="border border-gray-200 px-2 py-1">自力</th>
                                    <th className="border border-gray-200 px-2 py-1">場所</th>
                                    <th className="border border-gray-200 px-2 py-1">語</th>
                                    <th className="border border-gray-200 px-2 py-1">開示</th>
                                    <th className="border border-gray-200 px-2 py-1">試行</th>
                                    <th className="border border-gray-200 px-2 py-1">大意</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sum.paragraphs.map((p) => (
                                    <tr key={p.paraNo} className="text-center">
                                      <td className="border border-gray-200 px-2 py-1 text-left font-bold text-ai">
                                        ¶{p.paraNo}
                                      </td>
                                      <td className="border border-gray-200 px-2 py-1">{p.requiredCuts}</td>
                                      <td className="border border-gray-200 px-2 py-1 font-bold text-good">
                                        {p.hints.self}
                                      </td>
                                      <td className="border border-gray-200 px-2 py-1">
                                        {p.hints.para + p.hints.sentence}
                                      </td>
                                      <td className="border border-gray-200 px-2 py-1">{p.hints.cue}</td>
                                      <td className="border border-gray-200 px-2 py-1 text-again">
                                        {p.hints.reveal}
                                      </td>
                                      <td className="border border-gray-200 px-2 py-1">{p.attempts}</td>
                                      <td className="border border-gray-200 px-2 py-1">
                                        {p.gistsWritten}/{p.gistsTotal}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
                              「場所」は段落・文の位置を教えた回数、「語」は手がかり語まで、
                              「開示」は答えまで見た回数です。試行は判定を押した回数です。
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function Chip({
  tone,
  children,
}: {
  tone: 'good' | 'hard' | 'again' | 'neutral'
  children: React.ReactNode
}) {
  const cls =
    tone === 'good'
      ? 'bg-good-bg text-good'
      : tone === 'hard'
        ? 'bg-hard-bg text-hard'
        : tone === 'again'
          ? 'bg-again-bg text-again'
          : 'bg-gray-100 text-ink-2'
  return <span className={`rounded-full px-2 py-0.5 font-bold ${cls}`}>{children}</span>
}
