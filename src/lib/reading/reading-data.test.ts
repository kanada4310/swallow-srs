/**
 * 届いている教材データ（契約 C22）が、読解ページの読める形になっているかの見張り。
 *
 * 工房（quiz_generator）側でファイルの形が変わると、ここが赤くなって気づける。
 * 中身の正しさ（切れ目の妥当性）は教材側の責任なので、ここでは見ない。
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { judgeCuts } from './judge'
import { cutKey, studentSegments } from './segments'
import type { ReadingLessonData, ReadingLessonIndex } from './types'

const DATA_DIR = path.join(process.cwd(), 'public', 'reading-data')

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8')) as T
}

describe('教材データの受け渡し（C22）', () => {
  const index = readJson<ReadingLessonIndex>('index.json')

  it('一覧に第2〜7講の6講が載っている', () => {
    expect(index.lessons).toHaveLength(6)
    expect(index.contract).toBe('C22')
    index.lessons.forEach((l) => {
      expect(l.id).toBeTruthy()
      expect(l.file).toMatch(/_seg\.json$/)
      expect(l.paragraphs).toBeGreaterThan(0)
      expect(l.requiredCuts).toBeGreaterThan(0)
    })
  })

  it('一覧に載っているファイルが実在し、段落数と必須切れ目の数が一致する', () => {
    index.lessons.forEach((l) => {
      const data = readJson<ReadingLessonData>(l.file)
      expect(data.paragraphs).toHaveLength(l.paragraphs)
      const total = data.paragraphs.reduce((n, p) => n + (p.requiredCuts?.length ?? 0), 0)
      expect(total).toBe(l.requiredCuts)
    })
  })

  it('各段落が読解ページの使う項目をすべて持っている', () => {
    index.lessons.forEach((l) => {
      const data = readJson<ReadingLessonData>(l.file)
      data.paragraphs.forEach((p) => {
        expect(Array.isArray(p.sentences)).toBe(true)
        expect(p.sentences.length).toBeGreaterThan(0)
        p.sentences.forEach((s) => expect(s.tokens.length).toBeGreaterThan(0))
        expect(Array.isArray(p.kotos)).toBe(true)
        expect(Array.isArray(p.segments)).toBe(true)
        expect(Array.isArray(p.requiredCuts)).toBe(true)
        expect(typeof p.macro).toBe('string')
      })
    })
  })

  it('必須の切れ目は本文の中の位置を指している', () => {
    index.lessons.forEach((l) => {
      const data = readJson<ReadingLessonData>(l.file)
      data.paragraphs.forEach((p) => {
        p.requiredCuts.forEach((c) => {
          const sent = p.sentences[c.sentence]
          expect(sent, `${l.id} ¶${p.no} 第${c.sentence}文が無い`).toBeTruthy()
          expect(c.gap).toBeGreaterThanOrEqual(0)
          expect(c.gap).toBeLessThan(sent.tokens.length)
        })
      })
    })
  })

  it('模範どおりに切れば、どの講でも合格になる', () => {
    index.lessons.forEach((l) => {
      const data = readJson<ReadingLessonData>(l.file)
      data.paragraphs.forEach((p) => {
        const modelCuts = p.requiredCuts.map((c) => cutKey(c.sentence, c.gap))
        const r = judgeCuts(p, modelCuts)
        expect(r.passed, `${l.id} ¶${p.no}`).toBe(true)
        expect(r.extra).toHaveLength(0)
        // 切ったぶんだけ意味のまとまりができる
        const segs = studentSegments(p, modelCuts)
        expect(segs.length).toBeGreaterThan(0)
      })
    })
  })

  it('正規形（採点基準）は検収待ちで、まだ入っていない', () => {
    index.lessons.forEach((l) => {
      expect(l.anchorApproved).toBe(false)
      const data = readJson<ReadingLessonData>(l.file)
      data.paragraphs.forEach((p) => expect(p.anchor ?? null).toBeNull())
    })
  })
})
