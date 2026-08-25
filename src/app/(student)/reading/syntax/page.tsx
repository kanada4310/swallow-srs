'use client'

/**
 * 構文の練習 — 1文の品詞（上）と働き（下）を書き込んで採点する練習。
 *
 * 入力は2方式:
 * - ペン方式（既定）: 英文の上にペンで括弧・下線・○・文字を直接書く（実現可能性検証の試作）
 * - タップ方式: 従来のボタン→単語タップ。ペンの無い端末・認識に困ったときの逃げ道
 * 採点は従来どおり（正解◯・許容解△・誤り×・見落とし/余分）。加えて
 * ルールブックの言い切りによる「矛盾検査」（正解表なしで指摘できる項目）を表示する。
 */

import { useState } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/AppLayout'
import { SyntaxAnnotator } from '@/components/reading/SyntaxAnnotator'
import { PenSyntaxAnnotator } from '@/components/pen-syntax/PenSyntaxAnnotator'
import {
  emptyAnswer,
  gradeSyntax,
  modelAnswer,
  SYNTAX_PROBLEMS,
  type SyntaxAnswer,
  type SyntaxGrade,
} from '@/lib/reading/syntax'
import { checkContradictions } from '@/lib/reading/syntax-check'

export default function SyntaxDrillPage() {
  const [problemIdx, setProblemIdx] = useState(0)
  const problem = SYNTAX_PROBLEMS[problemIdx]
  const [answer, setAnswer] = useState<SyntaxAnswer>(() => emptyAnswer(SYNTAX_PROBLEMS[0]))
  const [grade, setGrade] = useState<SyntaxGrade | null>(null)
  const [inputMode, setInputMode] = useState<'pen' | 'tap'>('pen')

  const load = (idx: number) => {
    setProblemIdx(idx)
    setAnswer(emptyAnswer(SYNTAX_PROBLEMS[idx]))
    setGrade(null)
  }

  const contradictions = grade ? checkContradictions(problem.tokens, answer) : []

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <Link href="/reading" className="text-xs font-semibold text-sora-dark">
          ← 読解の一覧
        </Link>
        <h1 className="mb-1 mt-1 text-2xl font-extrabold text-ai">構文の練習</h1>
        <p className="mb-3 text-sm leading-relaxed text-ink-2">
          {inputMode === 'pen' ? (
            <>
              ペンで英文に直接書き込みます。<b>括弧・下線は本文に</b>、<b>品詞は単語の上</b>、
              <b>働き（S・V・O など）は単語の下</b>に書くと、その場で判別して単語に付きます。
              マスをタップして一覧から選ぶこともできます。
            </>
          ) : (
            <>
              単語の<b>上をタップ→品詞</b>、<b>下をタップ→働き</b>（S・V・O・C・M など）。
              まとまりは下のボタンを押してから、最初の単語→最後の単語の順にタップします。
            </>
          )}
        </p>

        <div className="mb-3 flex gap-1.5">
          <button
            type="button"
            onClick={() => setInputMode('pen')}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              inputMode === 'pen' ? 'bg-sora text-white' : 'border border-gray-300 bg-white text-ai'
            }`}
          >
            ✍️ ペンで書く
          </button>
          <button
            type="button"
            onClick={() => setInputMode('tap')}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              inputMode === 'tap' ? 'bg-sora text-white' : 'border border-gray-300 bg-white text-ai'
            }`}
          >
            👆 タップで入力
          </button>
          <Link
            href="/reading/syntax/pen-lab"
            className="ml-auto self-center text-xs font-semibold text-sora-dark"
          >
            ペン判別の計測 →
          </Link>
        </div>

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

        {inputMode === 'pen' ? (
          <PenSyntaxAnnotator
            tokens={problem.tokens}
            answer={answer}
            onChange={(next) => {
              setAnswer(next)
              setGrade(null)
            }}
            posMarks={grade?.posMark}
            roleMarks={grade?.roleMark}
            spanMarks={grade?.spanMark}
          />
        ) : (
          <SyntaxAnnotator
            tokens={problem.tokens}
            answer={answer}
            onChange={(next) => {
              setAnswer(next)
              setGrade(null)
            }}
            posMarks={grade?.posMark}
            roleMarks={grade?.roleMark}
            spanMarks={grade?.spanMark}
          />
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

            {contradictions.length > 0 && (
              <div className="rounded-xl border border-again/40 bg-white p-3">
                <p className="mb-1 text-sm font-bold text-ai">
                  ⚖️ 矛盾検査
                  <span className="ml-1 text-xs font-normal text-ink-3">
                    — ルールブックの言い切りから機械的に見つかった矛盾（正解を知らなくても指摘できるもの）
                  </span>
                </p>
                <div className="space-y-1.5">
                  {contradictions.map((c, i) => (
                    <p
                      key={i}
                      className={`rounded-lg p-2 text-sm ${
                        c.severity === 'error' ? 'bg-again-bg text-again' : 'bg-hard-bg text-hard'
                      }`}
                    >
                      {c.severity === 'error' ? '✕ ' : '△ '}
                      {c.text}
                    </p>
                  ))}
                </div>
              </div>
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
    </AppLayout>
  )
}
