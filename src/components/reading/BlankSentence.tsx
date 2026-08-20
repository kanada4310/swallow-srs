'use client'

/**
 * 【構文に降りる】困った1文だけを白文で出す。
 *
 * 上下に書き込み用の余白（品詞＝上／働き＝下）を空けた、紙と同じ形。
 * 第1弾では構文の自動採点はしない（正規形の検収に、もう一列の検収待ちを足さないため）。
 * 採点つきの練習は「構文の素振り」（/reading/syntax）に置いてある。
 */

import { useState } from 'react'
import type { ReadingParagraph } from '@/lib/reading/types'

interface BlankSentenceProps {
  para: ReadingParagraph
  sentenceIndex: number
  onClose: () => void
}

export function BlankSentence({ para, sentenceIndex, onClose }: BlankSentenceProps) {
  const [showGist, setShowGist] = useState(false)
  const sent = para.sentences[sentenceIndex]
  if (!sent) return null

  const kotos = para.kotos.filter((k) => k.sentence === sentenceIndex && k.no)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-card bg-white p-4 shadow-card sm:max-w-2xl sm:rounded-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-ai">構文に降りる（第{sentenceIndex + 1}文）</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-bold text-ink-2 hover:bg-gray-100"
          >
            閉じる
          </button>
        </div>

        <p className="mb-3 rounded-xl bg-sora-soft p-3 text-sm leading-relaxed text-ai">
          単語の<b>上に品詞</b>、<b>下に働き</b>（S・V・O・C・M など）を書き込みながら読みます。
          この画面では採点しません。紙に書き写すか、指でなぞりながら読んでください。
        </p>

        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-paper p-4">
          <div className="flex min-w-max flex-wrap gap-x-2 gap-y-6">
            {sent.tokens.map((tok, i) => (
              <div key={i} className="flex flex-col items-center">
                <span className="mb-1 h-5 w-full min-w-[2.5rem] border-b border-dashed border-gray-300" />
                <span className="whitespace-nowrap font-serif text-xl text-ink">{tok}</span>
                <span className="mt-1 h-5 w-full min-w-[2.5rem] border-b border-dashed border-gray-300" />
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowGist((v) => !v)}
          className="mt-3 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-ai"
        >
          {showGist ? 'この文の大意を隠す' : 'どうしても分からないとき: この文の大意を見る'}
        </button>
        {showGist && (
          <ul className="mt-2 space-y-1 rounded-xl bg-paper p-3 text-sm text-ink-2">
            {kotos.length === 0 ? (
              <li>（この文に対応する模範の大意はありません）</li>
            ) : (
              kotos.map((k) => <li key={k.no}>・{k.t}</li>)
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
