/**
 * 復習カード連携（純ロジック部分）。
 *
 * 確定した構文分析をカードの裏面用HTMLに描画する。
 * カードに保存するのは英文と確定済みの構文分析だけ（訳文は保存しない・裁定2）。
 * HTMLは sandbox iframe 内でカードテンプレートのCSS（card-template.ts）とともに表示される。
 */

import { SPAN_TYPES, isPunct, type SpanType } from '@/lib/reading/syntax'
import type { SentenceSyntaxWork } from '@/lib/reading/types'

type AnswerLike = SentenceSyntaxWork['answer']

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 分析済みの1文をHTMLへ。素振り画面と同じ見た目の並び:
 * 語ごとに 上=品詞 / 中=語（下線つき）/ 下=働き、まとまりのカッコを語の前後に置く。
 */
export function renderAnalysisHtml(tokens: string[], answer: AnswerLike): string {
  const opens: Record<number, Array<{ len: number; open: string }>> = {}
  const closes: Record<number, Array<{ len: number; close: string }>> = {}
  for (const s of answer.spans) {
    const t = SPAN_TYPES[s.type as SpanType]
    if (!t || s.type === 'ul') continue
    ;(opens[s.from] = opens[s.from] || []).push({ len: s.to - s.from, open: t.open })
    ;(closes[s.to] = closes[s.to] || []).push({ len: s.to - s.from, close: t.close })
  }
  const underlined = (i: number) =>
    answer.spans.some((s) => s.type === 'ul' && i >= s.from && i <= s.to)

  const cols = tokens.map((tok, i) => {
    const parts: string[] = []
    for (const o of (opens[i] || []).sort((a, b) => b.len - a.len)) {
      parts.push(`<span class="syn-br">${esc(o.open)}</span>`)
    }
    const pos = answer.pos[i]
    const role = isPunct(tok) ? null : answer.role[i]
    parts.push(
      `<span class="syn-tok">` +
        `<span class="syn-pos">${pos ? esc(pos) : ''}</span>` +
        `<span class="syn-word${underlined(i) ? ' syn-ul' : ''}">${esc(tok)}</span>` +
        `<span class="syn-role">${role ? esc(role) : ''}</span>` +
        `</span>`
    )
    for (const c of (closes[i] || []).sort((a, b) => a.len - b.len)) {
      parts.push(`<span class="syn-br">${esc(c.close)}</span>`)
    }
    return `<span class="syn-col">${parts.join('')}</span>`
  })

  return `<div class="syn-row">${cols.join('')}</div>`
}

/** カードのノートに保存する field_values を組む */
export function buildCardFields(
  tokens: string[],
  answer: AnswerLike,
  source: string
): Record<string, string> {
  return {
    英文: tokens.join(' '),
    分析表示: renderAnalysisHtml(tokens, answer),
    構文データ: JSON.stringify({ tokens, answer }),
    出典: source,
  }
}
