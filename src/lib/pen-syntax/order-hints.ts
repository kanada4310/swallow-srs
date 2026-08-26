/**
 * 検討順ヒント「迷ったらまずこれ」（規則ベース・追加費用0円。
 * 2026-08-26・指示書 2026-08-26-srs-pen-order-hints）。
 *
 * 画面に既に付いている記号から「確定済み」を読み取り、検討順リストの
 * 「まだ確定していない最初の項目」を1つだけ提示する。
 *
 * 守ること（構文添削コーチ構想 v0.3 の3原則）:
 * - 正解の内容そのものは言わない。「次に調べる対象」と「調べ方（辞書・文法書・
 *   ルールブックの引き先）」までにとどめる（辞書・文法書が判定者）
 *
 * 検討順リストは設定データ（ORDER_HINT_RULES の並びそのもの）。
 * 塾長の模範筆順（order.ts の ModelOrder）を見て、後からこの並びを
 * 入れ替えれば提示順が変わる。初期値は指示書どおり:
 * ①文の動詞 →②Sの特定 →③名詞の4役 →④カッコの検討順
 * （④の中身はルールブック「カッコの見分け方」: ［名詞］→｛ ｝→〈 〉→（ ）＝
 *   成立する条件の厳しい順）
 */

import type { SyntaxAnswer } from '@/lib/reading/syntax'
import { posLetter } from '@/lib/reading/syntax'

export interface OrderHint {
  id: string
  /** 次に調べる対象（見出し） */
  title: string
  /** 調べ方（辞書・文法書の引き先まで。正解は言わない） */
  guide: string
}

export interface OrderHintRule extends OrderHint {
  /** 画面に付いている記号からこの項目が「確定済み」かを読む */
  done: (tokens: string[], answer: SyntaxAnswer) => boolean
}

/** 品詞のマスが指定の英字略記（n/v/…）で埋まっている token の添字一覧 */
function markedPos(answer: SyntaxAnswer, letter: string): number[] {
  const out: number[] = []
  answer.pos.forEach((p, i) => {
    if (p != null && posLetter(p) === letter) out.push(i)
  })
  return out
}

/**
 * 検討順リスト（並び＝提示順。ここを入れ替えるとヒントの順序が変わる）。
 * done の判定は「生徒が既に書いた記号」だけを読む（正解表は見ない＝答えを知らない）。
 * しきい値・判定の緩め方は実測（塾長の模範筆順・生徒の並び）を見て調整する。
 */
export const ORDER_HINT_RULES: OrderHintRule[] = [
  {
    id: 'verb',
    title: 'まず文の動詞（V）を特定する',
    guide:
      '時制を持つ語（主語や時によって形が変わる語）が文の動詞。見つけたら単語の下に V、上に v を書く。' +
      '動詞と思う単語は、辞書で品詞欄と文型の表記（SVO / SV to do など）まで確かめる' +
      '（ルールブック Rule 3: 動詞→文型→文の意味の順で決まる）。',
    done: (tokens, a) => markedPos(a, 'v').length > 0 || a.role.some((r) => r === 'V'),
  },
  {
    id: 'subject',
    title: '次に S（文の主語）を特定する',
    guide:
      '文の動詞より前から、動詞と数・人称のかみ合う名詞を探して下に S を書く。' +
      'S はいつでも1つ（ルールブック Rule 4）。動詞の前に名詞が複数見えるときは、' +
      '前置修飾のまとまり（下線）か従属節を疑う。',
    done: (tokens, a) => a.role.some((r) => r === 'S'),
  },
  {
    id: 'noun-roles',
    title: '名詞の役割（4役）を割り当てる',
    guide:
      'すべての名詞は S・O・C・Po（前置詞の目的語）か名詞修飾のどれかを担う（ルールブック Rule 4）。' +
      '名詞に n を付け、一つひとつ役割を書く。決められない名詞は、動詞の文型（辞書の表記）と' +
      '直前に前置詞があるかどうかから検討する。',
    done: (tokens, a) => {
      const nouns = markedPos(a, 'n')
      return nouns.length > 0 && nouns.every((i) => a.role[i] != null)
    },
  },
  {
    id: 'brackets',
    title: 'まとまり（カッコ）を検討する',
    guide:
      'カッコは ［名詞］→｛ ｝→〈 〉→（ ）の順に検討すると効率的（ルールブック「カッコの見分け方」＝' +
      '成立する条件の厳しい順）。S・O・C・Po に名詞が足りない場所は先に［ ］を試し、' +
      'ダメなら｛ ｝（補語）、ダメなら直前の名詞への修飾として〈 〉、どれでもなければ（ ）と捉える。',
    // 検討順の最後の項目（カッコがいくつ要るかは答えを見ないと分からないため、
    // 常に「残っている項目」として案内する＝ここまで来たらチェックリストとして働く）
    done: () => false,
  },
]

/** まだ確定していない最初の項目を1つだけ返す */
export function nextOrderHint(tokens: string[], answer: SyntaxAnswer): OrderHint | null {
  for (const r of ORDER_HINT_RULES) {
    if (!r.done(tokens, answer)) return { id: r.id, title: r.title, guide: r.guide }
  }
  return null
}
