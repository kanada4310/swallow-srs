'use client'

/**
 * 構文の書き込み（タップ入力）の共通部品。
 *
 * 単語の上をタップ→品詞、下をタップ→働き。まとまりはボタンを押してから最初と最後の単語をタップ。
 * 「構文の練習」（/reading/syntax）と読解1文画面の「構文を分析する」の両方で使う。
 * 採点マーク（構文の練習の正解表照合）は任意プロパティで、無ければ普通の入力欄として振る舞う。
 */

import { useMemo, useState } from 'react'
import {
  isPunct,
  POS_OPTIONS,
  ROLE_OPTIONS,
  SPAN_TYPES,
  type Mark,
  type MarkResult,
  type SpanType,
  type StudentSpan,
  type SyntaxAnswer,
} from '@/lib/reading/syntax'

type Picker = { kind: 'pos' | 'role'; index: number } | null

interface SyntaxAnnotatorProps {
  tokens: string[]
  answer: SyntaxAnswer
  onChange: (next: SyntaxAnswer) => void
  posMarks?: Record<number, MarkResult>
  roleMarks?: Record<number, MarkResult>
  spanMarks?: Record<number, Mark>
  disabled?: boolean
}

export function SyntaxAnnotator({
  tokens,
  answer,
  onChange,
  posMarks,
  roleMarks,
  spanMarks,
  disabled,
}: SyntaxAnnotatorProps) {
  const [pendingSpan, setPendingSpan] = useState<SpanType | null>(null)
  const [pendingFrom, setPendingFrom] = useState<number | null>(null)
  const [picker, setPicker] = useState<Picker>(null)

  const setSlot = (kind: 'pos' | 'role', index: number, value: string | null) => {
    const next = { ...answer, [kind]: [...answer[kind]] } as SyntaxAnswer
    next[kind][index] = value
    onChange(next)
  }

  const onWordClick = (i: number) => {
    if (disabled || !pendingSpan) return
    if (pendingFrom === null) {
      setPendingFrom(i)
      return
    }
    const from = Math.min(pendingFrom, i)
    const to = Math.max(pendingFrom, i)
    if (!answer.spans.some((s) => s.from === from && s.to === to && s.type === pendingSpan)) {
      onChange({ ...answer, spans: [...answer.spans, { from, to, type: pendingSpan }] })
    }
    setPendingSpan(null)
    setPendingFrom(null)
  }

  const removeSpan = (idx: number) => {
    if (disabled) return
    onChange({ ...answer, spans: answer.spans.filter((_, i) => i !== idx) })
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
    <div>
      {/* まとまりのボタン */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {(Object.keys(SPAN_TYPES) as SpanType[]).map((t) => (
          <button
            key={t}
            type="button"
            disabled={disabled}
            onClick={() => {
              setPendingSpan(pendingSpan === t ? null : t)
              setPendingFrom(null)
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-40 ${
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
          {tokens.map((tok, i) => (
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
                  mark={posMarks?.[i]?.mark}
                  onClick={() => !disabled && setPicker({ kind: 'pos', index: i })}
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
                    mark={roleMarks?.[i]?.mark}
                    onClick={() => !disabled && setPicker({ kind: 'role', index: i })}
                  />
                )}
                {(posMarks || roleMarks) &&
                  (posMarks?.[i]?.mark === 'bad' || roleMarks?.[i]?.mark === 'bad') && (
                    <span className="mt-0.5 whitespace-nowrap text-[10px] text-again">
                      →{' '}
                      {[
                        posMarks?.[i]?.mark === 'bad' ? `品詞:${posMarks[i]?.correct}` : null,
                        roleMarks?.[i]?.mark === 'bad' ? `働き:${roleMarks[i]?.correct}` : null,
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
            const mark = spanMarks?.[idx]
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
                {tokens.slice(s.from, s.to + 1).join(' ')}
                <button type="button" onClick={() => removeSpan(idx)} aria-label="このまとまりを消す">
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* 品詞・働きの選択 */}
      {picker && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setPicker(null)}
        >
          <div
            className="w-full rounded-t-card bg-white p-4 shadow-card sm:max-w-sm sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-sm font-bold text-ai">
              「{tokens[picker.index]}」の{picker.kind === 'pos' ? '品詞' : '働き'}
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
    </div>
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
