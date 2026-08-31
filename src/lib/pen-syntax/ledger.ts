/**
 * 使う記号の台帳（確定版・2026-08-26 塾長指示。模範分析集 第7講の実物で裏取り）。
 *
 * ペン入力で使う記号は**この台帳に限定する**。表示名・登録できる一覧・
 * 台帳から外れた記号の扱いは、すべてこのファイルが正本（分散させない）。
 *
 * ## 使う記号
 * - 品詞（単語の上の段・英字）: n・a・v・ad・aux
 * - 働き（単語の下の段）: S・V・O・C・P・Po・▷・＋（等位接続詞）・同
 *   ※ 節・句の深さ（S′ などのダッシュ）は生徒は書かない。囲んだ括弧から自動判定して
 *     色で表示し、印刷・照合ではダッシュ表記に自動変換する（dash-notation.ts）
 * - 囲み・線: 下線・( )・⟨ ⟩・[ ]・{ }・波線（＝熟語・慣用表現の印）
 *   ※ 記号の見た目は幅をそろえる（2026-08-28。丸括弧と山括弧だけ全角で、角括弧・
 *     波括弧が半角だったため、並べたときに幅が食い違っていた）。山括弧の半角は
 *     数学用の ⟨ ⟩（U+27E8 / U+27E9）を使う。**記号の見分けは ID（paren-open など）で
 *     行っており、ここは表示に使う字だけ**なので、過去に保存した記録は影響を受けない
 * - 例外の印（1字）: 仮・真・強・同（EXCEPTION_KANJI）。
 *   **2026-08-31 から手書きの○囲みでは書かず、マスをタッチして付ける**
 *   （仮・真は判定済みの S / O のマスから・強は働きのマスの選択肢から・
 *   同は働きの一覧の「同」）。表示は従来どおり○囲みの1字
 *
 * ## 使わない・無視する（DEPRECATED_SHAPES）
 * - M（第7講で未使用）・？（分析不能の印・無視）・英単語を丸ごと囲む○（＋記法へ置換）
 * - ダッシュ（′）・Ø・斜線（台帳外）
 * 台帳外の形は「検出はするが反映せず、書き方の案内を出す」（誤って別記号に
 * 化けるより、何を書けばよいかを伝えるほうが親切）。
 */

import type { ShapeKind, SymbolId } from './types'
import { POS_LETTERS, ROLE_LETTERS } from './types'

/* ---------- 表示名 ---------- */

export const SYMBOL_LABELS: Record<string, string> = {
  'paren-open': '(',
  'paren-close': ')',
  'square-open': '[',
  'square-close': ']',
  'angle-open': '⟨',
  'angle-close': '⟩',
  'brace-open': '{',
  'brace-close': '}',
  hline: '下線',
  wavy: '波線（熟語）',
  triangle: '▷',
  '＋': '＋（等位接続詞）',
  仮: '○仮（仮主語）',
  真: '○真（真主語）',
  強: '○強（強調構文）',
  同: '○同（同格）',
  // 台帳外（案内・古い記録の表示用に名前だけ残す）
  circle: '○囲み',
  question: '?',
  slash: '斜線',
  tick: '’（ダッシュ）',
  'null-sign': 'Ø',
}

export function symbolLabel(symbol: SymbolId | string): string {
  return SYMBOL_LABELS[symbol] ?? String(symbol)
}

/* ---------- 台帳から外れた形（検出したら反映せず案内する） ---------- */

export const DEPRECATED_SHAPES: Partial<Record<ShapeKind, string>> = {
  circle:
    '○で囲む書き方は使いません。等位接続詞は単語の下に「＋」を書き、仮・真・強・同の印は働きのマスをタッチして付けます',
  question: '「?」の印は使いません（記録しません）',
  tick: 'ダッシュ（′）は書かなくてよくなりました。節・句の深さは括弧から自動で色分けされます',
  slash: 'この記号は使いません',
  'null-sign': 'Ø の記号は使いません',
}

/** 台帳から外れた形なら案内文を返す（台帳内なら null） */
export function deprecatedGuidance(symbol: SymbolId): string | null {
  return (DEPRECATED_SHAPES as Record<string, string>)[symbol] ?? null
}

/* ---------- お手本登録の一覧 ---------- */

/** 括弧4種の開き・閉じ（計8種）。判別強化の相対比較はこの8種の登録がそろって効く */
export const BRACKET_SYMBOLS: SymbolId[] = [
  'paren-open',
  'paren-close',
  'square-open',
  'square-close',
  'angle-open',
  'angle-close',
  'brace-open',
  'brace-close',
]

/** 初回登録で必須にする働きの文字（＋は形が単純で内蔵お手本で足りるため任意） */
export const ONBOARD_ROLE_LETTERS: SymbolId[] = ['S', 'V', 'O', 'C', 'P', 'Po', '▷']

/**
 * 必須のお手本（登録の順もこの並び）: 括弧8種 → 品詞の英字5種 → 働きの文字7種。
 * P・▷ は働きの側に並べる（模範分析集の実書き込みどおり）。
 */
export const REQUIRED_SYMBOLS: SymbolId[] = [
  ...BRACKET_SYMBOLS,
  ...POS_LETTERS,
  ...ONBOARD_ROLE_LETTERS,
]

/**
 * 任意のお手本: 下線・波線・＋。
 * 例外の印（仮・真・強・同）は 2026-08-31 に手書き認識を廃止（タッチ選択式へ）した
 * ため、お手本の登録対象から外した（登録済みの字が残っていても使われないだけ）。
 */
export const OPTIONAL_SYMBOLS: SymbolId[] = ['hline', 'wavy', '＋']

/** お手本登録の画面で選べる全記号 */
export const ENROLLABLE_SYMBOLS: SymbolId[] = [
  ...BRACKET_SYMBOLS,
  ...POS_LETTERS,
  ...ROLE_LETTERS.filter((r) => r !== '＋'),
  ...OPTIONAL_SYMBOLS,
]
