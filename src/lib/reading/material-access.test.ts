/**
 * 教材データ（市販教材の本文・共有事項 C22）が、ログインした人だけに渡ることの見張り。
 *
 * いちばん大事なのは「**ログインしていない状態では中身が取れないこと**」。
 * 2026-08-27 に置き場を public（誰でも取りに行ける場所）から
 * private（配信されない場所）へ移し、入口を1つだけ作った。
 * ここが赤くなったら、教材の本文が外へ出ている恐れがある。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { findLegacyReadingData, LEGACY_DIR } from '../../../scripts/legacy-reading-data.mjs'
import { isSafeMaterialName, listedFiles, readMaterialFile } from './material-store'
// vi.mock は読み込みより先に効くので、そのまま上から読み込んでよい
import { GET } from '@/app/api/reading/material/[file]/route'
import { NextRequest } from 'next/server'

/** ログインしているかどうかを、テストのたびに切り替える */
let signedInUser: { id: string } | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        signedInUser
          ? { data: { user: signedInUser }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing!' } },
    },
  }),
}))


function request(file: string) {
  return new NextRequest(`http://localhost:3000/api/reading/material/${encodeURIComponent(file)}`)
}

/** 教材本文の手がかり。テストの中でも本文そのものは書かない */
const LESSON_FILE = '英語長文最前線_第7講_seg.json'

beforeEach(() => {
  signedInUser = null
})

describe('教材データの置き場', () => {
  it('古い置き場（public/reading-data）は空になっている', () => {
    // ここが赤くなる＝教材の本文が、ログイン無しで取れる場所に戻っている
    expect(findLegacyReadingData(process.cwd()), `${LEGACY_DIR} に教材データがあります`).toEqual([])
  })

  it('public の中に教材データが1件も無い', () => {
    const publicDir = path.join(process.cwd(), 'public')
    const found: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (/_seg\.json$/.test(e.name)) found.push(path.relative(process.cwd(), full))
      }
    }
    if (fs.existsSync(publicDir)) walk(publicDir)
    expect(found).toEqual([])
  })

  it('新しい置き場に一覧と6講ぶんの教材がそろっている', () => {
    const files = listedFiles()
    expect(files).toHaveLength(6)
    files.forEach((f) => expect(() => readMaterialFile(f)).not.toThrow())
  })
})

describe('教材データの入口（/api/reading/material/...）', () => {
  it('ログインしていないと一覧を渡さない（401・中身は返さない）', async () => {
    const res = await GET(request('index.json'), { params: { file: 'index.json' } })
    expect(res.status).toBe(401)
    const body = await res.text()
    expect(body).not.toContain('lessons')
  })

  it('ログインしていないと講の中身も渡さない（401）', async () => {
    const res = await GET(request(LESSON_FILE), { params: { file: encodeURIComponent(LESSON_FILE) } })
    expect(res.status).toBe(401)
    const body = await res.text()
    expect(body).not.toContain('paragraphs')
    expect(body).not.toContain('tokens')
  })

  it('ログインしていれば一覧を読める', async () => {
    signedInUser = { id: 'test-user' }
    const res = await GET(request('index.json'), { params: { file: 'index.json' } })
    expect(res.status).toBe(200)
    const data = JSON.parse(await res.text()) as { contract?: string; lessons?: unknown[] }
    expect(data.contract).toBe('C22')
    expect(data.lessons).toHaveLength(6)
  })

  it('ログインしていれば講の中身を読める', async () => {
    signedInUser = { id: 'test-user' }
    const res = await GET(request(LESSON_FILE), { params: { file: encodeURIComponent(LESSON_FILE) } })
    expect(res.status).toBe(200)
    const data = JSON.parse(await res.text()) as { paragraphs?: unknown[] }
    expect(Array.isArray(data.paragraphs)).toBe(true)
    expect((data.paragraphs ?? []).length).toBeGreaterThan(0)
  })

  it('端末や中継に残さない指定を付けて渡す', async () => {
    signedInUser = { id: 'test-user' }
    const res = await GET(request('index.json'), { params: { file: 'index.json' } })
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.headers.get('cache-control')).toContain('private')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
  })

  it('一覧に載っていないファイルは渡さない（404）', async () => {
    signedInUser = { id: 'test-user' }
    const res = await GET(request('存在しない講_seg.json'), {
      params: { file: encodeURIComponent('存在しない講_seg.json') },
    })
    expect(res.status).toBe(404)
  })

  it('置き場の外を指す名前は渡さない（404）', async () => {
    signedInUser = { id: 'test-user' }
    for (const name of ['../../.env.local', '..%2F..%2Fpackage.json', '.env', 'package.json']) {
      const res = await GET(request(name), { params: { file: name } })
      expect(res.status, name).toBe(404)
    }
  })
})

describe('名前の見分け', () => {
  it('一覧と講のファイルだけを通す', () => {
    expect(isSafeMaterialName('index.json')).toBe(true)
    expect(isSafeMaterialName(LESSON_FILE)).toBe(true)
  })

  it('置き場の外・別の種類の名前は通さない', () => {
    ;['../index.json', 'a/b_seg.json', 'a\\b_seg.json', '.env', 'package.json', ''].forEach((n) =>
      expect(isSafeMaterialName(n), n).toBe(false)
    )
  })
})
