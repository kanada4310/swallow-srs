#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""例文プールの語彙を words.tsv（中学2286語）＋活用形＋機能語で照合し、範囲外語(OOV)を検出。
Usage: python vocab_validate.py exemplar_result.json [--list]
"""
import json, sys, csv, re
try: sys.stdout.reconfigure(encoding='utf-8')
except Exception: pass

inp = sys.argv[1]
SHOW_LIST = '--list' in sys.argv

# 不規則変化（base, forms...）
IRR = [
 ('be','is am are was were been being'),('have','has had having'),('do','does did done doing'),
 ('go','goes went gone going'),('take','takes took taken taking'),('make','makes made making'),
 ('get','gets got gotten getting'),('give','gives gave given giving'),('see','sees saw seen seeing'),
 ('come','comes came coming'),('run','runs ran running'),('eat','eats ate eaten eating'),
 ('drink','drinks drank drunk drinking'),('write','writes wrote written writing'),('read','reads reading'),
 ('find','finds found finding'),('buy','buys bought buying'),('bring','brings brought bringing'),
 ('think','thinks thought thinking'),('catch','catches caught catching'),('teach','teaches taught teaching'),
 ('hold','holds held holding'),('keep','keeps kept keeping'),('sleep','sleeps slept sleeping'),
 ('feel','feels felt feeling'),('leave','leaves left leaving'),('meet','meets met meeting'),
 ('sit','sits sat sitting'),('stand','stands stood standing'),('win','wins won winning'),
 ('lose','loses lost losing'),('say','says said saying'),('tell','tells told telling'),
 ('sell','sells sold selling'),('send','sends sent sending'),('build','builds built building'),
 ('grow','grows grew grown growing'),('throw','throws threw thrown throwing'),('fly','flies flew flown flying'),
 ('draw','draws drew drawn drawing'),('begin','begins began begun beginning'),('break','breaks broke broken breaking'),
 ('speak','speaks spoke spoken speaking'),('wear','wears wore worn wearing'),('ride','rides rode ridden riding'),
 ('swim','swims swam swum swimming'),('sing','sings sang sung singing'),('cut','cuts cutting'),
 ('put','puts putting'),('let','lets letting'),('set','sets setting'),('hit','hits hitting'),
 ('shake','shakes shook shaken shaking'),('hear','hears heard hearing'),('pay','pays paid paying'),
 ('mean','means meant meaning'),('fall','falls fell fallen falling'),('become','becomes became becoming'),
 ('understand','understands understood understanding'),('spend','spends spent spending'),
 ('lend','lends lent lending'),('lay','lays laid laying'),('rise','rises rose risen rising'),
 ('shoot','shoots shot shooting'),('fight','fights fought fighting'),('forget','forgets forgot forgotten forgetting'),
]

def inflect(w):
    """規則変化形を生成。"""
    w = w.lower()
    out = {w}
    if not re.fullmatch(r"[a-z][a-z\-]*", w):
        return out
    if w.endswith('y') and len(w) > 1 and w[-2] not in 'aeiou':
        out |= {w[:-1]+'ies', w[:-1]+'ied', w[:-1]+'ier', w[:-1]+'iest'}
    out |= {w+'s', w+'es', w+'ed', w+'ing', w+'d', w+'er', w+'est', w+"'s", w+"s'"}
    if w.endswith('e'):
        out |= {w[:-1]+'ing', w[:-1]+'ed', w[:-1]+'er', w[:-1]+'est'}
    return out

# 許可語彙構築
allowed = set()
with open('words.tsv', encoding='utf-8') as f:
    for r in csv.DictReader(f, delimiter='\t'):
        for part in re.split(r"[ \-/]", r['word'].lower()):
            part = part.strip("'")
            if part:
                allowed |= inflect(part)
for base, forms in IRR:
    for x in [base] + forms.split():
        allowed.add(x)

# 機能語・短縮形・つなぎ語のホワイトリスト（学習指導要領外でも基本表現として許可）
WHITELIST = set("""a an the this that these those i you he she it we they me him her us them my your his its our their mine yours hers ours theirs myself yourself himself herself itself ourselves yourselves themselves
am is are was were be been being do does did done have has had having will would shall should can could may might must
not no yes and or but so if because when while as than then of to in on at by for with from into onto off out up down over under about above below between among through during before after since until near around against
who what which whose whom where why how
n't 'm 're 's 've 'll 'd let's o'clock
one two three four five six seven eight nine ten""".split())
WHITELIST |= {"don't","doesn't","didn't","isn't","aren't","wasn't","weren't","can't","couldn't","won't","wouldn't","shouldn't","mustn't","i'm","you're","he's","she's","it's","we're","they're","i've","we've","i'll","you'll","it'll","i'd","that's","there's","here's","let's"}

WORD_RE = re.compile(r"[A-Za-z][A-Za-z']*")

def check(en):
    oov = []
    for m in WORD_RE.finditer(en):
        tok = m.group(0)
        low = tok.lower()
        if low in allowed or low in WHITELIST:
            continue
        # 文中の大文字始まり＝固有名詞とみなして許可（文頭は通常語なので除外）
        is_sentence_start = (m.start() == 0) or en[max(0, m.start()-2):m.start()].strip() in ('.', '!', '?', '')
        if tok[0].isupper() and not is_sentence_start:
            continue
        oov.append(tok)
    return oov

data = json.load(open(inp, encoding='utf-8'))
items = data.get('items', data)
total_ex = 0
ex_with_oov = 0
oov_counter = {}
flagged = []
for it in items:
    for ex in it.get('exemplars', []):
        total_ex += 1
        oov = check(ex.get('en', ''))
        if oov:
            ex_with_oov += 1
            for w in oov:
                oov_counter[w.lower()] = oov_counter.get(w.lower(), 0) + 1
            flagged.append((it.get('key', '?'), ex['en'], oov))

print(f"例文 {total_ex} / OOV含む {ex_with_oov} ({ex_with_oov*100//max(1,total_ex)}%)")
print(f"異なりOOV語: {len(oov_counter)}")
top = sorted(oov_counter.items(), key=lambda x: -x[1])[:40]
print("頻出OOV:", ", ".join(f"{w}({c})" for w, c in top))
if SHOW_LIST:
    print("\n--- OOVを含む例文 ---")
    for key, en, oov in flagged[:80]:
        print(f"  [{key.split('|')[-1]}] {en}  => {oov}")
