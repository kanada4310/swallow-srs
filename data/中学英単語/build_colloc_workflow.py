#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""ステージ1: 語義レベルA1/A2のコロケーション選定ワークフローを生成。
Usage: python build_colloc_workflow.py pilot2_words.json gen-colloc.js
"""
import json, sys
src, out = sys.argv[1], sys.argv[2]
DATA = json.dumps(json.load(open(src, encoding='utf-8')), ensure_ascii=False)

tpl = r'''export const meta = {
  name: 'colloc-select',
  description: '中学(A1/A2)語義レベルの高頻度コロケーション選定（コア+スロット型）',
  phases: [{ title: 'Select', detail: '各語の A1/A2 語義コロケーションを抽出' }],
}

const WORDS = %DATA%

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    items: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        id: { type: 'string' },
        w: { type: 'string' },
        collocations: { type: 'array', minItems: 2, maxItems: 5, items: {
          type: 'object', additionalProperties: false,
          properties: {
            core: { type: 'string', description: 'コロケーションの見出し形（例: take a bath, be good at, look for）' },
            slot: { type: 'string', description: '開いた位置の型（例: "+ N", "+ ~ing", "+ [場所]", "(自動詞:目的語なし)"）' },
            sense_ja: { type: 'string', description: 'このコロケーションが運ぶ語義（日本語、簡潔に）' },
            cefr: { type: 'string', enum: ['A1', 'A2'], description: '語義レベル（A1かA2のみ。A2超の語義は挙げない）' },
          },
          required: ['core', 'slot', 'sense_ja', 'cefr'],
        } },
      },
      required: ['id', 'w', 'collocations'],
    } },
  },
  required: ['items'],
}

function buildPrompt(chunk) {
  return `あなたは英語コーパス言語学とCEFR語彙プロファイル(Cambridge English Vocabulary Profile / Pearson GSE)に精通した教材設計者です。

各「対象語」について、日本の中学英語(CEFR A1〜A2)で高頻度な【コロケーション／フレーズ】を 2〜5 個挙げてください。

【最重要: 語義レベルの統制】
- 各コロケーションが運ぶ「語義」が A1〜A2 であること。A2を超える語義は【絶対に挙げない】。
- 例: run → "run fast"(走る/A1)はOK ／ "run a company"(経営する/B2)はNG。
        book → "read a book"(本/A1)はOK ／ "book a room"(予約する/B1)はNG。
- 判断は EVP(English Vocabulary Profile)・Pearson GSE の【語義別CEFR】に基づくこと。中学教科書に出る語義かどうかも目安に。

【共起語の統制】
- コロケーション内の語はすべて中学レベル(A1〜A2)。難語・上位語を共起させない。

【出力】各コロケーションに:
- core: 自然な見出し形（例: "take a bath", "be good at", "look for", "go to bed"）
- slot: 開いた位置の型（例 "+ N", "+ ~ing", "+ [人]", "+ [場所]", "(自動詞:目的語なし)"。開きが無い固定句は "(固定)"）
- sense_ja: その語義（日本語で簡潔に）
- cefr: A1 か A2

高頻度・生産的なものを優先。語義が重複するものは1つに。多義語は【異なる語義】を網羅するように複数挙げる。

【対象語(JSON)】
${JSON.stringify(chunk, null, 0)}`
}

const CHUNK = 10
const chunks = []
for (let i = 0; i < WORDS.length; i += CHUNK) chunks.push(WORDS.slice(i, i + CHUNK))
log(`コロケーション選定 ${WORDS.length} 語 / ${chunks.length} バッチ`)

phase('Select')
const results = await parallel(chunks.map((chunk, ci) => () =>
  agent(buildPrompt(chunk), { label: `sel:${ci + 1}/${chunks.length}`, phase: 'Select', schema: SCHEMA, model: 'sonnet' })
))
const items = []
let failed = 0
results.forEach((r, i) => { if (r && Array.isArray(r.items)) items.push(...r.items); else failed++ })
log(`選定完了: ${items.length} 語（失敗 ${failed}）`)
return { count: items.length, failedBatches: failed, items }
'''
open(out, 'w', encoding='utf-8').write(tpl.replace('%DATA%', DATA))
print(f"wrote {out}")
