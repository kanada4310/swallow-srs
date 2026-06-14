#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
ワークフロー生成結果(JSON) + words.tsv から、インポート用デッキTSVを組み立てる。

Usage:
  python build_deck_tsv.py <result.json> <out.tsv>

result.json 形式: {"items":[{"id","word","sentences":[{"collocation","en","ja"} x3]}]}
出力TSV列: ID  単語  品詞  意味  コロケーション  和文  英文  タグ
  - 英文中のコロケーションは <strong>...</strong> で強調
  - ID は <wordId>-1/2/3
  - タグ: 品詞:xxx|単語:xxx
"""
import json, sys, csv, re, html
# 実行部（TSV組み立て）は末尾の if __name__ == '__main__' に集約。
# emphasize() などの関数は他スクリプト（build_colloc_notes.py）から import して再利用する。

# 不規則変化（活用形 -> 原形）。中学レベルで頻出するもの中心。
_IRR_PAIRS = [
    ('go', 'went gone goes going'), ('have', 'had has having'), ('be', 'is am are was were been being'),
    ('do', 'did does done doing'), ('take', 'took taken takes taking'), ('make', 'made makes making'),
    ('give', 'gave given gives giving'), ('get', 'got gotten gets getting'), ('see', 'saw seen sees seeing'),
    ('draw', 'drew drawn draws drawing'), ('sit', 'sat sits sitting'), ('bring', 'brought brings bringing'),
    ('eat', 'ate eaten eats eating'), ('fly', 'flew flown flies flying'), ('hold', 'held holds holding'),
    ('light', 'lit lights lighting'), ('show', 'showed shown shows showing'), ('win', 'won wins winning'),
    ('feel', 'felt feels feeling'), ('leave', 'left leaves leaving'), ('keep', 'kept keeps keeping'),
    ('run', 'ran runs running'), ('come', 'came comes coming'), ('write', 'wrote written writes writing'),
    ('break', 'broke broken breaks breaking'), ('buy', 'bought buys buying'), ('think', 'thought thinks thinking'),
    ('find', 'found finds finding'), ('tell', 'told tells telling'), ('say', 'said says saying'),
    ('wear', 'wore worn wears wearing'), ('stand', 'stood stands standing'), ('pay', 'paid pays paying'),
    ('meet', 'met meets meeting'), ('send', 'sent sends sending'), ('build', 'built builds building'),
    ('grow', 'grew grown grows growing'), ('throw', 'threw thrown throws throwing'),
    ('become', 'became becomes becoming'), ('begin', 'began begun begins beginning'),
    ('blow', 'blew blown blows blowing'), ('catch', 'caught catches catching'),
    ('fall', 'fell fallen falls falling'), ('feed', 'fed feeds feeding'),
    ('fight', 'fought fights fighting'), ('forget', 'forgot forgotten forgets forgetting'),
    ('lay', 'laid lays laying'), ('lend', 'lent lends lending'),
    ('lie', 'lain lies lying'), ('lose', 'lost loses losing'),
    ('shake', 'shook shaken shakes shaking'), ('shoot', 'shot shoots shooting'),
    ('overcome', 'overcame overcomes overcoming'), ('spend', 'spent spends spending'),
    ('sell', 'sold sells selling'), ('hear', 'heard hears hearing'),
    ('understand', 'understood understands understanding'), ('rise', 'rose risen rises rising'),
    ('ride', 'rode ridden rides riding'), ('drive', 'drove driven drives driving'),
    ('swim', 'swam swum swims swimming'), ('sing', 'sang sung sings singing'),
    ('ring', 'rang rung rings ringing'), ('drink', 'drank drunk drinks drinking'),
    ('speak', 'spoke spoken speaks speaking'), ('choose', 'chose chosen chooses choosing'),
    ('cut', 'cuts cutting'), ('put', 'puts putting'), ('hit', 'hits hitting'),
    ('set', 'sets setting'), ('let', 'lets letting'), ('shut', 'shuts shutting'),
    ('cost', 'costs costing'), ('hurt', 'hurts hurting'), ('beat', 'beat beats beating'),
    ('teach', 'taught teaches teaching'), ('catch', 'caught catches catching'),
    ('hold', 'held holds holding'), ('keep', 'kept keeps keeping'),
    ('sleep', 'slept sleeps sleeping'), ('weep', 'wept weeps weeping'),
    ('mean', 'meant means meaning'), ('lead', 'led leads leading'),
]
_FORM2BASE = {}
for _b, _fs in _IRR_PAIRS:
    _FORM2BASE[_b] = _b
    for _f in _fs.split():
        _FORM2BASE[_f] = _b

_PLACEHOLDERS = {'a.', 'b.', 'sb', 'sth', 'sb.', 'sth.', "one's", 'oneself',
                 'someone', 'something', 'somebody', "someone's", 'a/b'}
_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z.'\-]*|\d[\d:.]*")

def _dedup(t):
    """末尾が重子音なら1つに（nodd→nod, hugg→hug, stopp→stop）。"""
    if len(t) >= 3 and t[-1] == t[-2] and t[-1] not in 'aeiou' and t[-1] not in 'lsz':
        return t[:-1]
    return t

def _stem(tok):
    t = tok.lower().strip(".,!?;:\"'()")
    if t in _FORM2BASE:
        return _FORM2BASE[t]
    if len(t) > 4 and t.endswith('ies'):
        return t[:-3] + 'y'
    if len(t) > 4 and t.endswith('ied'):
        return t[:-3] + 'y'
    if len(t) > 4 and t.endswith('ing'):
        return _dedup(t[:-3])
    if len(t) > 3 and t.endswith('ed'):
        return _dedup(t[:-2])
    if len(t) > 4 and t.endswith('es') and not t.endswith('sses'):
        return t[:-2]
    # 'ss' で終わる語は -s を剥がさない（miss→mis, class→clas を防ぐ）
    if len(t) > 3 and t.endswith('s') and not t.endswith('ss') and not t.endswith('us') and not t.endswith('is'):
        return t[:-1]
    return t

def _cands(tok):
    """語幹候補。-ed/-ing/-es で活用した語は、e 脱落（name→named→nam）を補う候補も持つ。"""
    t = tok.lower().strip(".,!?;:\"'()")
    s = _stem(tok)
    c = {s}
    if t.endswith(('ed', 'ing', 'es')) and len(s) >= 2:
        c.add(s + 'e')
    return c

def _match(ct, st):
    cs, ss = _stem(ct), _stem(st)
    if cs == ss:
        return True
    if _cands(ct) & _cands(st):
        return True
    # 前方一致・包含は両者とも4文字以上のときだけ（短い語の誤爆防止）
    if min(len(cs), len(ss)) >= 4 and (cs in ss or ss in cs):
        return True
    return False

_VOWELS = set("aeiou")

def _onset_token(w):
    """単語を「最初の音節の頭子音(クラスタ) + 残り文字数ぶんの下線」にする。
    最初の母音までの子音をすべて見せる（th/sh/ch/str/sch 等のクラスタもまとめて表示）。
    母音始まりの語は先頭1文字だけ見せる。記号(' -)は残す。"""
    onset_end = len(w)
    for i, ch in enumerate(w):
        low = ch.lower()
        if low in _VOWELS or (low == 'y' and i > 0):   # y は語頭では子音扱い
            onset_end = i
            break
    if onset_end == 0:        # 母音始まり → 先頭1文字だけ見せる
        onset_end = 1
    shown = w[:onset_end]
    rest = ''.join('_' if ch.isalpha() else ch for ch in w[onset_end:])
    return shown + rest

def _blank_for(phrase):
    """空欄表現を作る。各単語を頭子音ヒント＋語長下線にする。
    例: take the bus → t___ th_ b__ / think → th___ / school → sch___"""
    words = [w for w in re.split(r'\s+', phrase.strip()) if w]
    parts = [html.escape(_onset_token(w)) for w in words]
    return '<span class="blank">' + ' '.join(parts) + '</span>'

def _is_placeholder(tok):
    return tok in ('A', 'B') or tok.lower().strip(".") in _PLACEHOLDERS

def _trim(en, s, e):
    while e > s and en[e-1] in '.,!?;:':
        e -= 1
    return (s, e)

MAX_BLANK_WORDS = 4  # これを超える長いコロケーションは見出し語1語だけを空欄にする

def _headword_span(en, word, sen=None):
    """文中の見出し語（最後の単語）1語の範囲を返す。"""
    head = word.strip().split()[-1] if word.strip() else ''
    if not head:
        return None
    if sen is None:
        sen = [(mt.group(0), mt.start(), mt.end()) for mt in _TOKEN_RE.finditer(en)]
    for (txt, s, e) in sen:
        if _match(head, txt):
            return _trim(en, s, e)
    return None

def _collocation_span(en, collo, sen):
    """en の中で collo に対応する範囲 (s,e)。完全一致→連続一致→プレースホルダ・アンカー。"""
    idx = en.lower().find(collo.lower())
    if idx != -1:
        return _trim(en, idx, idx + len(collo))
    raw_toks = [mt.group(0) for mt in _TOKEN_RE.finditer(collo)]
    has_ph = any(_is_placeholder(t) for t in raw_toks)
    if not has_ph and raw_toks:
        for start in range(len(sen)):
            if start + len(raw_toks) > len(sen):
                break
            if all(_match(raw_toks[k], sen[start + k][0]) for k in range(len(raw_toks))):
                return _trim(en, sen[start][1], sen[start + len(raw_toks) - 1][2])
    if has_ph:
        content = [t for t in raw_toks if not _is_placeholder(t)]
        matched, si = [], 0
        for ct in content:
            j = si
            while j < len(sen) and not _match(ct, sen[j][0]):
                j += 1
            if j < len(sen):
                matched.append(j); si = j + 1
        if matched:
            return _trim(en, sen[matched[0]][1], sen[matched[-1]][2])
    return None

def emphasize(en, collo, word=''):
    """en の中で対象範囲を <strong> で囲んだ完成文と、同じ範囲を空欄にした穴埋め文を返す。
    範囲はコロケーション。ただし語数が多すぎる場合・見つからない場合は見出し語1語に絞る。
    強調と空欄は必ず同じ範囲（裏面の答え＝表面の空欄）。
    return: (en_html, en_blank, found)"""
    if not en:
        return '', '', False
    sen = [(mt.group(0), mt.start(), mt.end()) for mt in _TOKEN_RE.finditer(en)]
    span = _collocation_span(en, collo, sen) if collo else None
    if span is not None and len(en[span[0]:span[1]].split()) > MAX_BLANK_WORDS:
        span = _headword_span(en, word, sen) or span
    if span is None:
        span = _headword_span(en, word, sen)
    if span is None:
        esc = html.escape(en)
        return esc, esc, False
    s, e = span
    en_html = f"{html.escape(en[:s])}<strong>{html.escape(en[s:e])}</strong>{html.escape(en[e:])}"
    en_blank = f"{html.escape(en[:s])}{_blank_for(en[s:e])}{html.escape(en[e:])}"
    return en_html, en_blank, True

if __name__ == '__main__':
    result_path, out_path = sys.argv[1], sys.argv[2]
    # 任意: idioms.json（[{"w":単語,"c":コロケーション}, ...]）= イディオムタグを付与する対象
    idiom_set = set()
    if len(sys.argv) > 3:
        for d in json.load(open(sys.argv[3], encoding='utf-8')):
            idiom_set.add((d['w'], d['c']))

    # words.tsv で id -> (pos, word, meaning)
    meta = {}
    with open('words.tsv', encoding='utf-8') as f:
        for row in csv.DictReader(f, delimiter='\t'):
            meta[row['id']] = (row['pos'], row['word'], row['meaning'] or '')

    data = json.load(open(result_path, encoding='utf-8'))
    items = data.get('items', data) if isinstance(data, dict) else data

    rows = []
    warn = {'missing_meta': 0, 'collo_not_found': 0, 'dup_collo': 0, 'not_three': 0}
    seen_ids = set()
    for it in items:
        wid = it['id']
        if wid not in meta:
            warn['missing_meta'] += 1
            continue
        pos, word, meaning = meta[wid]
        sents = it.get('sentences', [])
        if len(sents) != 3:
            warn['not_three'] += 1
        collos_lower = set()
        for n, s in enumerate(sents[:3], 1):
            collo = (s.get('collocation') or '').strip()
            en = (s.get('en') or '').strip()
            ja = (s.get('ja') or '').strip()
            if collo.lower() in collos_lower:
                warn['dup_collo'] += 1
            collos_lower.add(collo.lower())
            en_html, en_blank, found = emphasize(en, collo, word)
            if not found:
                warn['collo_not_found'] += 1
            note_id = f"{wid}-{n}"
            seen_ids.add(note_id)
            tags = f"品詞:{pos}|単語:{word}"
            if (word, collo) in idiom_set:
                tags += "|イディオム"
            rows.append([note_id, word, pos, meaning, collo, ja, en_html, en_blank, tags])

    with open(out_path, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter='\t')
        w.writerow(['ID', '単語', '品詞', '意味', 'コロケーション', '和文', '英文', '英文穴埋め', 'タグ'])
        w.writerows(rows)

    print(f"単語 {len(items)} 件 → ノート {len(rows)} 件 を {out_path} に出力")
    print("警告:", json.dumps(warn, ensure_ascii=False))
