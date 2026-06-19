/**
 * 採点ロジック（選択式の自動判定 / 記述式の自己採点 / 根拠問題の合算）と
 * 選択肢シャッフル。元プロトタイプ（つばめ古文 識別演習）の挙動に準拠。
 */
import type { MultiStepQuestion, StepResult } from './types'

/** 「わからない」を選んだときの内部値（通常の選択肢と被らない） */
export const UNKNOWN_ANSWER = '__UNKNOWN__'
export const UNKNOWN_LABEL = 'わからない'

/** Fisher-Yates シャッフル（rng 差し替え可＝テスト用）。元配列は変更しない。 */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 選択式の採点（メイン＋根拠をまとめて）。
 * 根拠問題がある場合、総合正誤は「両方正解」のときのみ true。
 */
export function gradeSelect(
  question: MultiStepQuestion,
  mainChoice: string | null,
  followChoice: string | null = null
): StepResult {
  const mainCorrect = mainChoice === question.answer
  if (question.followUp) {
    const followCorrect = followChoice === question.followUp.answer
    return {
      id: question.id,
      mainCorrect,
      followCorrect,
      overallCorrect: mainCorrect && followCorrect,
      graded: true,
    }
  }
  return {
    id: question.id,
    mainCorrect,
    followCorrect: null,
    overallCorrect: mainCorrect,
    graded: true,
  }
}

/**
 * 記述式（現代語訳など）の完了。自己採点はせず、模範解答を見て進むだけ。
 * スコアの正答率には算入しない（graded:false）。最終判定は修了ページに委ねる。
 */
export function completeText(question: MultiStepQuestion): StepResult {
  return {
    id: question.id,
    mainCorrect: true,
    followCorrect: null,
    overallCorrect: true,
    graded: false,
  }
}
