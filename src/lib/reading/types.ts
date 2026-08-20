/**
 * 読解ページの型定義。
 *
 * 教材データ（seg JSON）は工房（quiz_generator）の
 * `subjects/英語/deliver_reading_data.py` が `public/reading-data/` に届ける（契約 C22）。
 * ここでは「届いた形をそのまま読む」ことに徹し、演習室側で形を変えない。
 */

/** 関係記号（8種＋TS）。工房の logic_tree と同じ表記をそのまま使う。 */
export const SYM_LABEL: Record<string, string> = {
  '→': '結果',
  '←': '根拠',
  '⇔': '対比',
  '△': '譲歩',
  'ex.': '例示',
  '＝': '言い換え',
  '＋': '並列',
  '└': '具体化',
  '⊂': '条件',
  TS: '主題文',
}

export interface ReadingSentence {
  id: string
  text: string
  tokens: string[]
}

/** 事柄（模範）。読解の最小単位。 */
export interface ReadingKoto {
  no: number
  s: string
  en: string
  sym: string
  lv: number
  role: 'claim' | 'major' | 'minor' | string
  parent: number | null
  relParent: number | null
  relSym: string
  relAlts: number[]
  /** 模範の大意（日本語） */
  t: string
  cue: string
  packed: string
  expand: string
  sentence: number
}

/** 模範の事柄がどのトークン位置から始まるか */
export interface ReadingSegmentMark {
  sentence: number
  token: number
  no: number
  cont: boolean
}

/** 必須の切れ目（見逃すと論理関係が消える境界） */
export interface ReadingRequiredCut {
  sentence: number
  gap: number
  beforeNo: number
  afterNo: number
  cue: string
  sym: string
  tBefore: string
  tAfter: string
}

/** 畳み境界（切らずに1まとまりとして読めてもよい境界） */
export interface ReadingFoldBoundary {
  sentence: number
  gap: number
}

/** 正規形アンカー（DEC-035）。講師の検収が済んだ講にだけ入る。いまは全講とも未添付。 */
export interface ReadingAnchor {
  macro?: string
  chain: Array<{ ja: string }>
}

export interface ReadingParagraph {
  no: number
  sentences: ReadingSentence[]
  kotos: ReadingKoto[]
  segments: ReadingSegmentMark[]
  foldBoundaries: ReadingFoldBoundary[]
  requiredCuts: ReadingRequiredCut[]
  macro: string
  macroSym: string
  anchor?: ReadingAnchor | null
}

export interface ReadingLessonData {
  meta: {
    subject?: string
    textbook?: string
    lesson?: string
    source?: string
    university?: string
    target_time_min?: number
    generated_by?: string
    anchorStatus?: string | null
  }
  paragraphs: ReadingParagraph[]
}

/** index.json の1行 */
export interface ReadingLessonIndexEntry {
  id: string
  file: string
  textbook: string
  lesson: string
  source: string
  paragraphs: number
  requiredCuts: number
  anchorStatus: string | null
  anchorApproved: boolean
}

export interface ReadingLessonIndex {
  generatedBy?: string
  contract?: string
  lessons: ReadingLessonIndexEntry[]
}

/* ===================== 生徒の作業状態（保存対象） ===================== */

/** 大意。1つの文（string）または「A → B」の構造化形。 */
export type Gist = string | { a: string; b: string }

/** 組み立てキャンバスの1行 */
export interface ArrangeItem {
  /** 表示番号（1始まり） */
  no: number
  /** セグメント識別子 "si:start"（全体の組み立てでは段落番号の文字列） */
  id: string
  indent: number
  sym: string
}

/** 切れ目ごとのヒント使用状況。hint = 0 自力 / 1 段落の指定 / 2 文の指定 / 3 手がかり語 / 4 開示 */
export interface CutStat {
  hint: number
  resolved: boolean
}

export interface ParagraphWork {
  /** 切れ目のキー "si:gap" */
  cuts: string[]
  committed: boolean
  passed: boolean
  attempts: number
  cutStats: Record<string, CutStat>
  extraCount: number
  gists: Record<string, Gist>
  arrange: ArrangeItem[] | null
  relAttempts: number
  /** 組み立ての判定が全部合ったか */
  relPassed: boolean
}

export interface GlobalWork {
  /** 段落番号 → 要旨 */
  gists: Record<string, string>
  arrange: ArrangeItem[] | null
  attempts: number
  passed: boolean
}

/** 1本の流れのどこにいるか */
export type ReadingStep = 'read' | 'cut' | 'gist' | 'arrange' | 'global' | 'summary'

export const STEP_ORDER: ReadingStep[] = ['read', 'cut', 'gist', 'arrange', 'global', 'summary']

export const STEP_LABEL: Record<ReadingStep, string> = {
  read: '読む',
  cut: '切る',
  gist: '大意',
  arrange: '組み立て',
  global: '全体',
  summary: 'まとめ',
}

/** 判定の出し方。drill = 段落ごとに即時判定 / review = 全部組んでから講評（DEC-032 の二重ループ） */
export type ReadingMode = 'drill' | 'review'

/** 保存する作業状態のすべて（DB の JSONB にそのまま入る） */
export interface ReadingProgressState {
  version: 1
  lessonId: string
  mode: ReadingMode
  step: ReadingStep
  paraIdx: number
  paragraphs: ParagraphWork[]
  global: GlobalWork
  /** ISO 文字列。端末をまたぐときの新旧判定に使う */
  updatedAt: string
  startedAt: string
  completedAt: string | null
}
