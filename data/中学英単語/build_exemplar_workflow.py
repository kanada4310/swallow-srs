#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""ステージ2: 各コロケーション/構文に「語彙統制された例文プール(5本)」を生成するワークフローを生成。
rare（コーパス低頻度）コロケーションは除外。
Usage: python build_exemplar_workflow.py colloc_attested.json gen-exemplar.js [POOL]
"""
import json, sys
src, out = sys.argv[1], sys.argv[2]
POOL = int(sys.argv[3]) if len(sys.argv) > 3 else 5
data = json.load(open(src, encoding='utf-8'))['items']

flat = []
for it in data:
    for c in it.get('collocations', []):
        # コーパスは「裏取り（補助シグナル）」。低頻度は除外せず保持し freq を注釈として渡す。
        flat.append({
            'key': f"{it['id']}|{c['core']}",
            'w': it['w'], 'core': c['core'], 'slot': c['slot'],
            'sense_ja': c['sense_ja'], 'cefr': c['cefr'],
        })
DATA = json.dumps(flat, ensure_ascii=False)

tpl = r'''export const meta = {
  name: 'exemplar-pool',
  description: '各コロケーションに語彙統制された例文プールを生成（Sonnet並列）',
  phases: [{ title: 'Pool', detail: '構文ごとに%POOL%本の多様な例文を生成' }],
}

const COLLOCS = %DATA%
const POOL = %POOL%

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    items: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        key: { type: 'string' },
        exemplars: {
          type: 'array', minItems: %POOL%, maxItems: %POOL%,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              en: { type: 'string' },
              ja: { type: 'string' },
              filler: { type: 'string', description: 'このスロットに入れた語（slotが固定なら空でよい）' },
            },
            required: ['en', 'ja'],
          },
        },
      },
      required: ['key', 'exemplars'],
    } },
  },
  required: ['items'],
}

function buildPrompt(chunk) {
  return `あなたは中学英語の教材設計者です。各「コロケーション/構文」について、それを使った例文を【ちょうど ${POOL} 本】作ってください。

【目的】コア(core)は固定で反復し、開いた位置(slot)には毎回ちがう語を入れて、多様な文脈で同じ構文を練習させる（type頻度で構文の生産性を養う）。

【厳守】
1. 各文に core（固定部）を必ず自然に含める。
2. slot（開いた位置）には【${POOL}本それぞれ異なる】中学レベルの語/句を入れる。slotが"(固定)"の場合は、主語・場面・時制を変えて${POOL}通りにする。
3. 語彙統制: 使う語はすべて【日本の中学生が知る範囲(CEFR A1〜A2)】に限定。難語・上位レベル語を使わない。固有名詞・数字・曜日・月名は可。
4. 文は短く自然（5〜12語）。1文1場面。各文に自然な和訳。
5. その構文が運ぶ語義(sense_ja)の意味で使う（別の語義にしない）。
6. filler には slot に入れた語を書く（固定句なら空文字）。

【対象(JSON)】※ key はそのまま返すこと
${JSON.stringify(chunk, null, 0)}`
}

const CHUNK = 12
const chunks = []
for (let i = 0; i < COLLOCS.length; i += CHUNK) chunks.push(COLLOCS.slice(i, i + CHUNK))
log(`例文プール生成: ${COLLOCS.length} コロケーション × ${POOL}本 / ${chunks.length} バッチ`)

phase('Pool')
const results = await parallel(chunks.map((chunk, ci) => () =>
  agent(buildPrompt(chunk), { label: `pool:${ci + 1}/${chunks.length}`, phase: 'Pool', schema: SCHEMA, model: 'sonnet' })
))
const items = []
let failed = 0
results.forEach((r) => { if (r && Array.isArray(r.items)) items.push(...r.items); else failed++ })
log(`生成完了: ${items.length} コロケーション分（失敗バッチ ${failed}）`)
return { count: items.length, failedBatches: failed, items }
'''
js = tpl.replace('%DATA%', DATA).replace('%POOL%', str(POOL))
open(out, 'w', encoding='utf-8').write(js)
print(f"wrote {out} / 対象コロケーション {len(flat)} 件 (rare除外後)")
