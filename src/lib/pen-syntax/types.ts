/**
 * ペン入力の構文分析の型定義。
 *
 * 使う記号は「記号の台帳」（ledger.ts・2026-08-26 塾長確定版）に限定する:
 * - 括弧4種＋下線＋波線（熟語の印）
 * - 品詞の英字5種（n・v・a・ad・aux）・働きの文字（S・V・O・C・P・Po・▷・＋）
 * - ○で囲んだ漢字の例外マーク1字（仮・真・強・同）
 * ShapeKind には台帳外の形（?・ダッシュ・Ø・単語囲みの○など）も残るが、
 * これは「書かれたら台帳外と判別して案内する」ための検出用（台帳の DEPRECATED 参照）。
 */

export interface PenPoint {
  x: number
  y: number
  /** ms タイムスタンプ（省略可・グルーピングに使う） */
  t?: number
}

/** 1画ぶんの線 */
export type PenStroke = PenPoint[]

/** 形の記号（群A＋B）の種類 */
export type ShapeKind =
  | 'paren-open' // （
  | 'paren-close' // ）
  | 'square-open' // [
  | 'square-close' // ]
  | 'angle-open' // 〈
  | 'angle-close' // 〉
  | 'brace-open' // {
  | 'brace-close' // }
  | 'hline' // 横線（下線 or ダッシュは位置で決める）
  | 'circle' // ○囲み（等位接続詞）
  | 'wavy' // 波線（分からないマークの片割れ）
  | 'question' // ?（分からないマークの片割れ）
  | 'slash' // 斜め線（Ø の合成用）
  | 'tick' // 短い点画（S' などのダッシュ）
  | 'null-sign' // Ø（円＋斜線）
  | 'triangle' // ▷（従位接続詞の目印）

/**
 * 文字（群C）の候補。品詞は黄リー教式の英字略記
 * （塾長の実書き込み〔模範分析集 第7講・形式仕様.md〕で確認された字母のみ）。
 * n=名詞・代名詞 / v=動詞（分詞・不定詞も） / a=冠詞・形容詞 / ad=副詞 / aux=助動詞。
 * 前置詞は品詞の段には書かず、働きの段に P と書く（台帳の確定版・2026-08-26）。
 */
export const POS_LETTERS = ['n', 'v', 'a', 'ad', 'aux'] as const
export type PosLetter = (typeof POS_LETTERS)[number]

/**
 * 働きの文字（塾長の実書き込み〔模範分析集 第7講・形式仕様.md〕の表記のまま。
 * Po・▷ を「前O」「接」などに言い換えない。M は現在の分析で使われていないため無い。
 * P（前置詞）は本来品詞だが、塾長は書く利便性から働きの位置（下の段）に書く。
 * ＋は等位接続詞の印（英単語を○で囲む書き方の置き換え・2026-08-26 塾長裁定）。
 */
export const ROLE_LETTERS = ['S', 'V', 'O', 'C', 'P', 'Po', '▷', '＋'] as const
export type RoleLetter = (typeof ROLE_LETTERS)[number]

/**
 * ○で囲んだ漢字の例外マーク（仮主語・真主語・強調構文・同格）。
 * **1字で書く**（2026-08-27 塾長確定。第7講の検収で、実際の書き方は
 * ○で囲んだ漢字1字＝同・強と分かったため「強調」「同格」の2文字表記をやめた。
 * 決定記録 20260827-syntax-symbol-clarifications の1）。候補は実例で拡張する。
 */
export const EXCEPTION_KANJI = ['仮', '真', '強', '同'] as const
export type ExceptionKanji = (typeof EXCEPTION_KANJI)[number]

export type SymbolId = ShapeKind | PosLetter | RoleLetter | ExceptionKanji

/** 判別結果の1候補 */
export interface SymbolCandidate {
  symbol: SymbolId
  /** 0〜1。大きいほど確信が高い */
  score: number
}

/** 判別の結論。迷った場合は candidates に2〜3個入る（ワンタップ確定用） */
export interface RecognitionResult {
  /** 最有力候補（無判別なら null） */
  best: SymbolCandidate | null
  /** 確信が拮抗しているときの候補一覧（best を含む・スコア降順） */
  candidates: SymbolCandidate[]
  /** true なら UI は候補チップを出してワンタップ確定させる */
  ambiguous: boolean
}

/** 単語の画面上の箱（コンテナ相対座標） */
export interface TokenBox {
  index: number
  left: number
  right: number
  top: number
  bottom: number
  /**
   * 文字のベースライン（下線を文字にぴったり寄せるための縦位置・コンテナ相対）。
   * bottom は語要素の外枠の下端（下枠線・下余白を含む）でベースラインではない。
   * 採寸できないとき（テスト・古い呼び出し）は未設定で、bottom で代用する。
   */
  baseline?: number
}

/** 線がどの帯に書かれたか。above=品詞の行 / band=本文の行 / below=働きの行 */
export type Lane = 'above' | 'band' | 'below'
