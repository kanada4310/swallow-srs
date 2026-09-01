/**
 * 模範分析集（第7講・確定35文）を「構文の練習」の問題として読み込む（共有事項 C24）。
 *
 * ねらい: 塾長が「分析をどの順で書くか（模範の順序）」を採るための文を増やすこと。
 * 従来の練習3問だけでは、構造の違う文を選んで採ることができなかった。
 *
 * ★この35問は講師用。記号の一部（熟語の波線・呼応の組・まとまりに付く印など）は
 *   受け皿が無く落としており、許容解も無い。したがって**生徒には出さない**。
 *   画面に出すかどうかは syntaxProblemsFor() で決める。
 *
 * ★本文の英文は正解表に持たない。語の並びは教材データ（共有事項 C22・
 *   private/reading-data の seg JSON）から文IDで読み合わせる。市販教材の本文を
 *   二重に置かないための作りで、語の並びが変わったら分かるように失敗する。
 */

import type { KeySlot, KeySpan, SyntaxProblem } from './syntax'
import { ReadingDataError } from './lessons'
import type { ReadingLessonData } from './types'

/** 1文ぶんの正解表（英文は持たない） */
export interface InstructorSyntaxEntry {
  /** 教材データ（C22）の文ID。例: 'P1-S1' */
  sentenceId: string
  /** 読み合わせの確認用（教材データ側の語数と一致すること） */
  tokenCount: number
  key: {
    pos: Record<number, KeySlot>
    role: Record<number, KeySlot>
    /** label（英文の抜き書き）は持たない。画面では語の並びから作り直す */
    spans: Array<Omit<KeySpan, 'label'>>
    notes: string[]
  }
}

/** 1講ぶんの取り込み結果（生成ファイルの形） */
export interface InstructorSyntaxSet {
  contract: string
  textbook: string
  lesson: string
  /** 生徒に出してよいか。取り込み時点では常に false（講師用） */
  studentReady: boolean
  notReadyNote: string
  notReadyReasons: string[]
  droppedCount: number
  droppedByKind: Record<string, number>
  sourceFile: string
  importedAt: string
  entries: InstructorSyntaxEntry[]
}

/** 講師用の問題の番号（既存の練習3問 ex1〜ex3 と重ならない形） */
export function instructorProblemId(set: InstructorSyntaxSet, sentenceId: string): string {
  return `${set.textbook}_${set.lesson}_${sentenceId}`
}

/** その問題が講師用（模範分析集から取り込んだもの）か */
export function isInstructorProblem(
  problem: SyntaxProblem,
  set: Pick<InstructorSyntaxSet, 'textbook' | 'lesson'>
): boolean {
  return problem.id.startsWith(`${set.textbook}_${set.lesson}_`)
}

/**
 * 「very well」型（副詞が副詞を前置修飾する塊に、下線＋丸カッコを重ねる流儀）の
 * 任意のまとまり（2026-08-31 塾長確定仕様1）。**書いても書かなくても減点しない**。
 *
 * 生成ファイル（private/syntax-problems）は取り込み直し（data/sync-syntax-problems.mjs）で
 * 作り直されるため、手で書き足すと消える。ここ（コード側の表）に持たせて、
 * 読み込み時に正解表へ合流させる。鍵は問題の番号（instructorProblemId と同じ形）。
 *
 * 第7講の同型箇所の洗い出し（2026-09-01・全35文の副詞連続を機械抽出→1件ずつ判定）:
 * - P3-S1「ever more」(8-9): ever が more を前置修飾 → 下線・（ ）とも任意
 * - P4-S4「so much」(5-6): so が much を前置修飾。（ ）は塾長の正解表に必須で
 *   あるため、任意で足すのは塊への下線だけ
 * - P8-S2「not simply」(6-7): not が simply を前置修飾 → 下線・（ ）とも任意
 * - 除外: P4-S6「most commercially」= most は「commercially successful」全体に掛かる
 *   読みが自然で、副詞が副詞を修飾する型とは言えない ／
 *   P6-S3「up less」= made up の up は句動詞の一部で、less との修飾関係が無い
 */
const OPTIONAL_INSTRUCTOR_SPANS: Record<string, Array<Omit<KeySpan, 'label'>>> = {
  '英語長文最前線_第7講_P3-S1': [
    { from: 8, to: 9, ok: ['ul'], optional: true, note: 'ever が more を前置修飾する塊。下線は書いても書かなくても正解。' },
    { from: 8, to: 9, ok: ['adv'], optional: true, note: 'ever more の塊を（ ）で囲む流儀も正しい（任意）。' },
  ],
  '英語長文最前線_第7講_P4-S4': [
    { from: 5, to: 6, ok: ['ul'], optional: true, note: 'so が much を前置修飾する塊。（ ）の中の下線は書いても書かなくても正解。' },
  ],
  '英語長文最前線_第7講_P8-S2': [
    { from: 6, to: 7, ok: ['ul'], optional: true, note: 'not が simply を前置修飾する塊。下線は書いても書かなくても正解。' },
    { from: 6, to: 7, ok: ['adv'], optional: true, note: 'not simply の塊を（ ）で囲む流儀も正しい（任意）。' },
  ],
}

/** 見出し（英文の頭だけ）。長い文は途中で切る */
function makeTitle(set: InstructorSyntaxSet, sentenceId: string, tokens: string[]): string {
  const head = tokens.slice(0, 6).join(' ')
  return `${set.lesson} ${sentenceId}｜${head}${tokens.length > 6 ? ' …' : ''}`
}

/**
 * 正解表と教材データの語の並びを読み合わせて、練習の問題の形にする。
 *
 * 教材データに文が無い・語数が食い違う場合は、黙って飛ばさずに知らせる。
 */
export function buildInstructorProblems(
  set: InstructorSyntaxSet,
  lesson: ReadingLessonData
): SyntaxProblem[] {
  const tokensById = new Map<string, string[]>()
  for (const p of lesson.paragraphs || []) {
    for (const s of p.sentences || []) tokensById.set(s.id, s.tokens)
  }

  return set.entries.map((e) => {
    const tokens = tokensById.get(e.sentenceId)
    if (!tokens) {
      throw new ReadingDataError(
        `模範分析集の文「${e.sentenceId}」が教材データにありません。取り込み直し（data/sync-syntax-problems.mjs）が必要です。`
      )
    }
    if (tokens.length !== e.tokenCount) {
      throw new ReadingDataError(
        `模範分析集の文「${e.sentenceId}」の語数が教材データと食い違います（教材 ${tokens.length}語 / 正解表 ${e.tokenCount}語）。取り込み直しが必要です。`
      )
    }
    const id = instructorProblemId(set, e.sentenceId)
    const spans: KeySpan[] = [
      ...e.key.spans,
      // 任意のまとまり（very well 型）をコード側の表から合流させる
      ...(OPTIONAL_INSTRUCTOR_SPANS[id] ?? []),
    ].map((s) => ({
      ...s,
      label: tokens.slice(s.from, s.to + 1).join(' '),
    }))
    return {
      id,
      title: makeTitle(set, e.sentenceId, tokens),
      source: `${set.textbook} ${set.lesson}（模範分析集・講師用／生徒には出しません）`,
      tokens,
      key: { pos: e.key.pos, role: e.key.role, spans, notes: e.key.notes },
    }
  })
}

/**
 * 画面に出す問題の並び。**生徒には従来の練習3問だけ**を返し、
 * 講師用の35問は講師・管理者のときだけ後ろに足す。
 */
export function syntaxProblemsFor(
  base: SyntaxProblem[],
  instructor: SyntaxProblem[],
  isTeacher: boolean
): SyntaxProblem[] {
  if (!isTeacher) return base
  return [...base, ...instructor]
}
