#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""enrich-only: 既存の例文プール(en/ja)を保持したまま、各例文に
「日本語の場面リード文(ctx)」だけを追記生成するワークフロー gen-context.js を生成する。

入力は pilot2_deck.json（各コロケーションの exemplars=[{en,ja,filler}]）。
出力ワークフローは key 単位で ctxs=[5本] を返す（en/ja の並び順=index 対応）。
Usage: python build_context_workflow.py pilot2_deck.json gen-context.js
"""
import json, sys
src, out = sys.argv[1], sys.argv[2]
deck = json.load(open(src, encoding='utf-8'))

flat = []
for it in deck:
    for c in it.get('collocations', []):
        exs = [{'en': (e.get('en') or '').strip(), 'ja': (e.get('ja') or '').strip()}
               for e in c.get('exemplars', []) if (e.get('en') or '').strip()]
        if not exs:
            continue
        flat.append({
            'key': f"{it['id']}|{c['core']}",
            'w': it['w'], 'sense_ja': c.get('sense_ja', ''),
            'exemplars': exs,
        })
DATA = json.dumps(flat, ensure_ascii=False)

tpl = r'''export const meta = {
  name: 'context-assist',
  description: '各例文に日本語の場面リード文(文脈アシスト)を追記生成（enrich-only, Sonnet並列）',
  phases: [{ title: 'Context', detail: '例文ごとに短い日本語の場面導入文を生成' }],
}

const COLLOCS = %DATA%

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    items: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        key: { type: 'string' },
        ctxs: {
          type: 'array',
          description: 'exemplars と同じ並び順・同じ本数の日本語リード文',
          items: { type: 'string' },
        },
      },
      required: ['key', 'ctxs'],
    } },
  },
  required: ['items'],
}

function buildPrompt(chunk) {
  return `あなたは中学英語の教材設計者です。各コロケーションの「例文(英文+和訳)」それぞれに対して、
学習者が暗誦カードの一番上で最初に読む【日本語の場面リード文(文脈アシスト)】を1つずつ作ってください。

【狙い】英文を覚える前に、その文が使われる具体的な場面を頭に思い描かせ、イメージで記憶を強化する（視覚化記憶術）。

【書き方の厳守】
1. 各例文に対し ctx を1本。ちょうど exemplars と同じ本数・同じ並び順で ctxs に入れる。
2. 1文の短い日本語（15〜35字程度）。その英文の場面に自然につながる接続句で終える
   （例:「…で困っています。そのとき、」「…したい。だから、」「…と思った。それで、」）。
3. 具体的で情景が浮かぶ内容にする。英文/和訳の単なる言い換えにしない（場面・気持ち・状況を足す）。
   例: 英文 "She gave me a hand." 和訳「彼女は手を貸してくれた。」
       → ctx「私は荷物が多くて困っています。そのとき、」
4. 主語や登場人物は和訳と矛盾させない。英単語そのもの（答え）は書かない。
5. やさしい日常語のみ。難しい言い回しを避ける。

【対象(JSON)】※ key はそのまま返すこと。各 item の exemplars 件数と ctxs 件数を必ず一致させること。
${JSON.stringify(chunk, null, 0)}`
}

const CHUNK = 12
const chunks = []
for (let i = 0; i < COLLOCS.length; i += CHUNK) chunks.push(COLLOCS.slice(i, i + CHUNK))
log(`文脈アシスト生成: ${COLLOCS.length} コロケーション / ${chunks.length} バッチ`)

phase('Context')
const results = await parallel(chunks.map((chunk, ci) => () =>
  agent(buildPrompt(chunk), { label: `ctx:${ci + 1}/${chunks.length}`, phase: 'Context', schema: SCHEMA, model: 'sonnet' })
))
const items = []
let failed = 0
results.forEach((r) => { if (r && Array.isArray(r.items)) items.push(...r.items); else failed++ })
log(`生成完了: ${items.length} コロケーション分（失敗バッチ ${failed}）`)
return { count: items.length, failedBatches: failed, items }
'''
js = tpl.replace('%DATA%', DATA)
open(out, 'w', encoding='utf-8').write(js)
print(f"wrote {out} / 対象コロケーション {len(flat)} 件")
