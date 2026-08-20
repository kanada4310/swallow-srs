/**
 * 途中保存の状態づくりと集計（純ロジック）。
 *
 * 保存の単位は「生徒 × 講」。中身は 1 つの JSON（ReadingProgressState）で、
 * どこで切ったか・大意・組み立て・ヒントを何段押したかが全部入っている。
 * これがそのまま講師の見る画面の材料になる（別に集計表を持たない）。
 */

import type {
  GlobalWork,
  ParagraphWork,
  ReadingLessonData,
  ReadingMode,
  ReadingProgressState,
  ReadingStep,
} from './types'
import { cutKey } from './segments'

export const PROGRESS_VERSION = 1 as const

export function emptyParagraphWork(requiredCuts: Array<{ sentence: number; gap: number }>): ParagraphWork {
  return {
    cuts: [],
    committed: false,
    passed: false,
    attempts: 0,
    cutStats: Object.fromEntries(
      requiredCuts.map((c) => [cutKey(c.sentence, c.gap), { hint: 0, resolved: false }])
    ),
    extraCount: 0,
    gists: {},
    arrange: null,
    relAttempts: 0,
    relPassed: false,
  }
}

export function emptyProgress(
  lessonId: string,
  data: ReadingLessonData,
  now: Date = new Date()
): ReadingProgressState {
  const iso = now.toISOString()
  return {
    version: PROGRESS_VERSION,
    lessonId,
    mode: 'drill',
    step: 'read',
    paraIdx: 0,
    paragraphs: data.paragraphs.map((p) => emptyParagraphWork(p.requiredCuts || [])),
    global: { gists: {}, arrange: null, attempts: 0, passed: false },
    updatedAt: iso,
    startedAt: iso,
    completedAt: null,
  }
}

/**
 * 保存されていた状態を、いまの教材データに合わせて読み直す。
 * 教材を作り直して段落数や必須切れ目が変わっていても壊れないようにする（C22 の作り直しに耐える）。
 */
export function reconcileProgress(
  saved: ReadingProgressState | null | undefined,
  lessonId: string,
  data: ReadingLessonData,
  now: Date = new Date()
): ReadingProgressState {
  const fresh = emptyProgress(lessonId, data, now)
  if (!saved || saved.version !== PROGRESS_VERSION || saved.lessonId !== lessonId) return fresh

  const paragraphs = data.paragraphs.map((p, i) => {
    const base = fresh.paragraphs[i]
    const old = saved.paragraphs?.[i]
    if (!old) return base
    // cutStats は「いまの必須切れ目」を鍵にして引き継ぐ（消えた切れ目は落とす）
    const cutStats = Object.fromEntries(
      Object.keys(base.cutStats).map((key) => [key, old.cutStats?.[key] ?? { hint: 0, resolved: false }])
    )
    return {
      ...base,
      ...old,
      cuts: Array.isArray(old.cuts) ? old.cuts : [],
      gists: old.gists ?? {},
      arrange: old.arrange ?? null,
      cutStats,
      relPassed: old.relPassed ?? false,
    }
  })

  return {
    ...fresh,
    mode: saved.mode === 'review' ? 'review' : 'drill',
    step: isStep(saved.step) ? saved.step : 'read',
    paraIdx: Math.min(Math.max(saved.paraIdx ?? 0, 0), Math.max(data.paragraphs.length - 1, 0)),
    paragraphs,
    global: {
      gists: saved.global?.gists ?? {},
      arrange: saved.global?.arrange ?? null,
      attempts: saved.global?.attempts ?? 0,
      passed: saved.global?.passed ?? false,
    },
    startedAt: saved.startedAt ?? fresh.startedAt,
    updatedAt: saved.updatedAt ?? fresh.updatedAt,
    completedAt: saved.completedAt ?? null,
  }
}

function isStep(s: unknown): s is ReadingStep {
  return typeof s === 'string' && ['read', 'cut', 'gist', 'arrange', 'global', 'summary'].includes(s)
}

/** 端末をまたいだときは、後に更新されたほうを採る（AnkiWeb 方式ではなく単純な後勝ち） */
export function pickNewer(
  a: ReadingProgressState | null,
  b: ReadingProgressState | null
): ReadingProgressState | null {
  if (!a) return b
  if (!b) return a
  return new Date(a.updatedAt).getTime() >= new Date(b.updatedAt).getTime() ? a : b
}

/* ===================== 集計（まとめ画面・講師の画面で共有） ===================== */

/** ヒント段数の内訳。0=自力 / 1=段落の指定 / 2=文の指定 / 3=手がかり語 / 4=開示 */
export interface HintBreakdown {
  self: number
  para: number
  sentence: number
  cue: number
  reveal: number
}

export interface ParagraphSummary {
  paraNo: number
  requiredCuts: number
  passed: boolean
  attempts: number
  extraCount: number
  gistsWritten: number
  gistsTotal: number
  relPassed: boolean
  hints: HintBreakdown
}

export interface ProgressSummary {
  lessonId: string
  /** どこまで進んだか */
  step: ReadingStep
  mode: ReadingMode
  paragraphsTotal: number
  paragraphsPassed: number
  requiredCutsTotal: number
  cutsFound: number
  hints: HintBreakdown
  /** ヒントを1段でも使った切れ目の数 */
  hintUsedCuts: number
  globalPassed: boolean
  completed: boolean
  updatedAt: string
  startedAt: string
  paragraphs: ParagraphSummary[]
}

function emptyHints(): HintBreakdown {
  return { self: 0, para: 0, sentence: 0, cue: 0, reveal: 0 }
}

function addHint(acc: HintBreakdown, level: number) {
  if (level <= 0) acc.self += 1
  else if (level === 1) acc.para += 1
  else if (level === 2) acc.sentence += 1
  else if (level === 3) acc.cue += 1
  else acc.reveal += 1
}

export function summarizeProgress(
  state: ReadingProgressState,
  segmentCounts?: number[]
): ProgressSummary {
  const hints = emptyHints()
  let requiredCutsTotal = 0
  let cutsFound = 0
  let hintUsedCuts = 0

  const paragraphs: ParagraphSummary[] = (state.paragraphs || []).map((w, i) => {
    const pHints = emptyHints()
    const stats = Object.entries(w.cutStats || {})
    const cutSet = new Set(w.cuts || [])
    stats.forEach(([key, st]) => {
      requiredCutsTotal += 1
      if (cutSet.has(key)) cutsFound += 1
      addHint(pHints, st.hint)
      addHint(hints, st.hint)
      if (st.hint > 0) hintUsedCuts += 1
    })
    const gistsTotal = segmentCounts?.[i] ?? Object.keys(w.gists || {}).length
    const gistsWritten = Object.values(w.gists || {}).filter((g) =>
      typeof g === 'string' ? g.trim().length > 0 : (g?.a || '').trim() && (g?.b || '').trim()
    ).length
    return {
      paraNo: i + 1,
      requiredCuts: stats.length,
      passed: !!w.passed,
      attempts: w.attempts || 0,
      extraCount: w.extraCount || 0,
      gistsWritten,
      gistsTotal,
      relPassed: !!w.relPassed,
      hints: pHints,
    }
  })

  return {
    lessonId: state.lessonId,
    step: state.step,
    mode: state.mode,
    paragraphsTotal: paragraphs.length,
    paragraphsPassed: paragraphs.filter((p) => p.passed).length,
    requiredCutsTotal,
    cutsFound,
    hints,
    hintUsedCuts,
    globalPassed: !!state.global?.passed,
    completed: !!state.completedAt,
    updatedAt: state.updatedAt,
    startedAt: state.startedAt,
    paragraphs,
  }
}

/** 講師の一覧に出す「どこまで」の一言 */
export function describeStep(summary: ProgressSummary): string {
  if (summary.completed) return 'まとめまで終了'
  const stepLabel: Record<ReadingStep, string> = {
    read: '読み始め',
    cut: '切る',
    gist: '大意',
    arrange: '組み立て',
    global: '全体の組み立て',
    summary: 'まとめ',
  }
  const base = stepLabel[summary.step] ?? '作業中'
  if (summary.step === 'global' || summary.step === 'summary') return base
  return `${base}（¶${summary.paragraphsPassed + 1} / ${summary.paragraphsTotal}）`
}

/** 保存が必要か（無駄な保存を減らす）: 状態の中身が変わったかを浅く比べる */
export function progressChanged(a: ReadingProgressState, b: ReadingProgressState): boolean {
  return serializeForCompare(a) !== serializeForCompare(b)
}

function serializeForCompare(s: ReadingProgressState): string {
  const { updatedAt: _updatedAt, ...rest } = s
  return JSON.stringify(rest)
}

export const emptyGlobalWork = (): GlobalWork => ({
  gists: {},
  arrange: null,
  attempts: 0,
  passed: false,
})
