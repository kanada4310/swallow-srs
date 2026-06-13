#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""classify_input.json から、イディオム判定ワークフロー .js を生成する。
Usage: python build_classify_workflow.py classify_input.json gen-classify.js
"""
import json, sys
src, out = sys.argv[1], sys.argv[2]
DATA = json.dumps(json.load(open(src, encoding='utf-8')), ensure_ascii=False)

tpl = r'''export const meta = {
  name: 'chu-eitango-classify',
  description: '中学英単語コロケーションを「推測可能/イディオム」に分類（Sonnet並列）',
  phases: [{ title: 'Classify', detail: 'バッチごとにコロケーションを判定' }],
}

const WORDS = %DATA%

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    items: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        id: { type: 'string' },
        judgments: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          properties: {
            c: { type: 'string', description: '対象コロケーション（入力のcをそのまま）' },
            idiom: { type: 'boolean', description: 'true=推測困難なイディオム/慣用句, false=和訳から推測可能' },
          },
          required: ['c', 'idiom'],
        } },
      },
      required: ['id', 'judgments'],
    } },
  },
  required: ['items'],
}

function buildPrompt(chunk) {
  return `あなたは日本の中学英語の教師です。各「対象語」(w=単語, m=意味) に英語コロケーション配列(cols)があります。
各コロケーションについて、中学生が【日本語の意味から英語表現を推測して再現できるか】を基準に分類してください。

- idiom=false（推測可能 / transparent）: 意味から語を素直に組み立てれば英語にたどり着けるもの。
  例: take a picture(写真を撮る), open the window(窓を開ける), music academy(音楽学院), become a doctor(医者になる), a lot of friends(たくさんの友達)
- idiom=true（推測困難 / イディオム・慣用句）: 直訳では出てこない／比喩的／句動詞で意味が変わる／非組成的な固定表現。
  例: by accident(偶然に), give up(あきらめる), look forward to(楽しみにする), take part in(参加する), in short(要するに), all the way(ずっと), take after(似ている), make up one's mind(決心する), for a while(しばらく), get along with(仲良くする)

迷ったら「日本語からこの英語フレーズが自然に出てくるか？」で判断。出てこない＝idiom=true。
各コロケーション文字列をそのまま "c" に入れ、idiom(true/false) を付けて返すこと。

【対象(JSON)】
${JSON.stringify(chunk, null, 0)}`
}

const CHUNK = 25
const chunks = []
for (let i = 0; i < WORDS.length; i += CHUNK) chunks.push(WORDS.slice(i, i + CHUNK))
log(`分類対象 ${WORDS.length} 語 / ${chunks.length} バッチ`)

phase('Classify')
const results = await parallel(chunks.map((chunk, ci) => () =>
  agent(buildPrompt(chunk), {
    label: `cls:${ci + 1}/${chunks.length}`,
    phase: 'Classify', schema: SCHEMA, model: 'sonnet',
  })
))

const items = []
let failed = 0
results.forEach((r, i) => {
  if (r && Array.isArray(r.items)) items.push(...r.items)
  else { failed++; log(`バッチ ${i + 1} 失敗`) }
})
log(`分類完了: ${items.length} 語分（失敗 ${failed}）`)
return { count: items.length, failedBatches: failed, items }
'''
open(out, 'w', encoding='utf-8').write(tpl.replace('%DATA%', DATA))
print(f"wrote {out}")
