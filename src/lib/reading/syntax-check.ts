/**
 * 矛盾検査（0円の床）— ルールブックの「例外なしの言い切り」から機械的に検査する。
 *
 * 正解表が無くても指摘できる項目だけを扱う（構想の骨子(1)の「床」）。
 * 対象の言い切り（正本ルールブックの該当ルール）:
 * - Rule 1: S=名詞 / V=動詞 / O=名詞 / C=名詞 or 形容詞
 * - Rule 4: S はいつでも一つ（名詞は S/O/C/Po か名詞修飾のどれか）
 * - Rule 5: 形容詞は C になるか名詞を修飾する
 * - Rule 6: 副詞は SVOC のどの要素も担わない（＝働きの文字を書かない）
 * - Rule 9/14/18/28: 〈 〉は直前の名詞を修飾する
 * - Rule 13: 前置詞のまとまりの中には名詞（Po）が一つだけ入る
 * - Rule 20: { } は SVOC の C（＝前に O があるはず）
 * - ［ ］は S/O/C/Po のどれかとして働く（ページ9）
 *
 * 検査は「確実に矛盾」だけを error にし、判断の余地が残るものは warn に落とす
 * （誤検知で生徒を混乱させないための保守側の設計）。
 */

import { isPunct, posLetter, type StudentSpan, type SyntaxAnswer } from './syntax'

export interface ContradictionFinding {
  /** 検査項目の識別子（テスト・集計用） */
  code: string
  severity: 'error' | 'warn'
  text: string
  /** 関係する単語の位置（あれば） */
  tokens?: number[]
}

/** span の内側に完全に含まれるトークンか（ul は「まとまり」でないため除く） */
function insideSpans(index: number, spans: StudentSpan[]): boolean {
  return spans.some((s) => s.type !== 'ul' && index >= s.from && index <= s.to)
}

function prevContentToken(tokens: string[], from: number): number | null {
  for (let i = from - 1; i >= 0; i--) {
    if (!isPunct(tokens[i])) return i
  }
  return null
}

export function checkContradictions(tokens: string[], answer: SyntaxAnswer): ContradictionFinding[] {
  const out: ContradictionFinding[] = []
  const { pos: rawPos, role, spans } = answer
  // 品詞は漢字名でも英字略記（n/v/a/ad/aux/p）でも検査できるよう、英字に正規化して比べる。
  // 英字は 冠詞と形容詞（a）、動詞と分詞・不定詞（v）を区別しないため、
  // 区別が要る検査（冠詞は C になれない等）はその分だけ検査対象を狭めている。
  const pos = rawPos.map((p) => (p == null ? null : posLetter(p)))

  // --- Rule 4: カッコの外で S が2つ（等位接続詞があれば許す） ---
  for (const target of ['S', 'V'] as const) {
    const hits = tokens
      .map((_, i) => i)
      .filter((i) => role[i] === target && !insideSpans(i, spans))
    if (hits.length >= 2) {
      // 接続詞は品詞「接」のほか、働きの ▷（従位）・＋（等位）でも書かれる
      const hasConj = tokens.some(
        (_, i) =>
          i > hits[0] &&
          i < hits[hits.length - 1] &&
          (pos[i] === '接' || role[i] === '▷' || role[i] === '＋'),
      )
      if (!hasConj) {
        out.push({
          code: target === 'S' ? 'dup-s' : 'dup-v',
          severity: 'error',
          text:
            target === 'S'
              ? `S が${hits.length}つあります。S はいつでも一つです（ルール4）。カッコの中の要素なら、まとまりで囲ってください`
              : `V が${hits.length}つあります。1つの文の V は一つです。並列（and など）でなければ、まとまりの中の動詞か確認してください`,
          tokens: hits,
        })
      }
    }
  }

  // --- Rule 1/5/6: 品詞と働きの対応 ---
  tokens.forEach((w, i) => {
    const p = pos[i]
    const r = role[i]
    if (!p || !r) return
    if (p === 'ad') {
      out.push({
        code: 'adverb-role',
        severity: 'error',
        text: `「${w}」: 副詞は S・V・O・C のどの要素も担いません（ルール6）。副詞には働きの文字を書きません`,
        tokens: [i],
      })
    }
    if ((r === 'S' || r === 'O' || r === 'Po') && ['ad', 'p', '接', 'a'].includes(p)) {
      out.push({
        code: 'noun-role-pos',
        severity: 'error',
        text: `「${w}」: ${r} になれるのは名詞（と代名詞）だけです（ルール${r === 'Po' ? '13' : '4'}）。品詞「${p}」と働き「${r}」は両立しません`,
        tokens: [i],
      })
    }
    // a は冠詞と形容詞を区別しない（形容詞は C になれる）ため、C の検査からは外す
    if (r === 'C' && ['ad', 'p', '接'].includes(p)) {
      out.push({
        code: 'c-role-pos',
        severity: 'error',
        text: `「${w}」: C になれるのは名詞か形容詞です（ルール1）。品詞「${p}」と働き「C」は両立しません`,
        tokens: [i],
      })
    }
    if (r === 'V' && ['n', 'a', 'ad', 'p', '接'].includes(p)) {
      out.push({
        code: 'v-role-pos',
        severity: 'error',
        text: `「${w}」: V になれるのは動詞（助動詞・分詞・不定詞を含むまとまり）だけです（ルール1）。品詞「${p}」と働き「V」は両立しません`,
        tokens: [i],
      })
    }
  })

  // --- Rule 13: 前置詞と Po の対応 ---
  // 前置詞の印は、品詞の p（上の段）と働きの P（下の段・塾長の実書き込みの書き方）のどちらでもよい
  const isPrep = (i: number) => pos[i] === 'p' || role[i] === 'P'
  const claimed = new Set<number>()
  tokens.forEach((w, i) => {
    if (role[i] !== 'Po') return
    let found = false
    for (let j = i - 1; j >= 0; j--) {
      if (role[j] === 'Po' && !claimed.has(j)) break // 間に別の Po があるなら対応しない
      if (isPrep(j) && !claimed.has(j)) {
        claimed.add(j)
        found = true
        break
      }
    }
    if (!found) {
      out.push({
        code: 'po-without-p',
        severity: 'error',
        text: `「${w}」を前置詞の目的語（Po）としていますが、前に前置詞が見当たりません（ルール13）`,
        tokens: [i],
      })
    }
  })
  tokens.forEach((w, i) => {
    if (!isPrep(i) || claimed.has(i)) return
    // この前置詞より後ろに（次の前置詞より手前で）Po があるか
    let found = false
    for (let j = i + 1; j < tokens.length; j++) {
      if (isPrep(j)) break
      if (role[j] === 'Po') {
        found = true
        break
      }
    }
    if (!found && role.some((r) => r !== null)) {
      out.push({
        code: 'p-without-po',
        severity: 'warn',
        text: `前置詞「${w}」の目的語（Po）が書かれていません。前置詞のまとまりの中には名詞が一つ入ります（ルール13）`,
        tokens: [i],
      })
    }
  })

  // --- 〈 〉は直前の名詞を修飾（ルール9・14・18・28） ---
  spans.forEach((s) => {
    if (s.type !== 'adjm') return
    const prev = prevContentToken(tokens, s.from)
    if (prev === null) {
      out.push({
        code: 'angle-no-noun',
        severity: 'error',
        text: `〈 〉（後置修飾）が文頭にあります。〈 〉は直前の名詞を修飾するので、前に名詞が必要です（ルール9）`,
        tokens: [s.from],
      })
      return
    }
    const p = pos[prev]
    if (p && p !== 'n') {
      out.push({
        code: 'angle-no-noun',
        severity: 'error',
        text: `〈${tokens.slice(s.from, s.to + 1).join(' ')}〉の直前「${tokens[prev]}」の品詞が「${p}」です。〈 〉は直前の名詞を修飾します（ルール9）`,
        tokens: [prev, s.from],
      })
    }
  })

  // --- { } は SVOC の C（ルール20） ---
  spans.forEach((s) => {
    if (s.type !== 'comp') return
    const hasObefore = tokens.some((_, i) => i < s.from && role[i] === 'O' && !insideSpans(i, spans))
    if (!hasObefore && role.some((r) => r !== null)) {
      out.push({
        code: 'brace-no-o',
        severity: 'warn',
        text: `｛ ｝は SVOC の C に準動詞が来る特別な場合の印です。前に O が見当たりません（ルール20）`,
        tokens: [s.from],
      })
    }
  })

  // --- ［ ］に役割がない（ページ9: ［ ］の下に S などの要素を記入） ---
  spans.forEach((s) => {
    if (s.type !== 'n') return
    // まとまり全体の働き（開始カッコの真下の書き込み）があれば役割ありとみなす
    const hasRole =
      (s.role != null && s.role !== '') ||
      tokens.some(
        (_, i) => i >= s.from && i <= s.to && ['S', 'O', 'C', 'Po'].includes(role[i] ?? ''),
      )
    if (!hasRole && role.some((r) => r !== null)) {
      out.push({
        code: 'square-no-role',
        severity: 'warn',
        text: `[${tokens.slice(s.from, s.to + 1).join(' ')}] に役割（S・O・C・Po のどれか）が書かれていません。[ ] は名詞として働くまとまりです`,
        tokens: [s.from],
      })
    }
  })

  // --- すべての文は S,V を備えている（ルール1） ---
  const hasAnyRole = role.some((r) => r !== null)
  if (hasAnyRole) {
    const hasV = role.some((r, i) => r === 'V' && !insideSpans(i, spans))
    if (!hasV) {
      out.push({
        code: 'no-v',
        severity: 'warn',
        text: 'カッコの外に V がありません。すべての文は S と V を備えています（ルール1）',
      })
    }
  }

  return out
}
