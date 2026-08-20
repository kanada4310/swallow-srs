/**
 * 教材データ（契約 C22）の読み込み。
 *
 * 置き場所は `public/reading-data/`。一覧は `index.json`、中身は `<教材>_<講>_seg.json`。
 * ファイル名・置き場所・index.json の形は工房と共有の約束なので、ここで変えない。
 *
 * ★ログイン切れの逃がし方（工房からの申し送り）
 * 演習室の見張り（middleware）は画像以外の全パスを見ているため、ログインが切れた状態で
 * この JSON を取りにいくと、JSON ではなく**ログイン画面の HTML** が返る（307 でリダイレクト）。
 * そのままだと JSON.parse が謎のエラーになるので、ここで見分けて
 * 「ログインし直してください」という意味の専用エラーにする。
 */

import type { ReadingLessonData, ReadingLessonIndex, ReadingLessonIndexEntry } from './types'

export const READING_DATA_DIR = '/reading-data'

/** ログインが切れている（JSON ではなくログイン画面が返った） */
export class ReadingAuthError extends Error {
  constructor(message = 'ログインの有効期限が切れています') {
    super(message)
    this.name = 'ReadingAuthError'
  }
}

/** 教材が見つからない・壊れている */
export class ReadingDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReadingDataError'
  }
}

/** ネットにつながっていない */
export class ReadingOfflineError extends Error {
  constructor(message = 'オフラインのため教材を読み込めません') {
    super(message)
    this.name = 'ReadingOfflineError'
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { cache: 'no-store', credentials: 'same-origin' })
  } catch {
    throw new ReadingOfflineError()
  }

  // 未ログイン時はログイン画面へリダイレクトされる（本文は HTML）
  if (res.redirected || new URL(res.url, location.origin).pathname !== path) {
    throw new ReadingAuthError()
  }
  const contentType = res.headers.get('content-type') || ''
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new ReadingAuthError()
    throw new ReadingDataError(`教材の読み込みに失敗しました（${res.status}）`)
  }
  const text = await res.text()
  if (!contentType.includes('json') && /^\s*</.test(text)) {
    // JSON を頼んだのに HTML が返ってきた＝ログイン画面
    throw new ReadingAuthError()
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ReadingDataError('教材データの形が読み取れませんでした')
  }
}

export async function loadLessonIndex(): Promise<ReadingLessonIndexEntry[]> {
  const index = await fetchJson<ReadingLessonIndex>(`${READING_DATA_DIR}/index.json`)
  if (!index || !Array.isArray(index.lessons)) {
    throw new ReadingDataError('教材の一覧が読み取れませんでした')
  }
  return index.lessons
}

export async function loadLesson(entry: ReadingLessonIndexEntry): Promise<ReadingLessonData> {
  const data = await fetchJson<ReadingLessonData>(
    `${READING_DATA_DIR}/${encodeURIComponent(entry.file)}`
  )
  if (!data || !Array.isArray(data.paragraphs) || data.paragraphs.length === 0) {
    throw new ReadingDataError('この講の教材データが空でした')
  }
  return data
}

/** 講の表示名。講名はここに焼き込まない（一覧の index.json が正） */
export function lessonTitle(entry: ReadingLessonIndexEntry): string {
  return `${entry.textbook} ${entry.lesson}`
}

/** エラーを生活の言葉にする */
export function describeReadingError(err: unknown): { message: string; needsLogin: boolean } {
  if (err instanceof ReadingAuthError) {
    return {
      message: 'ログインの有効期限が切れました。もう一度ログインすると続きから開けます。',
      needsLogin: true,
    }
  }
  if (err instanceof ReadingOfflineError) {
    return {
      message: 'インターネットにつながっていないため、教材を開けません。つながってからもう一度お試しください。',
      needsLogin: false,
    }
  }
  if (err instanceof ReadingDataError) {
    return { message: err.message, needsLogin: false }
  }
  return { message: '教材の読み込みでエラーが起きました。', needsLogin: false }
}
