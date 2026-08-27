/**
 * 教材データ（共有事項 C22）をサーバー側で読む窓口。
 *
 * 教材の本文は市販教材『英語長文最前線』のもので、第三者の著作物にあたる。
 * 2026-08-27 に `public/reading-data`（誰でも取りに行ける場所）から
 * **`private/reading-data`（配信されない場所）** へ移した。
 * 画面へ渡すのは `/api/reading/material/...` だけで、そこで必ずログインを確かめる。
 *
 * ★ここは必ずサーバー側でだけ読み込むこと（node:fs を使う）。
 *   画面側から使う読み込みは `lessons.ts`（入口の道だけを知っている）。
 */

import fs from 'node:fs'
import path from 'node:path'
import type { ReadingLessonIndex } from './types'

/** 配信されない置き場。ファイル名と index.json の形は C22 のまま変えない */
export const MATERIAL_DIR = path.join(process.cwd(), 'private', 'reading-data')

/** 一覧のファイル名 */
export const INDEX_FILE = 'index.json'

/** 取り違え・抜け道を防ぐため、名前はここで狭く決める（区切り文字を含む名前は通さない） */
export function isSafeMaterialName(name: string): boolean {
  if (!name || name.length > 200) return false
  if (name !== path.basename(name)) return false
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) return false
  if (name.startsWith('.')) return false
  return name === INDEX_FILE || /^[^/\\]+_seg\.json$/.test(name)
}

/** 教材が見つからない・読めない */
export class MaterialNotFoundError extends Error {
  constructor(name: string) {
    super(`教材データが見つかりません: ${name}`)
    this.name = 'MaterialNotFoundError'
  }
}

/** 一覧に載っているファイル名の集合（一覧に無いファイルは配らない） */
export function listedFiles(): string[] {
  try {
    const index = JSON.parse(
      fs.readFileSync(path.join(MATERIAL_DIR, INDEX_FILE), 'utf-8')
    ) as ReadingLessonIndex
    return (index.lessons ?? []).map((l) => l.file)
  } catch {
    return []
  }
}

/**
 * 教材データ1件の中身（文字列）を返す。
 * 一覧（index.json）と、一覧に載っているファイルだけを返す。
 */
export function readMaterialFile(name: string): string {
  if (!isSafeMaterialName(name)) throw new MaterialNotFoundError(name)
  if (name !== INDEX_FILE && !listedFiles().includes(name)) throw new MaterialNotFoundError(name)
  const full = path.join(MATERIAL_DIR, name)
  // 念のため、置き場の外へ出ていないことをもう一度確かめる
  if (path.relative(MATERIAL_DIR, full) !== name) throw new MaterialNotFoundError(name)
  try {
    return fs.readFileSync(full, 'utf-8')
  } catch {
    throw new MaterialNotFoundError(name)
  }
}
