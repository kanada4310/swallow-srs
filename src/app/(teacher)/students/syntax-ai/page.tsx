'use client'

/**
 * 講師向け「構文AIの管理」ページ。
 *
 * 試行の枠（上限月3,000円・対象生徒2〜3人・期間1ヶ月）の操作と、使用額の見える化。
 * - 今月の使用額・判定/問答の回数・生徒別内訳（1文あたりの往復数の実測）
 * - 許可生徒の選択（最大3人）・期間の開始/停止・モデル変更・上限額
 * 設定の実体はサーバの syntax_ai_config（変更はこの画面→ /api/teacher/syntax-ai 経由のみ）。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { MODEL_OPTIONS } from '@/lib/syntax-ai/pricing'

interface StudentUsageRow {
  userId: string
  name: string
  allowed: boolean
  judgeCount: number
  dialogueCount: number
  sentenceCount: number
  costYen: number
}

interface TeacherSyntaxAiData {
  config: {
    enabled: boolean
    allowedUserIds: string[]
    startsAt: string | null
    endsAt: string | null
    monthlyCapYen: number
    model: string
  }
  maxAllowedStudents: number
  maxCapYen: number
  month: {
    spentYen: number
    judgeCount: number
    dialogueCount: number
    tokens: { input: number; output: number; cacheWrite: number; cacheRead: number }
  }
  totalSpentYen: number
  students: StudentUsageRow[]
  studentOptions: Array<{ id: string; name: string }>
}

function fmtDate(iso: string | null): string {
  if (!iso) return '未設定'
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function SyntaxAiAdminPage() {
  const { profile, isLoading: authLoading } = useAuth()
  const [data, setData] = useState<TeacherSyntaxAiData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tableMissing, setTableMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // 編集中の設定（保存で確定）
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [capYen, setCapYen] = useState(3000)
  const [studentQuery, setStudentQuery] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/teacher/syntax-ai')
      const body = await res.json().catch(() => ({}))
      if (res.status === 503 && body.code === 'TABLE_MISSING') {
        setTableMissing(true)
        setData(null)
        return
      }
      if (!res.ok) throw new Error(body.error || '取得に失敗しました')
      const d = body as TeacherSyntaxAiData
      setData(d)
      setSelectedIds(d.config.allowedUserIds)
      setModel(d.config.model)
      setCapYen(d.config.monthlyCapYen)
      setTableMissing(false)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました')
    }
  }, [])

  useEffect(() => {
    if (!profile || profile.role === 'student') return
    fetchData()
  }, [profile, fetchData])

  const put = useCallback(
    async (patch: Record<string, unknown>, doneMessage: string) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const res = await fetch('/api/teacher/syntax-ai', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || '保存に失敗しました')
        setNotice(doneMessage)
        await fetchData()
      } catch (err) {
        setError(err instanceof Error ? err.message : '保存に失敗しました')
      } finally {
        setBusy(false)
      }
    },
    [fetchData]
  )

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (data && prev.length >= data.maxAllowedStudents) return prev
      return [...prev, id]
    })
  }

  const filteredOptions = useMemo(() => {
    if (!data) return []
    const q = studentQuery.toLowerCase()
    return data.studentOptions.filter(
      (s) => selectedIds.includes(s.id) || !q || s.name.toLowerCase().includes(q)
    )
  }, [data, studentQuery, selectedIds])

  if (authLoading || (!data && !tableMissing && !error)) {
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
      <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-extrabold text-ai">構文AIの管理</h1>
          <Link
            href="/students/progress"
            className="text-sm text-sora hover:text-sora-dark font-bold"
          >
            取組状況
          </Link>
        </div>
        <p className="text-sm text-ink-2 mb-4">
          読解ページの構文AI判定・添削問答の試行の枠（上限月{data?.config.monthlyCapYen ?? 3000}円・
          対象生徒{data?.maxAllowedStudents ?? 3}人まで・期間1ヶ月）をここで管理します。
          上限・期間・許可一覧はサーバ側で毎回検査され、外れた生徒には入口が表示されません。
        </p>

        {tableMissing && (
          <div className="bg-hard-bg text-hard p-3 rounded-2xl mb-4 text-sm">
            設定の置き場所（マイグレーション025）がまだデータベースに用意されていません。適用後に使えます。
          </div>
        )}
        {error && <div className="bg-again-bg text-again p-3 rounded-2xl mb-4 text-sm">{error}</div>}
        {notice && <div className="bg-good-bg text-good p-3 rounded-2xl mb-4 text-sm">{notice}</div>}

        {data && (
          <>
            {/* 今月の使用状況 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-3 text-center">
                <div className="text-2xl font-extrabold text-ai tabular-nums">
                  {Math.round(data.month.spentYen)}円
                </div>
                <div className="text-xs text-ink-3">今月の使用額（上限 {data.config.monthlyCapYen}円）</div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-3 text-center">
                <div className="text-2xl font-extrabold text-ai tabular-nums">{data.month.judgeCount}</div>
                <div className="text-xs text-ink-3">AI判定の回数</div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-3 text-center">
                <div className="text-2xl font-extrabold text-ai tabular-nums">{data.month.dialogueCount}</div>
                <div className="text-xs text-ink-3">問答の往復数</div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-3 text-center">
                <div className="text-2xl font-extrabold text-ai tabular-nums">
                  {Math.round(data.totalSpentYen)}円
                </div>
                <div className="text-xs text-ink-3">累計の使用額</div>
              </div>
            </div>

            {/* 試行の開始・停止 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-ai">試行の状態</h2>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    data.config.enabled ? 'bg-good-bg text-good' : 'bg-gray-100 text-ink-3'
                  }`}
                >
                  {data.config.enabled ? '動作中' : '停止中'}
                </span>
              </div>
              <p className="text-sm text-ink-2 mb-3">
                期間: {fmtDate(data.config.startsAt)} 〜 {fmtDate(data.config.endsAt)}
                （期間外・上限到達時は自動で受付を止めます）
              </p>
              <div className="flex flex-wrap gap-2">
                {!data.config.enabled ? (
                  <button
                    disabled={busy}
                    onClick={() => {
                      const now = new Date()
                      const end = new Date(now)
                      end.setMonth(end.getMonth() + 1)
                      put(
                        {
                          enabled: true,
                          startsAt: now.toISOString(),
                          endsAt: end.toISOString(),
                        },
                        '試行を開始しました（期間は今日から1ヶ月）'
                      )
                    }}
                    className="px-4 py-2.5 rounded-xl bg-sora text-white text-sm font-bold disabled:opacity-50"
                  >
                    試行を開始する（今日から1ヶ月）
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => put({ enabled: false }, '試行を停止しました')}
                    className="px-4 py-2.5 rounded-xl border border-again text-again text-sm font-bold disabled:opacity-50"
                  >
                    いますぐ停止する
                  </button>
                )}
              </div>
            </div>

            {/* 設定 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
              <h2 className="font-bold text-ai mb-3">設定</h2>

              <label className="block text-xs font-bold text-ink-3 mb-1">
                対象の生徒（最大{data.maxAllowedStudents}人・選ばれた生徒だけにAIの入口が表示されます）
              </label>
              <input
                type="text"
                placeholder="生徒名で絞り込み..."
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                className="w-full mb-2 px-3 py-2 border border-gray-300 rounded-xl text-sm"
              />
              <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50 mb-3">
                {filteredOptions.map((s) => {
                  const checked = selectedIds.includes(s.id)
                  const full = !checked && selectedIds.length >= data.maxAllowedStudents
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-2 px-3 py-2 text-sm ${
                        full ? 'text-ink-3' : 'text-ink cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={full}
                        onChange={() => toggleStudent(s.id)}
                      />
                      {s.name}
                    </label>
                  )
                })}
                {filteredOptions.length === 0 && (
                  <p className="px-3 py-2 text-sm text-ink-3">該当する生徒がいません</p>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-bold text-ink-3 mb-1">使うモデル</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-3 mb-1">
                    月の上限額（円・最大{data.maxCapYen}円）
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={data.maxCapYen}
                    value={capYen}
                    onChange={(e) => setCapYen(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                  />
                </div>
              </div>

              <button
                disabled={busy}
                onClick={() =>
                  put(
                    { allowedUserIds: selectedIds, model, monthlyCapYen: capYen },
                    '設定を保存しました'
                  )
                }
                className="w-full px-4 py-2.5 rounded-xl bg-nodo text-white text-sm font-bold disabled:opacity-50"
              >
                設定を保存する
              </button>
            </div>

            {/* 生徒別の実測（今月） */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h2 className="font-bold text-ai mb-1">生徒別の実測（今月）</h2>
              <p className="text-xs text-ink-3 mb-3">
                「1文あたりの往復」= 問答の往復数 ÷ AIを使った文の数。本導入判断の材料になります。
              </p>
              {data.students.length === 0 ? (
                <p className="text-sm text-ink-2 py-4 text-center">まだ利用がありません</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-ink-3 border-b border-gray-100">
                        <th className="text-left py-2 pr-2">生徒</th>
                        <th className="text-right py-2 px-2">判定</th>
                        <th className="text-right py-2 px-2">問答</th>
                        <th className="text-right py-2 px-2">文の数</th>
                        <th className="text-right py-2 px-2">1文あたり往復</th>
                        <th className="text-right py-2 pl-2">費用</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.students.map((s) => (
                        <tr key={s.userId} className="border-b border-gray-50">
                          <td className="py-2 pr-2">
                            {s.name}
                            {s.allowed && (
                              <span className="ml-1.5 text-[10px] font-bold text-good bg-good-bg px-1.5 py-0.5 rounded">
                                対象
                              </span>
                            )}
                          </td>
                          <td className="text-right py-2 px-2 tabular-nums">{s.judgeCount}</td>
                          <td className="text-right py-2 px-2 tabular-nums">{s.dialogueCount}</td>
                          <td className="text-right py-2 px-2 tabular-nums">{s.sentenceCount}</td>
                          <td className="text-right py-2 px-2 tabular-nums">
                            {s.sentenceCount > 0
                              ? (s.dialogueCount / s.sentenceCount).toFixed(1)
                              : '--'}
                          </td>
                          <td className="text-right py-2 pl-2 tabular-nums">
                            {s.costYen.toFixed(1)}円
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
