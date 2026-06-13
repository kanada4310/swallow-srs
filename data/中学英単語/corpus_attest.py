#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""コロケーションの core を Google Books Ngrams で頻度裏取りする。
Usage: python corpus_attest.py colloc_result.json colloc_attested.json

各 collocation に freq（2015-2019 平均相対頻度, en-2019）を付与。
低頻度/ゼロは rare=true でフラグ（実在しない/不自然な候補の足切り用）。
"""
import json, sys, time, re, urllib.parse, urllib.request
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

inp, outp = sys.argv[1], sys.argv[2]
data = json.load(open(inp, encoding='utf-8'))
items = data.get('items', data)

RARE = 1e-8  # これ未満は「まれ/要確認」

def normalize(core):
    c = core.strip()
    c = re.sub(r"\([^)]*\)", " ", c)          # 括弧と中身を除去（(that) など）
    c = re.sub(r"\[[^\]]*\]", " ", c)         # [人][場所] などプレースホルダ
    c = re.sub(r"\bone's\b", "his", c)
    c = re.sub(r"\boneself\b", "himself", c)
    c = re.sub(r"\bsb\.?\b|\bsth\.?\b", " ", c)
    c = re.sub(r"\bA\b|\bB\b", " ", c)
    c = c.replace("~", " ").replace("+", " ")
    c = re.sub(r"[^A-Za-z' ]", " ", c)         # 記号除去（' は残す）
    c = re.sub(r"\s+", " ", c).strip()
    return c

cache = {}
def ngram_freq(phrase):
    if not phrase:
        return None
    if phrase in cache:
        return cache[phrase]
    q = urllib.parse.quote(phrase)
    url = f"https://books.google.com/ngrams/json?content={q}&year_start=2015&year_end=2019&corpus=en-2019&smoothing=0"
    val = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=25) as r:
                d = json.loads(r.read().decode('utf-8'))
            val = (sum(d[0]['timeseries']) / len(d[0]['timeseries'])) if (d and d[0].get('timeseries')) else 0.0
            break
        except Exception as e:
            sys.stderr.write(f"  ! {phrase} (try{attempt+1}): {str(e)[:40]}\n")
            time.sleep(2.0 * (attempt + 1))  # バックオフ
    cache[phrase] = val
    time.sleep(1.0)  # 礼儀的レート制限
    return val

total = 0
for it in items:
    for c in it.get('collocations', []):
        total += 1
        norm = normalize(c['core'])
        nwords = len(norm.split())
        if nwords < 2:
            # 固定語彙部が1語以下＝開いた構文。n-gram裏取り対象外（文法/CEFR判定に委ねる）
            c['freq'] = None
            c['freq_query'] = norm
            c['kind'] = 'construction'
            c['rare'] = False
            print(f"  [{it['w']}] {c['core']:<26} (構文: 裏取り対象外)")
            continue
        f = ngram_freq(norm)
        c['freq'] = f
        c['freq_query'] = norm
        c['kind'] = 'collocation'
        c['rare'] = (f is not None and f < RARE)
        mark = 'ERR' if f is None else ('[RARE]' if c['rare'] else 'ok')
        print(f"  [{it['w']}] {c['core']:<26} freq={('%.2e'%f) if f is not None else 'ERR':<10} {mark}")

json.dump({'items': items}, open(outp, 'w', encoding='utf-8'), ensure_ascii=False)
rare = sum(1 for it in items for c in it.get('collocations', []) if c.get('rare'))
print(f"\n計 {total} コロケーション / rare(<{RARE:.0e}) {rare} 件 → {outp}")
