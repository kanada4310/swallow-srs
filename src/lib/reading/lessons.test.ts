/**
 * 教材データの読み込みで、ログイン切れをきちんと見分けられるかの見張り。
 *
 * 演習室の見張り（middleware）は未ログインのアクセスをログイン画面へ回すため、
 * JSON を頼んだのに HTML が返る（状態は 200）。実物でも再現を確認している。
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  describeReadingError,
  lessonTitle,
  loadLessonIndex,
  ReadingAuthError,
  ReadingDataError,
  ReadingOfflineError,
} from './lessons'
import type { ReadingLessonIndexEntry } from './types'

const origin = 'http://localhost:3000'

function mockFetch(impl: () => Promise<Response> | Response) {
  vi.stubGlobal('location', { origin } as unknown as Location)
  vi.stubGlobal('fetch', vi.fn(impl))
}

function makeResponse(
  body: string,
  init: { status?: number; contentType?: string; url?: string; redirected?: boolean } = {}
): Response {
  const res = new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'application/json' },
  })
  Object.defineProperty(res, 'url', { value: init.url ?? `${origin}/api/reading/material/index.json` })
  Object.defineProperty(res, 'redirected', { value: init.redirected ?? false })
  return res
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('教材データの読み込み', () => {
  it('ふつうに JSON が返れば一覧を読める', async () => {
    mockFetch(() => makeResponse(JSON.stringify({ lessons: [{ id: 'a', file: 'a.json' }] })))
    const lessons = await loadLessonIndex()
    expect(lessons).toHaveLength(1)
  })

  it('ログイン画面へ回されたらログイン切れとして扱う（リダイレクトで判定）', async () => {
    mockFetch(() =>
      makeResponse('<!DOCTYPE html><html></html>', {
        contentType: 'text/html',
        url: `${origin}/login`,
        redirected: true,
      })
    )
    await expect(loadLessonIndex()).rejects.toBeInstanceOf(ReadingAuthError)
  })

  it('リダイレクトの印が無くても、HTML が返ればログイン切れとして扱う', async () => {
    mockFetch(() =>
      makeResponse('  <!DOCTYPE html><html></html>', {
        contentType: 'text/html',
        url: `${origin}/api/reading/material/index.json`,
      })
    )
    await expect(loadLessonIndex()).rejects.toBeInstanceOf(ReadingAuthError)
  })

  it('401 もログイン切れとして扱う', async () => {
    mockFetch(() => makeResponse('{}', { status: 401 }))
    await expect(loadLessonIndex()).rejects.toBeInstanceOf(ReadingAuthError)
  })

  it('つながらないときはオフラインとして扱う', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    await expect(loadLessonIndex()).rejects.toBeInstanceOf(ReadingOfflineError)
  })

  it('教材が壊れていれば教材のエラーとして扱う', async () => {
    mockFetch(() => makeResponse('{ こわれた'))
    await expect(loadLessonIndex()).rejects.toBeInstanceOf(ReadingDataError)
  })

  it('一覧の形が違えば教材のエラーとして扱う', async () => {
    mockFetch(() => makeResponse(JSON.stringify({ lessons: 'ちがう' })))
    await expect(loadLessonIndex()).rejects.toBeInstanceOf(ReadingDataError)
  })

  it('エラーは生活の言葉になり、ログインが要るかが分かる', () => {
    expect(describeReadingError(new ReadingAuthError())).toEqual({
      message: 'ログインの有効期限が切れました。もう一度ログインすると続きから開けます。',
      needsLogin: true,
    })
    expect(describeReadingError(new ReadingOfflineError()).needsLogin).toBe(false)
    expect(describeReadingError(new Error('なにか')).message).toContain('エラー')
  })

  it('講の名前は一覧の中身から作る（画面に焼き込まない）', () => {
    const entry = { textbook: '英語長文最前線', lesson: '第2講' } as ReadingLessonIndexEntry
    expect(lessonTitle(entry)).toBe('英語長文最前線 第2講')
  })
})
