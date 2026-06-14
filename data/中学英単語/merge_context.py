#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""context_result.json（key→ctxs[]）を pilot2_deck.json の各 exemplar に書き戻す。
en/ja の並び順=index 対応で ctx を割り当てる（enrich-only：既存 en/ja/filler は不変）。
Usage: python merge_context.py context_result.json pilot2_deck.json
"""
import json, sys
res_path, deck_path = sys.argv[1], sys.argv[2]

res = json.load(open(res_path, encoding='utf-8'))
items = res.get('items', res) if isinstance(res, dict) else res
ctx_by_key = {it['key']: it.get('ctxs', []) for it in items}

deck = json.load(open(deck_path, encoding='utf-8'))
stat = {'colloc': 0, 'matched': 0, 'ex': 0, 'ctx_set': 0, 'len_mismatch': 0, 'no_key': 0}
for it in deck:
    for c in it.get('collocations', []):
        exs = c.get('exemplars', [])
        if not exs:
            continue
        stat['colloc'] += 1
        key = f"{it['id']}|{c['core']}"
        ctxs = ctx_by_key.get(key)
        if ctxs is None:
            stat['no_key'] += 1
            continue
        stat['matched'] += 1
        if len(ctxs) != len(exs):
            stat['len_mismatch'] += 1
        for i, e in enumerate(exs):
            stat['ex'] += 1
            ctx = (ctxs[i] if i < len(ctxs) else '') or ''
            e['ctx'] = ctx.strip()
            if e['ctx']:
                stat['ctx_set'] += 1

json.dump(deck, open(deck_path, 'w', encoding='utf-8'), ensure_ascii=False)
print(f"コロケーション {stat['colloc']} / 照合 {stat['matched']} (key無 {stat['no_key']}) "
      f"/ 例文 {stat['ex']} / ctx付与 {stat['ctx_set']} / 本数不一致 {stat['len_mismatch']} → {deck_path}")
