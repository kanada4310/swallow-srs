#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""複数の deck JSON（pilot2_deck.json 同形）を id 重複なしで結合する。
先に来たファイルを優先（同 id は後勝ちさせない）。
Usage: python combine_decks.py out.json deckA.json deckB.json [...]
"""
import json, sys
out = sys.argv[1]
seen, merged = set(), []
for p in sys.argv[2:]:
    for w in json.load(open(p, encoding='utf-8')):
        if w['id'] in seen:
            continue
        seen.add(w['id'])
        merged.append(w)
json.dump(merged, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
ncol = sum(len(w.get('collocations', [])) for w in merged)
print(f"語 {len(merged)} / コロケーション {ncol} → {out}")
