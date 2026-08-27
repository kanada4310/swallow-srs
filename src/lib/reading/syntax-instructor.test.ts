/**
 * 模範分析集（第7講）の取り込みの見張り（共有事項 C24）。
 *
 * いちばん大事なのは「**この35問が生徒に出ないこと**」。
 * 記号の一部が落ちており許容解も無いため、講師・管理者のときだけ出す。
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildInstructorProblems,
  instructorProblemId,
  isInstructorProblem,
  syntaxProblemsFor,
} from './syntax-instructor'
import { INSTRUCTOR_SET, loadInstructorSyntax } from './syntax-instructor-load'
import { gradeSyntax, modelAnswer, SYNTAX_PROBLEMS } from './syntax'
import type { ReadingLessonData } from './types'

const lesson = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'private', 'reading-data', '英語長文最前線_第7講_seg.json'),
    'utf-8'
  )
) as ReadingLessonData

const built = buildInstructorProblems(INSTRUCTOR_SET, lesson)

describe('模範分析集の取り込み（C24）', () => {
  it('第7講の確定35文を取り込んでいる', () => {
    expect(INSTRUCTOR_SET.entries).toHaveLength(35)
    expect(built).toHaveLength(35)
    expect(INSTRUCTOR_SET.contract).toBe('C24')
    expect(INSTRUCTOR_SET.textbook).toBe('英語長文最前線')
    expect(INSTRUCTOR_SET.lesson).toBe('第7講')
  })

  it('生徒に出してよい状態ではない（講師用の目印が付いている）', () => {
    expect(INSTRUCTOR_SET.studentReady).toBe(false)
    expect(INSTRUCTOR_SET.droppedCount).toBeGreaterThan(0)
    built.forEach((p) => {
      expect(p.key.notes[0], p.id).toMatch(/^⚠ 講師用/)
    })
  })

  it('本文の英文は正解表に持たず、語の並びは教材データから読み合わせる', () => {
    const byId = new Map<string, string[]>()
    lesson.paragraphs.forEach((par) =>
      par.sentences.forEach((s) => byId.set(s.id, s.tokens))
    )
    INSTRUCTOR_SET.entries.forEach((e) => {
      // 正解表そのものには語が入っていない（語数だけを持つ）
      expect(Object.keys(e), e.sentenceId).toEqual(['sentenceId', 'tokenCount', 'key'])
      expect(e.tokenCount).toBe(byId.get(e.sentenceId)!.length)
    })
    built.forEach((p, i) => {
      expect(p.tokens, p.id).toEqual(byId.get(INSTRUCTOR_SET.entries[i].sentenceId))
    })
  })

  it('語の並びが食い違ったら、黙って飛ばさずに知らせる', () => {
    const broken: ReadingLessonData = {
      ...lesson,
      paragraphs: lesson.paragraphs.map((par) => ({
        ...par,
        sentences: par.sentences.map((s) => ({ ...s, tokens: s.tokens.slice(0, -1) })),
      })),
    }
    expect(() => buildInstructorProblems(INSTRUCTOR_SET, broken)).toThrow(/語数/)

    const missing: ReadingLessonData = { ...lesson, paragraphs: [] }
    expect(() => buildInstructorProblems(INSTRUCTOR_SET, missing)).toThrow(/教材データにありません/)
  })

  it('正解表の位置が語の数の中に収まっている', () => {
    built.forEach((p) => {
      const n = p.tokens.length
      Object.keys(p.key.pos).forEach((i) => expect(Number(i), p.id).toBeLessThan(n))
      Object.keys(p.key.role).forEach((i) => expect(Number(i), p.id).toBeLessThan(n))
      p.key.spans.forEach((s) => {
        expect(s.from, p.id).toBeGreaterThanOrEqual(0)
        expect(s.to, p.id).toBeLessThan(n)
        expect(s.from).toBeLessThanOrEqual(s.to)
      })
    })
  })

  it('正解どおりに書き込めば満点になる（採点が通る形で取り込めている）', () => {
    built.forEach((p) => {
      const g = gradeSyntax(p, modelAnswer(p))
      expect(g.percent, p.id).toBe(100)
    })
  })
})

describe('講師用の問題を誰に見せるか', () => {
  it('★生徒には従来の練習3問だけを出す（模範分析集の35問は出さない）', () => {
    const forStudent = syntaxProblemsFor(SYNTAX_PROBLEMS, built, false)
    expect(forStudent).toHaveLength(3)
    expect(forStudent.map((p) => p.id)).toEqual(['ex1', 'ex2', 'ex3'])
    expect(forStudent.some((p) => isInstructorProblem(p, INSTRUCTOR_SET))).toBe(false)
  })

  it('★講師用の問題が1問でも生徒側に混ざっていない', () => {
    const forStudent = syntaxProblemsFor(SYNTAX_PROBLEMS, built, false)
    const instructorIds = new Set(built.map((p) => p.id))
    forStudent.forEach((p) => expect(instructorIds.has(p.id), p.id).toBe(false))
  })

  it('講師・管理者には練習3問＋模範分析集35問を出す', () => {
    const forTeacher = syntaxProblemsFor(SYNTAX_PROBLEMS, built, true)
    expect(forTeacher).toHaveLength(38)
    expect(forTeacher.slice(3).every((p) => isInstructorProblem(p, INSTRUCTOR_SET))).toBe(true)
  })

  it('問題の番号が既存3問とぶつからず、35問の中でも重ならない（模範の順序の保存の鍵）', () => {
    const all = syntaxProblemsFor(SYNTAX_PROBLEMS, built, true).map((p) => p.id)
    expect(new Set(all).size).toBe(all.length)
    expect(instructorProblemId(INSTRUCTOR_SET, 'P1-S1')).toBe('英語長文最前線_第7講_P1-S1')
    built.forEach((p) => {
      expect(['ex1', 'ex2', 'ex3']).not.toContain(p.id)
    })
  })
})

describe('教材データを取りに行く経路', () => {
  it('一覧に元の講が無ければ、分かるように知らせる', async () => {
    const original = global.fetch
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.includes('index.json')
        ? JSON.stringify({ contract: 'C22', lessons: [] })
        : JSON.stringify(lesson)
      const res = new Response(body, { headers: { 'content-type': 'application/json' } })
      Object.defineProperty(res, 'url', { value: `http://localhost${url}` })
      return res
    }) as typeof fetch
    try {
      await expect(loadInstructorSyntax()).rejects.toThrow(/一覧にありません/)
    } finally {
      global.fetch = original
    }
  })
})
