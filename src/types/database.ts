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

// Field settings for note type fields
export interface FieldSettings {
  tts_enabled?: boolean       // TTS音声生成対象
  example_source?: boolean    // 例文生成のソース単語（レガシー）
  example_context?: boolean   // 例文生成のコンテキスト（レガシー）
  required?: boolean          // 必須フィールド（デフォルト: true）
  placeholder?: string        // 入力時プレースホルダー
}

// Generation rule for AI-powered field generation
export interface GenerationRule {
  id: string
  name: string                    // e.g., "例文生成", "コロケーション"
  source_fields: string[]         // e.g., ["Front", "Back"]
  instruction: string             // e.g., "この単語を使った例文を2つ生成してください"
  target_field: string            // e.g., "Examples"
}

// Field definition with settings
export interface FieldDefinition {
  name: string
  ord: number
  settings?: FieldSettings
}

export interface NoteType {
  id: string
  name: string
  owner_id: string | null
  fields: FieldDefinition[]
  generation_rules?: GenerationRule[]
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

// Generated content from AI (examples, collocations)
export interface GeneratedContent {
  examples: string[]
  collocations?: string[]
  generated_at: string
  model: string
}

export interface Note {
  id: string
  deck_id: string
  note_type_id: string
  field_values: Record<string, string>
  audio_urls: Record<string, string> | null
  generated_content: GeneratedContent | null
  tags: string[]
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

// Deck tree types
export interface DeckWithChildren extends DeckWithStats {
  parent_deck_id: string | null
  children: DeckWithChildren[]
  depth: number
}

// Study session types
export interface StudyCardData {
  id: string
  noteId: string
  fieldValues: Record<string, string>
  audioUrls: Record<string, string> | null
  generatedContent: GeneratedContent | null
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

// Statistics types
export interface DailyReviewData {
  date: string
  total: number
  correct: number
  incorrect: number
}

export interface CardDistribution {
  new: number
  learning: number
  review: number
  relearning: number
}

export interface AccuracyData {
  date: string
  accuracy: number
}

export interface DeckProgressData {
  deckId: string
  deckName: string
  totalCards: number
  masteredCards: number
  learningCards: number
  newCards: number
}

export interface TimeStats {
  totalReviewTime: number
  averageTimePerCard: number
}

export interface DetailedStats {
  dailyReviews: DailyReviewData[]
  cardDistribution: CardDistribution
  accuracyTrend: AccuracyData[]
  deckProgress: DeckProgressData[]
  timeStats: TimeStats
  streak: number
  totalReviews: number
  overallAccuracy: number
}

// Note type with templates for UI
export interface NoteTypeWithTemplates extends NoteType {
  card_templates: CardTemplate[]
}

// Template input for creating note types
export interface TemplateInput {
  name: string
  ordinal: number
  front_template: string
  back_template: string
  css: string
}
