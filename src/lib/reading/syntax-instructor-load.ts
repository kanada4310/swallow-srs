/**
 * 講師用の問題（模範分析集 第7講）を実際に読み込む側。
 *
 * 正解表は**画面のコードに同梱しない**（2026-08-28 変更）。実物は
 * `private/syntax-problems/`（配信されない場所）にあり、
 * **講師・管理者だけが読める入口** `/api/reading/syntax-problems` から取りに行く。
 * 誰が読めるかを決めているのは入口（サーバー側で profiles の役割を見る）で、
 * 画面側の判定は見せ方だけの役割になる。
 *
 * 形と組み立ての決まりは syntax-instructor.ts にある。
 */

import type { SyntaxProblem } from './syntax'
import { buildInstructorProblems, type InstructorSyntaxSet } from './syntax-instructor'
import { loadLesson, loadLessonIndex, ReadingAuthError, ReadingDataError } from './lessons'

/** 講師用の正解表を取りに行く入口（講師・管理者だけが読める） */
export const INSTRUCTOR_DATA_PATH = '/api/reading/syntax-problems'

/** 講師用の正解表を入口から取りに行く（1講ぶん。今は第7講だけ） */
export async function fetchInstructorSet(): Promise<InstructorSyntaxSet> {
  let res: Response
  try {
    res = await fetch(INSTRUCTOR_DATA_PATH, { cache: 'no-store', credentials: 'same-origin' })
  } catch {
    throw new ReadingDataError(
      'インターネットにつながっていないため、模範分析集の問題を開けません。'
    )
  }
  if (res.status === 401) throw new ReadingAuthError()
  if (res.status === 403) {
    throw new ReadingDataError('模範分析集の問題は講師・管理者だけが開けます。')
  }
  if (!res.ok) {
    throw new ReadingDataError(`模範分析集の問題の読み込みに失敗しました（${res.status}）`)
  }
  let body: { sets?: InstructorSyntaxSet[] }
  try {
    body = (await res.json()) as { sets?: InstructorSyntaxSet[] }
  } catch {
    throw new ReadingDataError('模範分析集の問題の形が読み取れませんでした')
  }
  const set = body.sets?.[0]
  if (!set || !Array.isArray(set.entries) || set.entries.length === 0) {
    throw new ReadingDataError('模範分析集の問題が1問も入っていませんでした')
  }
  return set
}

/** 正解表と教材データを取りに行って、講師用の問題を組み立てる（画面から呼ぶ） */
export async function loadInstructorSyntax(
  set?: InstructorSyntaxSet
): Promise<{ set: InstructorSyntaxSet; problems: SyntaxProblem[] }> {
  const resolved = set ?? (await fetchInstructorSet())
  const lessons = await loadLessonIndex()
  const entry = lessons.find(
    (l) => l.textbook === resolved.textbook && l.lesson === resolved.lesson
  )
  if (!entry) {
    throw new ReadingDataError(
      `模範分析集の元になる教材「${resolved.textbook} ${resolved.lesson}」が一覧にありません。`
    )
  }
  const lesson = await loadLesson(entry)
  return { set: resolved, problems: buildInstructorProblems(resolved, lesson) }
}
