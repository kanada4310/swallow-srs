#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""pilot2_deck.json から、コロケーション構文ノート（例文プールJSON付き）を組み立てる。
各コロケーション = 1ノート。例文プールは [{en(強調), blank(穴埋め), ja}] の配列。
Usage: python build_colloc_notes.py pilot2_deck.json colloc_notes.json
"""
import json, sys, csv, html
from build_deck_tsv import emphasize, _match, _TOKEN_RE, _is_placeholder, _blank_for, _trim

src, out = sys.argv[1], sys.argv[2]

def realize_blank(en, core, filler, word):
    """実現したコロケーション（コアの固定語 + スロットに入った filler）全体の範囲を
    強調/空欄化する。filler が空なら従来の emphasize（固定句）にフォールバック。"""
    sen = [(m.group(0), m.start(), m.end()) for m in _TOKEN_RE.finditer(en)]
    spans, used = [], set()
    anchors = [t for t in _TOKEN_RE.findall(core) if not _is_placeholder(t)]
    if word:
        anchors.append(word)
    for ct in anchors:
        for i, (txt, s, e) in enumerate(sen):
            if i in used:
                continue
            if _match(ct, txt):
                spans.append((s, e)); used.add(i); break
    fl = (filler or '').strip()
    if fl:
        idx = en.lower().find(fl.lower())
        if idx != -1:
            spans.append((idx, idx + len(fl)))
        else:
            for ft in _TOKEN_RE.findall(fl):
                for i, (txt, s, e) in enumerate(sen):
                    if i in used:
                        continue
                    if _match(ft, txt):
                        spans.append((s, e)); used.add(i); break
    if not spans:
        return emphasize(en, core, word)
    s0 = min(a for a, _ in spans)
    e0 = max(b for _, b in spans)
    s0, e0 = _trim(en, s0, e0)
    en_html = f"{html.escape(en[:s0])}<strong>{html.escape(en[s0:e0])}</strong>{html.escape(en[e0:])}"
    en_blank = f"{html.escape(en[:s0])}{_blank_for(en[s0:e0])}{html.escape(en[e0:])}"
    return en_html, en_blank, True

# id -> pos
pos_by_id = {}
with open('pilot2_words.json', encoding='utf-8') as f:
    for d in json.load(f):
        pos_by_id[d['id']] = d['pos']

deck = json.load(open(src, encoding='utf-8'))
notes = []
stat = {'collocations': 0, 'exemplars': 0, 'blank_fail': 0}
for it in deck:
    pos = pos_by_id.get(it['id'], '')
    for c in it['collocations']:
        core = c['core']
        pool = []
        for ex in c.get('exemplars', []):
            en = (ex.get('en') or '').strip()
            ja = (ex.get('ja') or '').strip()
            if not en:
                continue
            en_html, en_blank, found = realize_blank(en, core, ex.get('filler', ''), it['w'])
            if not found:
                stat['blank_fail'] += 1
            ctx = (ex.get('ctx') or '').strip()
            pool.append({'en': en_html, 'blank': en_blank, 'ja': ja, 'ctx': ctx})
            stat['exemplars'] += 1
        if not pool:
            continue
        stat['collocations'] += 1
        tags = [f'品詞:{pos}', f'見出し語:{it["w"]}', f'CEFR:{c.get("cefr","")}']
        if c.get('rare'):
            tags.append('低頻度')
        notes.append({
            '見出し語': it['w'],
            '語義': c.get('sense_ja', ''),
            'コア': core,
            'スロット型': c.get('slot', ''),
            '例文プール': json.dumps(pool, ensure_ascii=False),
            'tags': tags,
        })

json.dump(notes, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print(f"ノート {len(notes)} 件 / コロケーション {stat['collocations']} / 例文 {stat['exemplars']} / 穴埋め失敗 {stat['blank_fail']} → {out}")
