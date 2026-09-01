/**
 * 判別のしきい値・機能の設定（2026-09-01・手書き判定の精度向上）。
 *
 * 「着手前（2026-09-01 時点）の挙動」を LEGACY_TUNING として丸ごと残してある。
 * 目的は前後比較: 実機で採った同じ線に対して、着手前の判定と改修後の判定を
 * 同じ計測（metrics.ts の evaluateSamples）で並べて数えられるようにする。
 * 実運用の判定は DEFAULT_TUNING（改修後の値）を使う。
 *
 * 合格水準（2026-08-31 文字認識検討会・確定）:
 * - 一発確定率 85% 以上（塾長運用）
 * - 取り違え率 0.5% 以下（最優先。候補選びを減らすために取り違えを増やす調整はしない）
 */

export interface RecognizerTuning {
  /** 形の記号: 最有力候補の確信がこれ未満なら判別失敗（候補チップ→一覧へ） */
  minScoreShape: number
  /** 形の記号: 1位と2位の差がこれ未満なら「迷った」（候補チップ） */
  marginShape: number
  /** 文字: 最有力候補の確信がこれ未満なら判別失敗 */
  minScoreLetter: number
  /** 文字: 1位と2位の差がこれ未満なら「迷った」 */
  marginLetter: number
  /**
   * 取り違えゼロ側の安全弁（検討会・論点4）: 最有力候補の確信がこの値未満なら、
   * 差が開いていても自動確定させず候補選びに回す。0 なら無効（着手前の挙動）。
   */
  confirmMinShape: number
  confirmMinLetter: number
  /** 働きの文字に幾何特徴（S字カーブ・閉じた三角など）の裏付けを混ぜる（項目2） */
  roleGeometry: boolean
  /** 波線の判定条件を緩める（反転3回→2回。項目2・候補に挙がる前に弾かれる問題） */
  wavyRelaxed: boolean
  /** 文字の行（上下の段）でも、波線らしい線は波線として拾う（項目2） */
  wavyInLetterLane: boolean
}

/** 着手前（2026-09-01 時点）の挙動。前後比較の「前」として使う。変更しないこと */
export const LEGACY_TUNING: RecognizerTuning = {
  minScoreShape: 0.35,
  marginShape: 0.12,
  minScoreLetter: 0.3,
  marginLetter: 0.08,
  confirmMinShape: 0,
  confirmMinLetter: 0,
  roleGeometry: false,
  wavyRelaxed: false,
  wavyInLetterLane: false,
}

/**
 * 実運用の値。しきい値は機械計測（accuracy.test.ts）と実書きの実測で調整する。
 * confirmMin* は「取り違え（誤ったまま確定）を 0.5% 以下へ」のための下限。
 * ※ 段階0（着手前の実測）の時点では LEGACY と同値。項目2・3の段階で更新する。
 */
export const DEFAULT_TUNING: RecognizerTuning = {
  minScoreShape: 0.35,
  marginShape: 0.12,
  minScoreLetter: 0.3,
  marginLetter: 0.08,
  confirmMinShape: 0,
  confirmMinLetter: 0,
  roleGeometry: false,
  wavyRelaxed: false,
  wavyInLetterLane: false,
}
