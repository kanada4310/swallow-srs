'use client'

/**
 * 構文の素振り — 1文の品詞（上）と働き（下）を書き込んで採点する練習。
 *
 * 工房の構文分析アプリの練習3問をそのまま移した。曖昧な箇所は △（許容解）で受理する。
 * 長文そのものの構文採点はしない（第1弾の範囲外。正規形の検収待ちに列を足さないため）。
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  emptyAnswer,
  gradeSyntax,
  isPunct,
  modelAnswer,
  POS_OPTIONS,
  ROLE_OPTIONS,
  SPAN_TYPES,
  SYNTAX_PROBLEMS,
  type Mark,
  type SpanType,
  type StudentSpan,
  type SyntaxAnswer,
  type SyntaxGrade,
} from '@/lib/reading/syntax'

type Picker = { kind: 'pos' | 'role'; index: number } | null

export default function SyntaxDrillPage() {
  const [problemIdx, setProblemIdx] = useState(0)
  const problem = SYNTAX_PROBLEMS[problemIdx]
  const [answer, setAnswer] = useState<SyntaxAnswer>(() => emptyAnswer(SYNTAX_PROBLEMS[0]))
  const [grade, setGrade] = useState<SyntaxGrade | null>(null)
  const [pendingSpan, setPendingSpan] = useState<SpanType | null>(null)
  const [pendingFrom, setPendingFrom] = useState<number | null>(null)
  const [picker, setPicker] = useState<Picker>(null)

  const load = (idx: number) => {
    setProblemIdx(idx)
    setAnswer(emptyAnswer(SYNTAX_PROBLEMS[idx]))
    setGrade(null)
    setPendingSpan(null)
    setPendingFrom(null)
    setPicker(null)
  }

  const clearGrade = () => setGrade(null)

  const setSlot = (kind: 'pos' | 'role', index: number, value: string | null) => {
    setAnswer((prev) => {
      const next = { ...prev, [kind]: [...prev[kind]] } as SyntaxAnswer
      next[kind][index] = value
      return next
    })
    clearGrade()
  }

  const onWordClick = (i: number) => {
    if (!pendingSpan) return
    if (pendingFrom === null) {
      setPendingFrom(i)
      return
    }
    const from = Math.min(pendingFrom, i)
    const to = Math.max(pendingFrom, i)
    setAnswer((prev) =>
      prev.spans.some((s) => s.from === from && s.to === to && s.type === pendingSpan)
        ? prev
        : { ...prev, spans: [...prev.spans, { from, to, type: pendingSpan }] }
    )
    setPendingSpan(null)
    setPendingFrom(null)
    clearGrade()
  }

  const removeSpan = (idx: number) => {
    setAnswer((prev) => ({ ...prev, spans: prev.spans.filter((_, i) => i !== idx) }))
    clearGrade()
  }

  const brackets = useMemo(() => {
    const opens: Record<number, StudentSpan[]> = {}
    const closes: Record<number, StudentSpan[]> = {}
    answer.spans.forEach((s) => {
      if (s.type === 'ul') return
      ;(opens[s.from] = opens[s.from] || []).push(s)
      ;(closes[s.to] = closes[s.to] || []).push(s)
    })
    return { opens, closes }
  }, [answer.spans])

  const underlined = (i: number) =>
    answer.spans.some((s) => s.type === 'ul' && i >= s.from && i <= s.to)

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <Link href="/reading" className="text-xs font-semibold text-sora-dark">
          ← 読解の一覧
        </Link>
        <h1 className="mb-1 mt-1 text-2xl font-extrabold text-ai">構文の素振り</h1>
        <p className="mb-4 text-sm leading-relaxed text-ink-2">
          単語の<b>上をタップ→品詞</b>、<b>下をタップ→働き</b>（S・V・O・C・M など）。
          まとまりは下のボタンを押してから、最初の単語→最後の単語の順にタップします。
        </p>

        <div className="mb-3 rounded-card border border-gray-200 bg-white p-3 shadow-card">
          <label className="mb-1 block text-xs font-bold text-ink-3">問題</label>
          <select
            value={problemIdx}
            onChange={(e) => load(Number(e.target.value))}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
          >
            {SYNTAX_PROBLEMS.map((p, i) => (
              <option key={p.id} value={i}>
                {p.title}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-3">{problem.source}</p>
        </div>

        {/* まとまりのボタン */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(Object.keys(SPAN_TYPES) as SpanType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setPendingSpan(pendingSpan === t ? null : t)
                setPendingFrom(null)
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                pendingSpan === t ? 'bg-sora text-white' : 'border border-gray-300 bg-white text-ai'
              }`}
            >
              {SPAN_TYPES[t].label}
            </button>
          ))}
        </div>
        {pendingSpan && (
          <p className="mb-2 rounded-xl bg-sora-soft p-2.5 text-xs font-bold text-ai">
            {pendingFrom === null
              ? `「${SPAN_TYPES[pendingSpan].label}」: まとまりの【最初の単語】をタップ`
              : `「${SPAN_TYPES[pendingSpan].label}」: まとまりの【最後の単語】をタップ（同じ単語ならその1語だけ）`}
          </p>
        )}

        {/* 本文 */}
        <div className="mb-3 overflow-x-auto rounded-card border border-gray-200 bg-white p-3 shadow-card">
          <div className="flex min-w-max items-end gap-1">
            {problem.tokens.map((tok, i) => (
              <div key={i} className="flex items-end">
                {(brackets.opens[i] || [])
                  .slice()
                  .sort((a, b) => b.to - b.from - (a.to - a.from))
                  .map((s, n) => (
                    <span key={`o${n}`} className="pb-6 text-lg font-bold text-ai-soft">
                      {SPAN_TYPES[s.type].open}
                    </span>
                  ))}

                <div className="flex flex-col items-center">
                  <Cell
                    value={answer.pos[i]}
                    mark={grade?.posMark[i]?.mark}
                    onClick={() => setPicker({ kind: 'pos', index: i })}
                  />
                  <button
                    type="button"
                    onClick={() => onWordClick(i)}
                    className={[
                      'whitespace-nowrap px-1 py-0.5 font-serif text-lg',
                      underlined(i) ? 'border-b-[3px] border-ink' : 'border-b-[3px] border-transparent',
                      pendingFrom === i ? 'rounded bg-sora-soft' : '',
                    ].join(' ')}
                  >
                    {tok}
                  </button>
                  {isPunct(tok) ? (
                    <span className="h-6" />
                  ) : (
                    <Cell
                      value={answer.role[i]}
                      mark={grade?.roleMark[i]?.mark}
                      onClick={() => setPicker({ kind: 'role', index: i })}
                    />
                  )}
                  {grade && (grade.posMark[i]?.mark === 'bad' || grade.roleMark[i]?.mark === 'bad') && (
                    <span className="mt-0.5 whitespace-nowrap text-[10px] text-again">
                      →{' '}
                      {[
                        grade.posMark[i]?.mark === 'bad' ? `品詞:${grade.posMark[i]?.correct}` : null,
                        grade.roleMark[i]?.mark === 'bad' ? `働き:${grade.roleMark[i]?.correct}` : null,
                      ]
                        .filter(Boolean)
                        .join(' / ')}
                    </span>
                  )}
                </div>

                {(brackets.closes[i] || [])
                  .slice()
                  .sort((a, b) => a.to - a.from - (b.to - b.from))
                  .map((s, n) => (
                    <span key={`c${n}`} className="pb-6 text-lg font-bold text-ai-soft">
                      {SPAN_TYPES[s.type].close}
                    </span>
                  ))}
              </div>
            ))}
          </div>
        </div>

        {/* まとまり一覧 */}
        {answer.spans.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {answer.spans.map((s, idx) => {
              const mark = grade?.spanMark[idx]
              const tone =
                mark === 'ok'
                  ? 'bg-good-bg border-good text-good'
                  : mark === 'alt'
                    ? 'bg-hard-bg border-hard text-hard'
                    : mark === 'bad'
                      ? 'bg-again-bg border-again text-again'
                      : 'bg-white border-gray-300 text-ink-2'
              return (
                <span
                  key={idx}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${tone}`}
                >
                  <b>{SPAN_TYPES[s.type].short}</b>
                  {problem.tokens.slice(s.from, s.to + 1).join(' ')}
                  <button type="button" onClick={() => removeSpan(idx)} aria-label="このまとまりを消す">
                    ×
                  </button>
                </span>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGrade(gradeSyntax(problem, answer))}
            className="flex-1 rounded-xl bg-nodo px-4 py-3 text-base font-bold text-white"
          >
            採点する
          </button>
          <button
            type="button"
            onClick={() => load(problemIdx)}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-ai"
          >
            リセット
          </button>
          <button
            type="button"
            onClick={() => {
              const m = modelAnswer(problem)
              setAnswer(m)
              setGrade(gradeSyntax(problem, m))
            }}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-ai"
          >
            正解を表示
          </button>
        </div>

        {grade && (
          <div className="mt-4 space-y-2 border-t border-gray-200 pt-4">
            <p className="text-lg font-extrabold text-ai">
              得点: <span className="text-sora-dark">{grade.got} / {grade.total}（{grade.percent}%）</span>
            </p>
            {grade.feedback.length === 0 ? (
              <p className="rounded-xl bg-good-bg p-2.5 text-sm text-good">全項目正解です。</p>
            ) : (
              grade.feedback.map((f, i) => (
                <p
                  key={i}
                  className={`rounded-xl p-2.5 text-sm ${
                    f.tone === 'ok'
                      ? 'bg-good-bg text-good'
                      : f.tone === 'alt'
                        ? 'bg-hard-bg text-hard'
                        : 'bg-again-bg text-again'
                  }`}
                >
                  {f.text}
                </p>
              ))
            )}
            {problem.key.notes.length > 0 && (
              <div className="rounded-xl bg-sora-soft p-3 text-sm text-ai">
                <p className="mb-1 font-bold">この文の分析ポイント・曖昧箇所</p>
                {problem.key.notes.map((n, i) => (
                  <p key={i}>・{n}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 品詞・働きの選択 */}
      {picker && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setPicker(null)}
        >
          <div
            className="w-full rounded-t-card bg-white p-4 shadow-card sm:max-w-sm sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-sm font-bold text-ai">
              「{problem.tokens[picker.index]}」の{picker.kind === 'pos' ? '品詞' : '働き'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(picker.kind === 'pos' ? POS_OPTIONS : ROLE_OPTIONS).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => {
                    setSlot(picker.kind, picker.index, o)
                    setPicker(null)
                  }}
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-ai"
                >
                  {o}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSlot(picker.kind, picker.index, null)
                  setPicker(null)
                }}
                className="rounded-xl border border-again bg-white px-3 py-2 text-sm font-bold text-again"
              >
                消す
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

function Cell({
  value,
  mark,
  onClick,
}: {
  value: string | null
  mark?: Mark
  onClick: () => void
}) {
  const tone =
    mark === 'ok'
      ? 'bg-good-bg text-good font-bold'
      : mark === 'alt'
        ? 'bg-hard-bg text-hard font-bold'
        : mark === 'bad'
          ? 'bg-again-bg text-again font-bold line-through'
          : value
            ? 'text-sora-dark'
            : 'text-gray-300'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-6 min-w-[2.2rem] rounded px-1 text-xs ${tone}`}
    >
      {value || '＋'}
    </button>
  )
}
