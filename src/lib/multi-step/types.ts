/**
 * 多段階設問（識別演習）の型定義。
 *
 * 1ノート＝1例文。例文に対して複数の設問（①意味・品詞 → ②文法的根拠 → ③和訳…）を
 * 順番に解かせ、全設問の正誤を集約して SRS 評価を1回だけ行う（例文単位で間隔管理）。
 *
 * データはノートの保存フィールド「設問」(JSON配列) と「傍線」(JSON配列) に格納する。
 * 元教材（つばめ古文 識別演習）のデータ構造をそのまま取り込めるよう、パーサは
 * snake_case（highlight_id / correct_answer 等）と camelCase の両方を受理する。
 */

/** 回答方式: select=選択式（自動判定） / text=記述式（自己採点） */
export type AnswerFormat = 'select' | 'text'

/** 根拠を問う連鎖質問（メイン設問と同時表示・まとめて採点） */
export interface FollowUp {
  prompt: string
  choices: string[]
  /** 正解の選択肢文字列（選択肢と完全一致で判定） */
  answer: string
  explanation: string | null
}

/** 1つの設問 */
export interface MultiStepQuestion {
  id: string
  /** 原文ハイライト（傍線部）への参照。null=傍線なし（和訳など文全体が対象） */
  highlightId: string | null
  /** 設問種別バッジ（識別 / 分解 / 活用形 / 助動詞の意味 / 和訳 …） */
  questionType: string | null
  prompt: string
  format: AnswerFormat
  /** 選択式の選択肢（記述式では空配列） */
  choices: string[]
  /** 正解。選択式は選択肢文字列、記述式は模範解答 */
  answer: string
  explanation: string | null
  /** 教材参照ページ（任意） */
  referencePage: number | null
  /** 根拠問題（任意・選択式設問のみ） */
  followUp: FollowUp | null
}

/** 原文ハイライト（傍線部）。start/end は「例文」文字列へのインデックス */
export interface Highlight {
  id: string
  start: number
  end: number
  text: string | null
}

/** 1設問の採点結果 */
export interface StepResult {
  /** 設問 id */
  id: string
  mainCorrect: boolean
  /** 根拠問題の正誤。null=根拠問題なし */
  followCorrect: boolean | null
  /** 総合正誤（根拠ありは main && follow） */
  overallCorrect: boolean
}

/** 例文1件分のスコア（正誤＋解答時間から算出） */
export interface ExampleScore {
  /** 総合スコア 0-100（正誤を主・時間を従に合成） */
  score: number
  /** 正答率 0-100 */
  accuracyPct: number
  /** 正解した設問数 */
  correct: number
  /** 総設問数 */
  total: number
  /** 解答に要した総時間(ms) */
  elapsedMs: number
  /** 速さ係数 0-1（目標時間内なら 1.0） */
  speedScore: number
}
