/**
 * 古文単語演習（tango.html モードA/B 相当）— 純ロジックの公開API。
 */
export * from './types'
export {
  QUESTION_FIELD,
  PASSAGE_FIELD,
  HEADWORD_FORM_FIELD,
  SOURCE_FIELD,
  TRANSLATION_FIELD,
  parseKobunQuestion,
  parseKobunMeta,
  parseKobunBDisplay,
  isKobunTangoNote,
} from './parse'
export {
  UNKNOWN_ANSWER,
  UNKNOWN_LABEL,
  TARGET_MS,
  SPEED_EASY_THRESHOLD,
  ACCURACY_HARD_THRESHOLD,
  shuffle,
  pickN,
  buildOptionsA,
  buildOptionsB,
  grade,
  computeKobunScore,
  deriveKobunEase,
} from './grade'
