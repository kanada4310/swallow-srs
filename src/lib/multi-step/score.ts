/**
 * スコア算出（正誤＋解答時間）と SRS 評価の集約。
 *
 * スコアは「正誤」を主・「解答時間」を従に 0-100 で合成する。
 * 速さで減点しすぎないよう、時間成分の重みは小さく抑える。
 */
import type { StepResult, ExampleScore } from './types'

/** 1設問あたりの目標解答時間(ms)。これ以内なら速さ満点。 */
export const TARGET_MS_PER_QUESTION = 20_000
/** 正誤成分の重み */
export const ACCURACY_WEIGHT = 0.85
/** 解答時間成分の重み */
export const SPEED_WEIGHT = 0.15

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0
  return Math.max(0, Math.min(1, x))
}

/**
 * 例文1件分のスコアを算出する。
 * - 正答率 = 総合正解数 / 総設問数
 * - 速さ係数 = 目標時間 / 実時間（目標以内なら 1.0、2倍遅いと 0.5）
 * - 総合スコア = round(100 * (0.85*正答率 + 0.15*速さ))
 */
export function computeScore(results: readonly StepResult[], elapsedMs: number): ExampleScore {
  const totalQuestions = results.length
  const safeElapsed = Math.max(0, elapsedMs)

  if (totalQuestions === 0) {
    return { score: 0, accuracyPct: 0, correct: 0, total: 0, elapsedMs: safeElapsed, speedScore: 0 }
  }

  // 正答率は採点対象（選択式）のみ。記述式（graded:false）は算入しない。
  // 採点対象が無い（記述のみ）例文は「誤りなし＝100%」扱い（最終判定は生徒に委ねる）。
  const graded = results.filter((r) => r.graded)
  const total = graded.length
  const correct = graded.filter((r) => r.overallCorrect).length
  const accuracy = total > 0 ? correct / total : 1

  // 解答時間は全設問にかかるので目標時間は総設問数で見る
  const targetMs = Math.max(1, totalQuestions * TARGET_MS_PER_QUESTION)
  // 解答時間が0（即答すり抜け等）の場合は速さ満点扱い
  const speedScore = safeElapsed <= 0 ? 1 : clamp01(targetMs / safeElapsed)

  const score = Math.round(100 * (ACCURACY_WEIGHT * accuracy + SPEED_WEIGHT * speedScore))

  return {
    score,
    accuracyPct: Math.round(accuracy * 100),
    correct,
    total,
    elapsedMs: safeElapsed,
    speedScore,
  }
}

/** SRS 評価値（1=Again, 2=Hard, 3=Good, 4=Easy）。scheduler の Ease と一致。 */
export type EaseValue = 1 | 2 | 3 | 4

/** 全問正解時に「簡単」と判定する速さ係数のしきい値（目標時間の約1.25倍以内なら速い） */
export const SPEED_EASY_THRESHOLD = 0.8
/** 「難しい」と判定する最低正答率（これ未満は「もう一度」） */
export const ACCURACY_HARD_THRESHOLD = 0.5

/**
 * スコア（正誤＋解答時間）から SRS 評価を**自動判定**する。
 * 生徒は4択を選ばない。例文単位で1回だけ、出来栄えに応じてアプリが決める。
 *
 *   全問正解 ＆ 速い（目標時間内）   → 簡単 (Easy)
 *   全問正解 ＆ 普通〜遅い           → 正解 (Good)
 *   一部正解（正答率 50% 以上）       → 難しい (Hard)   ＝近いうちに再出題
 *   正答率 50% 未満                  → もう一度 (Again) ＝学び直し
 *
 * しきい値は SPEED_EASY_THRESHOLD / ACCURACY_HARD_THRESHOLD で調整可能。
 */
export function deriveEase(score: ExampleScore): EaseValue {
  const accuracy = score.accuracyPct / 100
  if (accuracy < ACCURACY_HARD_THRESHOLD) return 1 // Again
  if (accuracy < 1) return 2 // Hard
  return score.speedScore >= SPEED_EASY_THRESHOLD ? 4 : 3 // Easy or Good
}
