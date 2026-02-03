// Database types for つばめSRS

export type UserRole = 'student' | 'teacher' | 'admin'
export type CardState = 'new' | 'learning' | 'review' | 'relearning'

export interface Profile {
  id: string
  email: string
  name: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Class {
  id: string
  name: string
  teacher_id: string
  created_at: string
  updated_at: string
}

export interface ClassMember {
  class_id: string
  user_id: string
  joined_at: string
}

export interface NoteType {
  id: string
  name: string
  owner_id: string | null
  fields: Array<{ name: string; ord: number }>
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface CardTemplate {
  id: string
  note_type_id: string
  name: string
  ordinal: number
  front_template: string
  back_template: string
  css: string
  created_at: string
  updated_at: string
}

export interface Deck {
  id: string
  name: string
  owner_id: string
  is_distributed: boolean
  parent_deck_id: string | null
  settings: {
    new_cards_per_day: number
  }
  created_at: string
  updated_at: string
}

export interface DeckAssignment {
  id: string
  deck_id: string
  class_id: string | null
  user_id: string | null
  assigned_at: string
}

export interface Note {
  id: string
  deck_id: string
  note_type_id: string
  field_values: Record<string, string>
  audio_urls: Record<string, string> | null
  source_info: {
    book?: string
    unit?: number
    number?: number
  } | null
  created_at: string
  updated_at: string
}

export interface Card {
  id: string
  note_id: string
  deck_id: string
  template_index: number
  created_at: string
  updated_at: string
}

export interface CardStateRecord {
  user_id: string
  card_id: string
  due: string
  interval: number
  ease_factor: number
  repetitions: number
  state: CardState
  learning_step: number
  updated_at: string
}

export interface ReviewLog {
  id: string
  user_id: string
  card_id: string
  ease: 1 | 2 | 3 | 4
  interval: number
  last_interval: number
  time_ms: number | null
  reviewed_at: string
  synced_at: string | null
}

// Extended types for UI
export interface DeckWithStats extends Deck {
  total_cards: number
  new_count: number
  learning_count: number
  review_count: number
  owner?: {
    name: string
  }
}

// Study session types
export interface StudyCardData {
  id: string
  noteId: string
  fieldValues: Record<string, string>
  audioUrls: Record<string, string> | null
  template: {
    front: string
    back: string
    css: string
  }
  clozeNumber?: number
  schedule: {
    due: Date
    interval: number
    easeFactor: number
    repetitions: number
    state: CardState
    learningStep: number
  }
}

// TTS types
export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'

export interface UserTTSSettings {
  user_id: string
  enabled_fields: string[]
  voice: TTSVoice
  speed: number
  created_at: string
  updated_at: string
}
