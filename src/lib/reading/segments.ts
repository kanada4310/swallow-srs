/**
 * 生徒自身の切れ目から「意味のまとまり（セグメント）」を組み立てる純ロジック。
 *
 * 大意・組み立ての単位は模範の事柄ではなく、生徒が実際に入れた切れ目で決まる
 * （切りすぎで細かくてもそのまま採用する＝DEC-033）。
 * 文頭 (gap=0) で切っていない文は、前のセグメントに結合される（畳み）。
 */

import type { Gist, ParagraphWork, ReadingParagraph } from './types'

export function cutKey(sentenceIndex: number, gap: number): string {
  return sentenceIndex + ':' + gap
}

export function circled(n: number): string {
  const map = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
  return n >= 1 && n <= 20 ? map[n - 1] : '(' + n + ')'
}

export interface StudentSegment {
  /** 文のインデックス（0始まり） */
  si: number
  /** 文内のトークン開始位置 */
  start: number
  text: string
  /** 畳みで続いた文の先頭インデックス */
  contStarts: number[]
  id: string
  num: number
}

export function studentSegments(
  para: ReadingParagraph,
  cuts: Set<string> | string[]
): StudentSegment[] {
  const cutSet = cuts instanceof Set ? cuts : new Set(cuts)
  const segs: StudentSegment[] = []

  para.sentences.forEach((sent, si) => {
    const intra = Array.from(cutSet)
      .map((key) => key.split(':').map(Number))
      .filter(([s, g]) => s === si && g > 0)
      .map(([, g]) => g)
      .sort((a, b) => a - b)
    const headCut = si === 0 || cutSet.has(cutKey(si, 0))
    const starts = [0, ...intra]
    starts.forEach((st, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : sent.tokens.length
      const text = sent.tokens.slice(st, end).join(' ')
      if (i === 0 && !headCut && segs.length > 0) {
        const prev = segs[segs.length - 1]
        prev.text += ' ' + text
        prev.contStarts.push(si)
      } else {
        segs.push({ si, start: st, text, contStarts: [], id: si + ':' + st, num: 0 })
      }
    })
  })

  segs.forEach((s, i) => {
    s.id = s.si + ':' + s.start
    s.num = i + 1
  })
  return segs
}

/** セグメント → 模範の事柄番号。セグメント開始位置以前で最も近い模範断片の事柄。 */
export function kotoForSegment(para: ReadingParagraph, seg: StudentSegment): number | null {
  let best: { sentence: number; token: number; no: number } | null = null
  ;(para.segments || []).forEach((m) => {
    if (m.sentence < seg.si || (m.sentence === seg.si && m.token <= seg.start)) {
      if (
        !best ||
        m.sentence > best.sentence ||
        (m.sentence === best.sentence && m.token > best.token)
      ) {
        best = m
      }
    }
  })
  return best ? (best as { no: number }).no : null
}

export function gistText(g: Gist | undefined | null): string {
  if (!g) return ''
  if (typeof g === 'string') return g
  return `${g.a || ''} → ${g.b || ''}`
}

export function gistFilled(g: Gist | undefined | null): boolean {
  if (!g) return false
  if (typeof g === 'string') return g.trim().length > 0
  return (g.a || '').trim().length > 0 && (g.b || '').trim().length > 0
}

/**
 * 大意ゲート（DEC-033）: 生徒自身の区切りごとに大意を書き終えるまで組み立てへ進めない。
 */
export function gistsComplete(para: ReadingParagraph, work: ParagraphWork): boolean {
  return studentSegments(para, work.cuts).every((s) => gistFilled(work.gists[s.id]))
}
