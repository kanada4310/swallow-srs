/**
 * 模範分析集（第7講・確定35文）を「構文の練習」の問題として取り込む（共有事項 C24）。
 *
 * 正本は quiz_generator 側（swallow-srs では編集しない）:
 * - 書き出し元: quiz_generator/subjects/英語/模範分析集/export/構文の練習_英語長文最前線_第7講.json
 *   （quiz_generator の export_syntax_problems.py が作る。**このスクリプトは読むだけ**）
 *
 * 出力: src/lib/reading/syntax-instructor-data.ts（生成物。手で編集しない）
 *
 * ★本文の英文は出力に入れない。
 *   同じ35文の語の並びは、すでに届いている教材データ
 *   public/reading-data/英語長文最前線_第7講_seg.json（共有事項 C22）に入っている。
 *   出力には文ID・語数・正解表（品詞／働き／まとまり）・注記だけを入れ、
 *   英文そのものは画面を開くときに教材データから読み合わせる。
 *   市販教材の本文を二重に置かないための作りで、語の並びが変わったときは
 *   語数の食い違いとして分かるように失敗する。
 *
 * この35問は**講師用**（記号の一部が落ちており、許容解も無い）。
 * 画面に出すのは講師・管理者だけで、生徒には出さない。
 *
 * 実行: node data/sync-syntax-problems.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const QUIZ = 'C:/Users/gaimo/source/repos/quiz_generator'

const SOURCE = join(
  QUIZ,
  'subjects/英語/模範分析集/export/構文の練習_英語長文最前線_第7講.json'
)
const MATERIAL = join(here, '../public/reading-data/英語長文最前線_第7講_seg.json')
const OUT = join(here, '../src/lib/reading/syntax-instructor-data.ts')

/** 取り込みを止める（黙って0問にしない） */
function fail(message) {
  console.error(`取り込みを中止しました: ${message}`)
  process.exit(1)
}

function readJson(path, what) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    fail(`${what}が読めません（${path}）。${e.message}`)
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    fail(`${what}の形が読み取れません（${path}）。${e.message}`)
  }
}

const src = readJson(SOURCE, '書き出しファイル')
const material = readJson(MATERIAL, '教材データ')

const meta = src.meta || {}
const problems = Array.isArray(src.problems) ? src.problems : []
if (problems.length === 0) fail('書き出しファイルに問題が1問も入っていません')
if (meta.problemCount != null && meta.problemCount !== problems.length) {
  fail(`書き出しの申告（${meta.problemCount}問）と実際の数（${problems.length}問）が食い違います`)
}
if (meta.contract !== 'C24') fail(`共有事項が C24 ではありません（${meta.contract}）`)

/** 教材データ（C22）の文ID → 語の並び */
const tokensById = new Map()
for (const p of material.paragraphs || []) {
  for (const s of p.sentences || []) tokensById.set(s.id, s.tokens)
}
if (tokensById.size === 0) fail('教材データに文が1つも入っていません')

const SPAN_TYPES = ['ul', 'adv', 'n', 'adjm', 'comp']
const POS_LETTERS = ['n', 'v', 'a', 'ad', 'aux']
const ROLE_LETTERS = ['S', 'V', 'O', 'C', 'P', 'Po', '▷', '＋', '同']
/** ダッシュ（深さの印）を落として比べる。S′ ≡ S（採点同値・記号の台帳 2026-08-26） */
const stripDash = (v) => v.replace(/['’`′″‴]+$/, '')

const unknownPos = new Set()
const unknownRole = new Set()
const entries = []

for (const p of problems) {
  const sentenceId = String(p.id || '').split('_').pop()
  if (!sentenceId) fail(`問題の番号が読み取れません（${p.id}）`)
  const tokens = tokensById.get(sentenceId)
  if (!tokens) {
    fail(`文「${sentenceId}」が教材データにありません（教材データの届き直しが必要かもしれません）`)
  }
  if (JSON.stringify(tokens) !== JSON.stringify(p.tokens)) {
    fail(
      `文「${sentenceId}」の語の並びが教材データと食い違います` +
        `（教材 ${tokens.length}語 / 書き出し ${p.tokens.length}語）`
    )
  }

  const key = p.key || {}
  const pos = {}
  for (const [idx, slot] of Object.entries(key.pos || {})) {
    const i = Number(idx)
    if (!Number.isInteger(i) || i < 0 || i >= tokens.length) {
      fail(`文「${sentenceId}」の品詞の位置 ${idx} が語の数（${tokens.length}）の外です`)
    }
    slot.ok.forEach((v) => {
      if (!POS_LETTERS.includes(v)) unknownPos.add(v)
    })
    pos[i] = { ok: slot.ok }
  }
  const role = {}
  for (const [idx, slot] of Object.entries(key.role || {})) {
    const i = Number(idx)
    if (!Number.isInteger(i) || i < 0 || i >= tokens.length) {
      fail(`文「${sentenceId}」の働きの位置 ${idx} が語の数（${tokens.length}）の外です`)
    }
    slot.ok.forEach((v) => {
      if (!ROLE_LETTERS.includes(stripDash(v))) unknownRole.add(v)
    })
    role[i] = { ok: slot.ok }
  }
  const spans = (key.spans || []).map((s) => {
    if (!Number.isInteger(s.from) || !Number.isInteger(s.to) || s.from < 0 || s.to >= tokens.length || s.from > s.to) {
      fail(`文「${sentenceId}」のまとまり [${s.from}-${s.to}] が語の数（${tokens.length}）に合いません`)
    }
    s.ok.forEach((v) => {
      if (!SPAN_TYPES.includes(v)) {
        fail(`文「${sentenceId}」のまとまりの種類「${v}」は受け皿にありません`)
      }
    })
    // label（英文の抜き書き）は入れない。画面では語の並びから作り直す
    const out = { from: s.from, to: s.to, ok: s.ok }
    if (s.note) out.note = s.note
    return out
  })
  const notes = Array.isArray(key.notes) ? key.notes : []
  if (!notes[0] || !notes[0].startsWith('⚠ 講師用')) {
    fail(`文「${sentenceId}」の注記に講師用の目印（1行目の「⚠ 講師用」）がありません`)
  }

  entries.push({ sentenceId, tokenCount: tokens.length, key: { pos, role, spans, notes } })
}

if (unknownPos.size > 0) {
  console.warn(`※ 画面の選択肢に無い品詞の値をそのまま載せます: ${[...unknownPos].join(' / ')}`)
}
if (unknownRole.size > 0) {
  console.warn(`※ 画面の選択肢に無い働きの値をそのまま載せます: ${[...unknownRole].join(' / ')}`)
}

const today = new Date().toISOString().slice(0, 10)
const set = {
  contract: 'C24',
  textbook: meta.textbook,
  lesson: meta.lesson,
  studentReady: meta.studentReady === true,
  notReadyNote: meta.notReadyNote || '',
  notReadyReasons: meta.notReadyReasons || [],
  droppedCount: meta.droppedCount ?? 0,
  droppedByKind: meta.droppedByKind || {},
  sourceFile: '模範分析集/export/構文の練習_英語長文最前線_第7講.json',
  importedAt: today,
  entries,
}

const out = `/**
 * 模範分析集 第7講の正解表（講師用）— 自動生成ファイル。手で編集しない。
 *
 * 正本は quiz_generator（模範分析集の書き出し・共有事項 C24）。
 * 取り込み直しは data/sync-syntax-problems.mjs を参照（取り込み日: ${today}）。
 *
 * ★本文の英文はここに持たない。語の並びは教材データ（共有事項 C22・
 *   public/reading-data/英語長文最前線_第7講_seg.json）から文IDで読み合わせる。
 * ★この35問は講師用。記号の一部が落ちており許容解も無いので、生徒には出さない。
 */

import type { InstructorSyntaxSet } from './syntax-instructor'

export const INSTRUCTOR_SYNTAX_SET: InstructorSyntaxSet = ${JSON.stringify(set, null, 2)}
`

writeFileSync(OUT, out)
console.log(`取り込んだ問題数: ${entries.length}`)
console.log(`書き出し元: ${SOURCE}`)
console.log(`語の並びの読み合わせ元（教材データ）: ${MATERIAL}`)
console.log(`落とした情報: ${set.droppedCount}件（内訳は書き出し元の meta.dropped）`)
console.log(`生徒に出してよいか（studentReady）: ${set.studentReady ? 'はい' : 'いいえ（講師用）'}`)
console.log(`出力: ${OUT}`)
