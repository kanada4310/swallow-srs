/**
 * DeckSettings バリデーション
 */

import type { DeckSettings } from '@/types/database'

export interface ValidationError {
  field: string
  message: string
}

export function validateDeckSettings(raw: Partial<DeckSettings>): ValidationError[] {
  const errors: ValidationError[] = []

  if (raw.new_cards_per_day !== undefined) {
    if (!Number.isInteger(raw.new_cards_per_day) || raw.new_cards_per_day < 0 || raw.new_cards_per_day > 9999) {
      errors.push({ field: 'new_cards_per_day', message: '1日の新規カード数は0〜9999の整数で指定してください' })
    }
  }

  if (raw.learning_steps !== undefined) {
    if (!Array.isArray(raw.learning_steps) || raw.learning_steps.length === 0) {
      errors.push({ field: 'learning_steps', message: '学習ステップは1つ以上必要です' })
    } else if (raw.learning_steps.some(s => typeof s !== 'number' || s <= 0 || s > 10080)) {
      errors.push({ field: 'learning_steps', message: '学習ステップは1〜10080分の正の数で指定してください' })
    }
  }

  if (raw.graduating_interval !== undefined) {
    if (typeof raw.graduating_interval !== 'number' || raw.graduating_interval < 1 || raw.graduating_interval > 36500) {
      errors.push({ field: 'graduating_interval', message: '卒業間隔は1〜36500日で指定してください' })
    }
  }

  if (raw.easy_interval !== undefined) {
    if (typeof raw.easy_interval !== 'number' || raw.easy_interval < 1 || raw.easy_interval > 36500) {
      errors.push({ field: 'easy_interval', message: 'Easy間隔は1〜36500日で指定してください' })
    }
  }

  if (raw.new_card_order !== undefined) {
    if (raw.new_card_order !== 'sequential' && raw.new_card_order !== 'random') {
      errors.push({ field: 'new_card_order', message: '新規カード順序が不正です' })
    }
  }

  if (raw.max_reviews_per_day !== undefined) {
    if (!Number.isInteger(raw.max_reviews_per_day) || raw.max_reviews_per_day < 0 || raw.max_reviews_per_day > 9999) {
      errors.push({ field: 'max_reviews_per_day', message: '最大復習数は0〜9999の整数で指定してください' })
    }
  }

  if (raw.easy_bonus !== undefined) {
    if (typeof raw.easy_bonus !== 'number' || raw.easy_bonus < 1.0 || raw.easy_bonus > 5.0) {
      errors.push({ field: 'easy_bonus', message: 'Easyボーナスは1.0〜5.0で指定してください' })
    }
  }

  if (raw.interval_modifier !== undefined) {
    if (typeof raw.interval_modifier !== 'number' || raw.interval_modifier < 0.1 || raw.interval_modifier > 5.0) {
      errors.push({ field: 'interval_modifier', message: '間隔倍率は0.1〜5.0で指定してください' })
    }
  }

  if (raw.max_interval !== undefined) {
    if (!Number.isInteger(raw.max_interval) || raw.max_interval < 1 || raw.max_interval > 36500) {
      errors.push({ field: 'max_interval', message: '最大間隔は1〜36500日で指定してください' })
    }
  }

  if (raw.hard_interval_modifier !== undefined) {
    if (typeof raw.hard_interval_modifier !== 'number' || raw.hard_interval_modifier < 0.5 || raw.hard_interval_modifier > 3.0) {
      errors.push({ field: 'hard_interval_modifier', message: 'Hard倍率は0.5〜3.0で指定してください' })
    }
  }

  if (raw.relearning_steps !== undefined) {
    if (!Array.isArray(raw.relearning_steps) || raw.relearning_steps.length === 0) {
      errors.push({ field: 'relearning_steps', message: '再学習ステップは1つ以上必要です' })
    } else if (raw.relearning_steps.some(s => typeof s !== 'number' || s <= 0 || s > 10080)) {
      errors.push({ field: 'relearning_steps', message: '再学習ステップは1〜10080分の正の数で指定してください' })
    }
  }

  if (raw.lapse_new_interval !== undefined) {
    if (typeof raw.lapse_new_interval !== 'number' || raw.lapse_new_interval < 0.0 || raw.lapse_new_interval > 1.0) {
      errors.push({ field: 'lapse_new_interval', message: 'ラプス間隔倍率は0.0〜1.0で指定してください' })
    }
  }

  if (raw.lapse_min_interval !== undefined) {
    if (!Number.isInteger(raw.lapse_min_interval) || raw.lapse_min_interval < 1 || raw.lapse_min_interval > 36500) {
      errors.push({ field: 'lapse_min_interval', message: 'ラプス最小間隔は1〜36500日で指定してください' })
    }
  }

  if (raw.leech_threshold !== undefined) {
    if (!Number.isInteger(raw.leech_threshold) || raw.leech_threshold < 0 || raw.leech_threshold > 99) {
      errors.push({ field: 'leech_threshold', message: 'リーチしきい値は0〜99の整数で指定してください' })
    }
  }

  if (raw.leech_action !== undefined) {
    if (raw.leech_action !== 'suspend' && raw.leech_action !== 'tag') {
      errors.push({ field: 'leech_action', message: 'リーチアクションが不正です' })
    }
  }

  if (raw.new_review_mix !== undefined) {
    if (!['mix', 'new_first', 'review_first'].includes(raw.new_review_mix)) {
      errors.push({ field: 'new_review_mix', message: '表示順設定が不正です' })
    }
  }

  if (raw.review_sort !== undefined) {
    if (!['due_date', 'due_date_random', 'random'].includes(raw.review_sort)) {
      errors.push({ field: 'review_sort', message: '復習順設定が不正です' })
    }
  }

  if (raw.answer_time_limit !== undefined) {
    if (!Number.isInteger(raw.answer_time_limit) || raw.answer_time_limit < 0 || raw.answer_time_limit > 999) {
      errors.push({ field: 'answer_time_limit', message: '回答制限時間は0〜999の整数で指定してください' })
    }
  }

  if (raw.timer_action !== undefined) {
    if (!['flip', 'auto_again', 'none'].includes(raw.timer_action)) {
      errors.push({ field: 'timer_action', message: 'タイマーアクションが不正です' })
    }
  }

  if (raw.swipe_enabled !== undefined) {
    if (typeof raw.swipe_enabled !== 'boolean') {
      errors.push({ field: 'swipe_enabled', message: 'スワイプ設定はtrue/falseで指定してください' })
    }
  }

  // === TTS settings ===

  if (raw.tts_voice !== undefined) {
    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
    if (!validVoices.includes(raw.tts_voice)) {
      errors.push({ field: 'tts_voice', message: 'ボイスが不正です' })
    }
  }

  if (raw.tts_speed !== undefined) {
    if (typeof raw.tts_speed !== 'number' || raw.tts_speed < 0.25 || raw.tts_speed > 4.0) {
      errors.push({ field: 'tts_speed', message: '音声速度は0.25〜4.0で指定してください' })
    }
  }

  // === FSRS settings ===

  if (raw.algorithm !== undefined) {
    if (raw.algorithm !== 'sm2' && raw.algorithm !== 'fsrs') {
      errors.push({ field: 'algorithm', message: 'アルゴリズムはsm2またはfsrsを選択してください' })
    }
  }

  if (raw.fsrs_desired_retention !== undefined) {
    if (typeof raw.fsrs_desired_retention !== 'number' || raw.fsrs_desired_retention < 0.7 || raw.fsrs_desired_retention > 0.97) {
      errors.push({ field: 'fsrs_desired_retention', message: '目標記憶率は0.70〜0.97で指定してください' })
    }
  }

  if (raw.fsrs_maximum_interval !== undefined) {
    if (!Number.isInteger(raw.fsrs_maximum_interval) || raw.fsrs_maximum_interval < 1 || raw.fsrs_maximum_interval > 36500) {
      errors.push({ field: 'fsrs_maximum_interval', message: 'FSRS最大間隔は1〜36500日で指定してください' })
    }
  }

  if (raw.fsrs_enable_fuzz !== undefined) {
    if (typeof raw.fsrs_enable_fuzz !== 'boolean') {
      errors.push({ field: 'fsrs_enable_fuzz', message: 'ファジング設定はtrue/falseで指定してください' })
    }
  }

  if (raw.fsrs_enable_short_term !== undefined) {
    if (typeof raw.fsrs_enable_short_term !== 'boolean') {
      errors.push({ field: 'fsrs_enable_short_term', message: '短期スケジュール設定はtrue/falseで指定してください' })
    }
  }

  if (raw.fsrs_weights !== undefined) {
    if (!Array.isArray(raw.fsrs_weights)) {
      errors.push({ field: 'fsrs_weights', message: 'FSRS重みは配列で指定してください' })
    } else if (raw.fsrs_weights.length > 0 && raw.fsrs_weights.some(w => typeof w !== 'number')) {
      errors.push({ field: 'fsrs_weights', message: 'FSRS重みは数値の配列で指定してください' })
    }
  }

  return errors
}
