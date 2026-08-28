/**
 * 講師用の正解表（模範分析集・共有事項 C24）が、講師・管理者だけに渡ることの見張り。
 *
 * いちばん大事なのは「**生徒の役割では中身が取れないこと**」。
 * 2026-08-28 に、画面のコードへ同梱していた形（誰でも取りに行けた）から
 * private（配信されない場所）へ移し、入口を1つだけ作った。
 * ここが赤くなったら、正解表が生徒に見える恐れがある。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { listSyntaxProblemFiles, readSyntaxProblemSets, SYNTAX_PROBLEM_DIR } from './syntax-problem-store'
// vi.mock は読み込みより先に効くので、そのまま上から読み込んでよい
import { GET } from '@/app/api/reading/syntax-problems/route'
import { NextRequest } from 'next/server'

/** ログインしている人と、その役割をテストのたびに切り替える */
let signedInUser: { id: string } | null = null
let role: string | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        signedInUser
          ? { data: { user: signedInUser }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing!' } },
    },
    // 役割は画面から送られてきた値ではなく、profiles の記録から読む
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            table === 'profiles' && role ? { data: { role }, error: null } : { data: null, error: null },
        }),
      }),
    }),
  }),
}))

function request() {
  return new NextRequest('http://localhost:3000/api/reading/syntax-problems')
}

beforeEach(() => {
  signedInUser = null
  role = null
})

describe('講師用の正解表の置き場', () => {
  it('画面のコード（src）に正解表を同梱していない', () => {
    const found: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (/syntax-instructor-data\./.test(e.name)) found.push(path.relative(process.cwd(), full))
      }
    }
    walk(path.join(process.cwd(), 'src'))
    expect(found).toEqual([])
  })

  it('public（誰でも取りに行ける場所）にも置いていない', () => {
    const publicDir = path.join(process.cwd(), 'public')
    const found: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (/第7講|instructor|syntax-problem/i.test(e.name)) found.push(path.relative(process.cwd(), full))
      }
    }
    if (fs.existsSync(publicDir)) walk(publicDir)
    expect(found).toEqual([])
  })

  it('配信されない場所に正解表がそろっている（35文）', () => {
    expect(SYNTAX_PROBLEM_DIR).toContain('private')
    expect(listSyntaxProblemFiles().length).toBeGreaterThan(0)
    const sets = readSyntaxProblemSets()
    expect(sets[0].contract).toBe('C24')
    expect(sets[0].entries).toHaveLength(35)
  })
})

describe('講師用の正解表の入口（/api/reading/syntax-problems）', () => {
  it('★ログインしていないと渡さない（401・中身は返さない）', async () => {
    const res = await GET(request())
    expect(res.status).toBe(401)
    const body = await res.text()
    expect(body).not.toContain('entries')
    expect(body).not.toContain('sentenceId')
  })

  it('★生徒の役割では渡さない（403・中身は返さない）', async () => {
    signedInUser = { id: 'student-1' }
    role = 'student'
    const res = await GET(request())
    expect(res.status).toBe(403)
    const body = await res.text()
    expect(body).not.toContain('entries')
    expect(body).not.toContain('sentenceId')
  })

  it('役割の記録が無い人にも渡さない（403）', async () => {
    signedInUser = { id: 'unknown-1' }
    role = null
    const res = await GET(request())
    expect(res.status).toBe(403)
  })

  it('★講師の役割なら渡す（35文）', async () => {
    signedInUser = { id: 'teacher-1' }
    role = 'teacher'
    const res = await GET(request())
    expect(res.status).toBe(200)
    const data = (await res.json()) as { contract: string; sets: Array<{ entries: unknown[] }> }
    expect(data.contract).toBe('C24')
    expect(data.sets[0].entries).toHaveLength(35)
  })

  it('管理者の役割でも渡す', async () => {
    signedInUser = { id: 'admin-1' }
    role = 'admin'
    const res = await GET(request())
    expect(res.status).toBe(200)
  })

  it('端末や中継に残さない指定を付けて渡す', async () => {
    signedInUser = { id: 'teacher-1' }
    role = 'teacher'
    const res = await GET(request())
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.headers.get('cache-control')).toContain('private')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
  })
})
