#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""colloc_result（コロケーション選定）＋ exemplar_result（例文プール5本）を結合し、
pilot2_deck.json と同形の deck スケルトン（collocations[].exemplars 付き）を作る。
corpus_attest は省略するため freq=None / kind / rare=False を補う。
Usage: python build_prod_deck.py colloc_result_prod.json exemplar_result_prod.json prod_deck.json
"""
import json, sys, re
colloc_path, exem_path, out = sys.argv[1], sys.argv[2], sys.argv[3]

def load_items(p):
    d = json.load(open(p, encoding='utf-8'))
    return d.get('items', d) if isinstance(d, dict) else d

colloc_items = load_items(colloc_path)
exem_items = load_items(exem_path)
exem_by_key = {it['key']: it.get('exemplars', []) for it in exem_items}

def kind_of(core):
    # corpus_attest 同等の簡易判定: 固定語2語未満なら construction
    norm = re.sub(r"\([^)]*\)|\[[^\]]*\]|[~+]", " ", core)
    norm = re.sub(r"[^A-Za-z' ]", " ", norm)
    return 'construction' if len(norm.split()) < 2 else 'collocation'

deck = []
stat = {'words': 0, 'colloc': 0, 'with_exemplars': 0, 'no_exemplars': 0}
for it in colloc_items:
    wid, w = it['id'], it['w']
    cols = []
    for c in it.get('collocations', []):
        key = f"{wid}|{c['core']}"
        exs = exem_by_key.get(key, [])
        if exs:
            stat['with_exemplars'] += 1
        else:
            stat['no_exemplars'] += 1
        stat['colloc'] += 1
        cols.append({
            'core': c['core'], 'slot': c.get('slot', ''),
            'sense_ja': c.get('sense_ja', ''), 'cefr': c.get('cefr', ''),
            'freq': None, 'freq_query': c['core'], 'kind': kind_of(c['core']), 'rare': False,
            'exemplars': exs,
        })
    if cols:
        deck.append({'id': wid, 'w': w, 'collocations': cols})
        stat['words'] += 1

json.dump(deck, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print(f"語 {stat['words']} / コロケーション {stat['colloc']} "
      f"(例文あり {stat['with_exemplars']} / 例文なし {stat['no_exemplars']}) → {out}")
