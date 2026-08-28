/**
 * 講師用の正解表（模範分析集・共有事項 C24）をサーバー側で読む窓口。
 *
 * この正解表は**講師・管理者だけが見てよいもの**（記号の一部が落ちており、
 * 許容解も無いため生徒には出さない）。2026-08-28 に、画面のコードへ同梱していた形
 * （誰でも取りに行けた）から **`private/syntax-problems/`（配信されない場所）** へ移した。
 * 画面へ渡すのは `/api/reading/syntax-problems` だけで、そこで役割まで確かめる。
 *
 * ★ここは必ずサーバー側でだけ読み込むこと（node:fs を使う）。
 *   画面側から使う読み込みは `syntax-instructor-load.ts`（入口の道だけを知っている）。
 */

import fs from 'node:fs'
import path from 'node:path'
import type { InstructorSyntaxSet } from './syntax-instructor'

/** 配信されない置き場（教材データ private/reading-data と同じ考え方） */
export const SYNTAX_PROBLEM_DIR = path.join(process.cwd(), 'private', 'syntax-problems')

/** 置き場にある正解表のファイル名（並びを毎回そろえる） */
export function listSyntaxProblemFiles(): string[] {
  try {
    return fs
      .readdirSync(SYNTAX_PROBLEM_DIR)
      .filter((n) => n.endsWith('.json') && !n.startsWith('.'))
      .sort()
  } catch {
    return []
  }
}

/**
 * 置き場にある正解表をすべて読む。
 * 1件も無い・形が読み取れない場合は、黙って0問にせず知らせる。
 */
export function readSyntaxProblemSets(): InstructorSyntaxSet[] {
  const files = listSyntaxProblemFiles()
  if (files.length === 0) {
    throw new Error(`講師用の正解表が置き場にありません（${SYNTAX_PROBLEM_DIR}）`)
  }
  return files.map((name) => {
    const text = fs.readFileSync(path.join(SYNTAX_PROBLEM_DIR, name), 'utf-8')
    const set = JSON.parse(text) as InstructorSyntaxSet
    if (!set || !Array.isArray(set.entries) || set.entries.length === 0) {
      throw new Error(`講師用の正解表の形が読み取れません（${name}）`)
    }
    return set
  })
}
