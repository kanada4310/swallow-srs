'use client'

/**
 * ⑥まとめ — 今日どこで詰まったか・ヒントを何段まで使ったかを振り返る。
 *
 * 「自力」の列が増えていくことが、切れ目を見つける力がついてきた証拠になる。
 * ここから AI 講評用の文章も書き出せる（外部へは送らない。生徒が自分のチャットに貼る）。
 */

import { useState } from 'react'
import { buildJudgePrompt } from '@/lib/reading/prompt'
import { summarizeProgress } from '@/lib/reading/progress'
import type { ReadingLessonData, ReadingProgressState } from '@/lib/reading/types'

interface SummaryStepProps {
  data: ReadingLessonData
  state: ReadingProgressState
  segmentCounts: number[]
  /** サーバーに届いておらず、この端末の中にだけ残っている状態か */
  localOnly?: boolean
}

export function SummaryStep({ data, state, segmentCounts, localOnly = false }: SummaryStepProps) {
  const [promptParaIdx, setPromptParaIdx] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const summary = summarizeProgress(state, segmentCounts)

  const prompt =
    promptParaIdx != null
      ? buildJudgePrompt(data.paragraphs[promptParaIdx], state.paragraphs[promptParaIdx])
      : ''

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-gray-200 bg-white p-4 shadow-card">
        <h2 className="mb-1 text-base font-extrabold text-ai">今日のまとめ</h2>
        <p className="mb-3 text-sm text-ink-2">
          必須の切れ目 {summary.cutsFound} / {summary.requiredCutsTotal}、
          自力で見つけたのは {summary.hints.self} か所です。
        </p>

        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse text-sm">
            <thead>
              <tr className="bg-paper text-xs text-ink-2">
                <th className="border border-gray-200 px-2 py-1.5 text-left">段落</th>
                <th className="border border-gray-200 px-2 py-1.5">必須</th>
                <th className="border border-gray-200 px-2 py-1.5">自力</th>
                <th className="border border-gray-200 px-2 py-1.5">場所の後</th>
                <th className="border border-gray-200 px-2 py-1.5">手がかり語の後</th>
                <th className="border border-gray-200 px-2 py-1.5">開示後</th>
                <th className="border border-gray-200 px-2 py-1.5">状態</th>
              </tr>
            </thead>
            <tbody>
              {summary.paragraphs.map((p) => (
                <tr key={p.paraNo} className="text-center">
                  <td className="border border-gray-200 px-2 py-1.5 text-left font-bold text-ai">
                    ¶{p.paraNo}
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5">{p.requiredCuts}</td>
                  <td className="border border-gray-200 px-2 py-1.5 font-bold text-good">
                    {p.passed ? p.hints.self : '—'}
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5">
                    {p.passed ? p.hints.para + p.hints.sentence : '—'}
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5">{p.passed ? p.hints.cue : '—'}</td>
                  <td className="border border-gray-200 px-2 py-1.5">{p.passed ? p.hints.reveal : '—'}</td>
                  <td className="border border-gray-200 px-2 py-1.5 text-xs">
                    {p.passed ? (p.relPassed ? '組み立てまで' : '切る まで') : p.attempts > 0 ? '作業中' : '未着手'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          「自力」の列が増えていくことが、切れ目を見つける力がついてきた証拠です。
          {localOnly
            ? 'いまはこの端末の中にだけ残っています。先生に見せたいときはこの画面を見せてください。'
            : 'この内容は先生の画面にも届くので、スクリーンショットを送る必要はありません。'}
        </p>
      </div>

      <div className="rounded-card border border-gray-200 bg-white p-4 shadow-card">
        <h2 className="mb-1 text-base font-extrabold text-ai">AI に講評してもらう</h2>
        <p className="mb-3 text-sm leading-relaxed text-ink-2">
          段落を選ぶと、講評をお願いする文章ができます。コピーして、自分のチャット（ChatGPT や Claude）に貼ってください。
          <span className="text-ink-3">（このアプリから外へ送ることはありません）</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {data.paragraphs.map((p, i) => (
            <button
              key={p.no}
              type="button"
              onClick={() => {
                setPromptParaIdx(i)
                setCopied(false)
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${
                promptParaIdx === i
                  ? 'bg-ai text-white'
                  : 'border border-gray-300 bg-white text-ai hover:bg-sora-soft'
              }`}
            >
              ¶{p.no}
            </button>
          ))}
        </div>

        {promptParaIdx != null && (
          <div className="mt-3">
            <button
              type="button"
              onClick={copy}
              className="mb-2 rounded-xl bg-sora px-4 py-2.5 text-sm font-bold text-white"
            >
              {copied ? 'コピーしました' : 'この文章をコピーする'}
            </button>
            <textarea
              readOnly
              value={prompt}
              className="h-48 w-full rounded-xl border border-gray-300 p-2 font-mono text-xs"
            />
          </div>
        )}
      </div>
    </div>
  )
}
