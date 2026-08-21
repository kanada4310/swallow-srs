'use client'

/**
 * 構文の素振り — 1文の品詞（上）と働き（下）を書き込んで採点する練習。
 *
 * 工房の構文分析アプリの練習3問をそのまま移した。曖昧な箇所は △（許容解）で受理する。
 * 書き込みUIは共通部品 SyntaxAnnotator（読解1文画面の「構文に降りる」と共用）。
 */

import { useState } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/AppLayout'
import { SyntaxAnnotator } from '@/components/reading/SyntaxAnnotator'
import {
  emptyAnswer,
  gradeSyntax,
  modelAnswer,
  SYNTAX_PROBLEMS,
  type SyntaxAnswer,
  type SyntaxGrade,
} from '@/lib/reading/syntax'

export default function SyntaxDrillPage() {
  const [problemIdx, setProblemIdx] = useState(0)
  const problem = SYNTAX_PROBLEMS[problemIdx]
  const [answer, setAnswer] = useState<SyntaxAnswer>(() => emptyAnswer(SYNTAX_PROBLEMS[0]))
  const [grade, setGrade] = useState<SyntaxGrade | null>(null)

  const load = (idx: number) => {
    setProblemIdx(idx)
    setAnswer(emptyAnswer(SYNTAX_PROBLEMS[idx]))
    setGrade(null)
  }

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
    </AppLayout>
  )
}
