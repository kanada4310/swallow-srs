#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""本番コロケーションデッキの対象語リストを words.tsv から作る。
対象POS = 動詞/形容詞/副詞/前置詞/接続詞/助動詞（名詞・代名詞・冠詞・間投詞を除く）。
パイロット50語は生成済みなので新規生成リストから除外（最終デッキでは pilot2_deck.json を再利用）。

出力:
  prod_words_all.json  … スコープ955語 ∪ パイロット50語（=最終デッキの語集合, 参考）
  prod_words_new.json  … 新規生成が必要な語（スコープ − パイロット）
Usage: python build_prod_words.py
"""
import json, csv

SCOPE_POS = {'動詞', '形容詞', '副詞', '前置詞', '接続詞', '助動詞'}

rows = []
with open('words.tsv', encoding='utf-8') as f:
    r = csv.DictReader(f, delimiter='\t')
    for d in r:
        rows.append({'id': d['id'].strip(), 'w': d['word'].strip(),
                     'pos': d['pos'].strip(), 'm': d['meaning'].strip()})

pilot = json.load(open('pilot2_words.json', encoding='utf-8'))
pilot_ids = {p['id'] for p in pilot}

scope = [w for w in rows if w['pos'] in SCOPE_POS]
new = [w for w in scope if w['id'] not in pilot_ids]

# all = scope ∪ pilot（順序: scope順 + pilotのうちscope外= 名詞等）
scope_ids = {w['id'] for w in scope}
all_words = scope + [p for p in pilot if p['id'] not in scope_ids]

json.dump(new, open('prod_words_new.json', 'w', encoding='utf-8'), ensure_ascii=False)
json.dump(all_words, open('prod_words_all.json', 'w', encoding='utf-8'), ensure_ascii=False)

from collections import Counter
print(f"スコープ(対象POS): {len(scope)} 語  POS内訳={dict(Counter(w['pos'] for w in scope))}")
print(f"パイロット: {len(pilot)} 語（うちスコープ内 {sum(1 for p in pilot if p['id'] in scope_ids)}）")
print(f"新規生成: {len(new)} 語 → prod_words_new.json")
print(f"最終デッキ語集合: {len(all_words)} 語 → prod_words_all.json")
