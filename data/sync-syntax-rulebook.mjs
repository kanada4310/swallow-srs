/**
 * 構文分析ルールブック（採点基準）を quiz_generator から読み取り専用で取り込む。
 *
 * 正本（すべて quiz_generator 側。swallow-srs では編集しない）:
 * - 正本PDF（ルール1〜32）→ 先に `python -X utf8 data/syntax-rulebook/extract_core.py` で
 *   data/syntax-rulebook/core-extracted.txt にテキスト化しておく
 * - 増補 md（Rule 33〜51）
 * - 構文添削の共通見解 md（問いの型5種・原則3本）
 *
 * 出力: src/lib/syntax-ai/rulebook-text.ts（生成物。手で編集しない）
 *
 * 正本が改訂されたら extract_core.py → 本スクリプトの順に再実行する。
 *
 * 実行: node data/sync-syntax-rulebook.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const QUIZ = 'C:/Users/gaimo/source/repos/quiz_generator'

const sources = {
  core: join(here, 'syntax-rulebook/core-extracted.txt'),
  supplement: join(
    QUIZ,
    'subjects/英語/docs/構文分析ルールブック/構文分析ルールブック_増補_20260820.md'
  ),
  consensus: join(QUIZ, '.claude/rules/syntax-correction-consensus.md'),
}

const core = readFileSync(sources.core, 'utf8').trim()
const supplement = readFileSync(sources.supplement, 'utf8').trim()
const consensus = readFileSync(sources.consensus, 'utf8').trim()

const today = new Date().toISOString().slice(0, 10)

const out = `/**
 * 構文分析ルールブック（採点基準）— 自動生成ファイル。手で編集しない。
 *
 * 正本は quiz_generator（構文分析ルールブック 正本PDF＋増補md＋構文添削の共通見解md）。
 * 取り込み直しは data/sync-syntax-rulebook.mjs を参照（取り込み日: ${today}）。
 *
 * この3本を連結した RULEBOOK_TEXT を AI判定・添削問答の system プロンプト先頭に置き、
 * プロンプトキャッシュ（1時間）で読み直し割引を効かせる。
 */

/** 正本（ルール1〜32・PDF 21ページのテキスト化） */
export const RULEBOOK_CORE = ${JSON.stringify(core)}

/** 増補（Rule 33〜51: 和訳・省略段階・逃げ道・免許のいる構文） */
export const RULEBOOK_SUPPLEMENT = ${JSON.stringify(supplement)}

/** 構文添削の共通見解（問いの型5種・原則3本・裁定記録） */
export const RULEBOOK_CONSENSUS = ${JSON.stringify(consensus)}

/** 採点基準の全文（system プロンプトのキャッシュ対象ブロック） */
export const RULEBOOK_TEXT = [
  '# 採点基準1: 構文分析ルールブック 正本（ルール1〜32）',
  RULEBOOK_CORE,
  '# 採点基準2: 増補（Rule 33〜51）',
  RULEBOOK_SUPPLEMENT,
  '# 採点基準3: 構文添削の共通見解（どの誤りに・どの順で・どんな問いを出すか）',
  RULEBOOK_CONSENSUS,
].join('\\n\\n')
`

const outPath = join(here, '../src/lib/syntax-ai/rulebook-text.ts')
writeFileSync(outPath, out)
console.log(
  `wrote ${outPath} (core=${core.length} / supplement=${supplement.length} / consensus=${consensus.length} chars)`
)
