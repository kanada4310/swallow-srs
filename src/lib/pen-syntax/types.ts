/**
 * ペン入力の構文分析（実現可能性検証）の型定義。
 *
 * ルールブックの記号を、ペンで書いた線からの判別しやすさで3群に分ける（構想 v1.1 論点1）:
 * - 群A: （ ）[ ] 〈 〉{ } の括弧4種＋下線
 * - 群B: ○囲み・波線＋?・ダッシュ（'）・Ø
 * - 群C: 文字（品詞11種・働き7種の有限候補への当てはめ）
 * 検証は「形の記号（A+B）」と「文字（C）」の二車線で別々に数える（v1.2 確定）。
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

/** 文字（群C）の候補。品詞は1文字の略記（ルールブック本文の表記に合わせる） */
export const POS_LETTERS = ['名', '代', '動', '助', '形', '副', '前', '接', '冠', '分', '不'] as const
export type PosLetter = (typeof POS_LETTERS)[number]

/** 働きの文字（ルールブック表記。前O は Po、接 は ▷ と書く） */
export const ROLE_LETTERS = ['S', 'V', 'O', 'C', 'M', 'P', 'Po', '▷'] as const
export type RoleLetter = (typeof ROLE_LETTERS)[number]

export type SymbolId = ShapeKind | PosLetter | RoleLetter

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
}

/** 線がどの帯に書かれたか。above=品詞の行 / band=本文の行 / below=働きの行 */
export type Lane = 'above' | 'band' | 'below'
