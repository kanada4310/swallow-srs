/**
 * 講師用の問題（模範分析集 第7講）を実際に読み込む側。
 *
 * 生成ファイル（正解表・35文ぶん）と教材データの読み込みをここに寄せ、
 * **画面からは講師のときだけ後から読み込む**（生徒の画面には積まない）。
 * 形と組み立ての決まりは syntax-instructor.ts にある。
 */

import type { SyntaxProblem } from './syntax'
import { buildInstructorProblems, type InstructorSyntaxSet } from './syntax-instructor'
import { INSTRUCTOR_SYNTAX_SET } from './syntax-instructor-data'
import { loadLesson, loadLessonIndex, ReadingDataError } from './lessons'

export const INSTRUCTOR_SET: InstructorSyntaxSet = INSTRUCTOR_SYNTAX_SET

/** 教材データを取りに行って、講師用の問題を組み立てる（画面から呼ぶ） */
export async function loadInstructorSyntax(
  set: InstructorSyntaxSet = INSTRUCTOR_SET
): Promise<{ set: InstructorSyntaxSet; problems: SyntaxProblem[] }> {
  const lessons = await loadLessonIndex()
  const entry = lessons.find((l) => l.textbook === set.textbook && l.lesson === set.lesson)
  if (!entry) {
    throw new ReadingDataError(
      `模範分析集の元になる教材「${set.textbook} ${set.lesson}」が一覧にありません。`
    )
  }
  const lesson = await loadLesson(entry)
  return { set, problems: buildInstructorProblems(set, lesson) }
}
