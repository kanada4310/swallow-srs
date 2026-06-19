/**
 * 多段階設問（識別演習）— 純ロジックの公開API。
 */
export * from './types'
export {
  QUESTIONS_FIELD,
  HIGHLIGHTS_FIELD,
  parseQuestions,
  parseHighlights,
  isMultiStepNote,
} from './parse'
export { UNKNOWN_ANSWER, UNKNOWN_LABEL, shuffle, gradeSelect, gradeText } from './grade'
export {
  TARGET_MS_PER_QUESTION,
  ACCURACY_WEIGHT,
  SPEED_WEIGHT,
  SPEED_EASY_THRESHOLD,
  ACCURACY_HARD_THRESHOLD,
  computeScore,
  deriveEase,
  type EaseValue,
} from './score'
