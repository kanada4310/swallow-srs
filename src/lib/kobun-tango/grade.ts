/**
 * 古文単語演習の純ロジック：選択肢生成・採点・スコア・SRS評価。
 *
 * ダミー選択肢はノートに焼き込んだプール（問題.distractors）から毎回ランダム抽出する。
 * 採点は「正誤」を主・「解答時間」を従にスコア化し、そこから SRS 評価を自動判定する
 * （識別演習＝多段階設問の score.ts と同じ思想・しきい値）。
 */
import type {
  KobunQuestion,
  KobunQuestionA,
  KobunQuestionB,
  KobunStepResult,
  KobunScore,
  EaseValue,
} from './types'

/** 「わからない」選択肢の内部値とラベル */
export const UNKNOWN_ANSWER = '__dk__'
export const UNKNOWN_LABEL = 'わからない'

/** 1問あたりの目標解答時間(ms)。これ以内なら速さ満点。 */
export const TARGET_MS = 20_000
export const ACCURACY_WEIGHT = 0.85
export const SPEED_WEIGHT = 0.15
/** 全問正解時に「簡単」と判定する速さ係数のしきい値 */
export const SPEED_EASY_THRESHOLD = 0.8
/** 「難しい」と判定する最低正答度（これ未満は「もう一度」） */
export const ACCURACY_HARD_THRESHOLD = 0.5

/** Fisher–Yates シャッフル（非破壊）。rng は 0<=r<1 を返す（テスト用に差し替え可）。 */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** プールから n 件をランダム抽出（重複なし・n がプールを超えれば全件）。 */
export function pickN<T>(pool: readonly T[], n: number, rng: () => number = Math.random): T[] {
  return shuffle(pool, rng).slice(0, Math.max(0, Math.min(n, pool.length)))
}

/**
 * モードA の選択肢を組み立てる。
 * 正解（全語義）＋ ダミーを混ぜてシャッフル。ダミー数は tango.html と同じ式：
 *   dn = max(正解数, 4 - 正解数, 2)
 */
export function buildOptionsA(q: KobunQuestionA, rng: () => number = Math.random): string[] {
  const dn = Math.max(q.correct.length, 4 - q.correct.length, 2)
  const distractors = pickN(q.distractors, dn, rng)
  return shuffle(q.correct.concat(distractors), rng)
}

/** モードB の選択肢を組み立てる（正解1＋ダミー3の四択）。 */
export function buildOptionsB(q: KobunQuestionB, rng: () => number = Math.random): string[] {
  const distractors = pickN(q.distractors, 3, rng)
  return shuffle([q.correct, ...distractors], rng)
}

function setEq(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x))
}

/**
 * 採点。selected は選んだ選択肢（「わからない」は UNKNOWN_ANSWER を含めて渡してよい）。
 * モードA は集合一致で完全正解、部分点は (正解選択 − 誤選択)/正解数 を 0..1 に丸めて算出。
 * モードB は一致で 1、不一致で 0。
 */
export function grade(q: KobunQuestion, selected: readonly string[]): KobunStepResult {
  const dontKnow = selected.includes(UNKNOWN_ANSWER)
  const chosen = selected.filter((v) => v !== UNKNOWN_ANSWER)

  if (q.mode === 'A') {
    const correct = q.correct
    const overallCorrect = !dontKnow && setEq(chosen, correct)
    let fraction = 0
    if (!dontKnow) {
      const tp = chosen.filter((c) => correct.includes(c)).length
      const fp = chosen.filter((c) => !correct.includes(c)).length
      fraction = Math.max(0, Math.min(1, (tp - fp) / correct.length))
    }
    return { mode: 'A', chosen, correct, dontKnow, overallCorrect, fraction }
  }

  // mode B
  const correct = [q.correct]
  const overallCorrect = !dontKnow && chosen.length === 1 && chosen[0] === q.correct
  return {
    mode: 'B',
    chosen,
    correct,
    dontKnow,
    overallCorrect,
    fraction: overallCorrect ? 1 : 0,
  }
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0
  return Math.max(0, Math.min(1, x))
}

/** スコア（正誤＋解答時間）を 0-100 で算出。 */
export function computeKobunScore(result: KobunStepResult, elapsedMs: number): KobunScore {
  const safeElapsed = Math.max(0, elapsedMs)
  const accuracy = clamp01(result.fraction)
  const speedScore = safeElapsed <= 0 ? 1 : clamp01(TARGET_MS / safeElapsed)
  const score = Math.round(100 * (ACCURACY_WEIGHT * accuracy + SPEED_WEIGHT * speedScore))
  return {
    score,
    accuracyPct: Math.round(accuracy * 100),
    elapsedMs: safeElapsed,
    speedScore,
  }
}

/**
 * スコアから SRS 評価を自動判定する（生徒はタップで手直しできる）。
 *   完全正解（正答度100%）＆ 速い → 簡単 (Easy)
 *   完全正解 ＆ 普通〜遅い        → 正解 (Good)
 *   一部正解（正答度50%以上）     → 難しい (Hard)
 *   正答度50%未満 / わからない    → もう一度 (Again)
 */
export function deriveKobunEase(score: KobunScore): EaseValue {
  const accuracy = score.accuracyPct / 100
  if (accuracy < ACCURACY_HARD_THRESHOLD) return 1 // Again
  if (accuracy < 1) return 2 // Hard
  return score.speedScore >= SPEED_EASY_THRESHOLD ? 4 : 3 // Easy or Good
}
