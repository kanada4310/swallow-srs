/**
 * 構文の練習（工房の構文分析アプリの練習3問を移植）。
 *
 * 黄リー教式（品詞は上・働きは下、修飾は下線とカッコ）の書き込みを画面で行い、自動採点する。
 * 曖昧な箇所は「△（許容解）」として解説つきで受理する。
 *
 * 元アプリの「論理構造」タブは読解の流れ（切る→大意→組み立て）と重複するため畳んだ。
 * 「問題を追加」タブも移していない（教材づくりは工房の仕事）。
 */

export const POS_OPTIONS = [
  '名詞', '代名詞', '動詞', '助動詞', '形容詞', '副詞', '前置詞', '接続詞', '冠詞', '分詞', '不定詞',
]

/**
 * 品詞の英字略記（黄リー教式）。塾長の実書き込み（模範分析集 第7講・形式仕様.md）で
 * 確認された字母のみを採用する: n=名詞・代名詞 / v=動詞（分詞・不定詞を含む） /
 * a=冠詞・形容詞 / ad=副詞 / aux=助動詞。
 * 前置詞は品詞の段には書かず、働きの段に P と書く（記号の台帳・確定版 2026-08-26）。
 * 接続詞も品詞の字母を書かない（従位=働き▷・等位=働き＋）。
 */
export const POS_LETTER_OPTIONS = ['n', 'v', 'a', 'ad', 'aux']

export const POS_LETTER_LEGEND: Record<string, string> = {
  n: '名詞・代名詞',
  v: '動詞（分詞・不定詞も）',
  a: '冠詞・形容詞',
  ad: '副詞',
  aux: '助動詞',
}

/** 品詞の値（漢字名・英字のどちらでも）→ 英字略記。未知の値はそのまま返す */
const POS_TO_LETTER: Record<string, string> = {
  名詞: 'n',
  代名詞: 'n',
  動詞: 'v',
  分詞: 'v',
  不定詞: 'v',
  助動詞: 'aux',
  形容詞: 'a',
  冠詞: 'a',
  副詞: 'ad',
  前置詞: 'p',
  接続詞: '接',
}

export function posLetter(value: string): string {
  return POS_TO_LETTER[value] ?? value
}

/**
 * 読解1文画面（構文を分析する）の働きの選択肢。既存の書き込みデータ・AI判定の
 * 語彙と揃えているため、ここは従来表記のまま（変更は別起案）。
 */
export const ROLE_OPTIONS = ['S', 'V', 'O', 'C', 'M', '前O', '接']

/**
 * 構文の練習（ペン方式・タップ方式）の働きの選択肢。塾長の実書き込み
 * （模範分析集 第7講・形式仕様.md）の表記のまま使う（記号の台帳・確定版 2026-08-26）:
 * - Po・▷ を「前O」「接」に言い換えない
 * - M は現在の分析で使われていないため無い（副詞・冠詞などの修飾語には働きを書かない）
 * - P（前置詞）は本来品詞だが、書く利便性から働きの位置（下の段）に書く
 * - ＋＝等位接続詞（英単語を○で囲む書き方の置き換え）・同格
 */
export const ROLE_LETTER_OPTIONS = ['S', 'V', 'O', 'C', 'P', 'Po', '▷', '＋', '同格']

export type SpanType = 'ul' | 'adv' | 'n' | 'adjm' | 'comp'

export const SPAN_TYPES: Record<SpanType, { label: string; short: string; open: string; close: string }> = {
  ul: { label: '下線＝前置修飾のまとまり', short: '下線', open: '', close: '' },
  adv: { label: '（ ）＝副詞句・副詞節', short: '（ ）', open: '（', close: '）' },
  n: { label: '[ ]＝名詞句・名詞節', short: '[ ]', open: '[', close: ']' },
  adjm: { label: '< >＝後置修飾の形容詞句・節', short: '< >', open: '<', close: '>' },
  comp: { label: '{ }＝補語の形容詞句・節', short: '{ }', open: '{', close: '}' },
}

export function isPunct(token: string): boolean {
  return /^[.,!?;:'"”’)]$/.test(token)
}

export interface KeySlot {
  ok: string[]
  alt?: Array<{ v: string; note: string }>
}

export interface KeySpan {
  from: number
  to: number
  ok: SpanType[]
  alt?: Array<{ v: SpanType; note: string }>
  label?: string
  note?: string
}

export interface SyntaxProblem {
  id: string
  title: string
  source: string
  tokens: string[]
  key: {
    pos: Record<number, KeySlot>
    role: Record<number, KeySlot>
    spans: KeySpan[]
    notes: string[]
  }
}

export interface StudentSpan {
  from: number
  to: number
  type: SpanType
  /**
   * まとまり全体の働き（開始カッコの真下に書く書き方・[ ] と { } のみ）。
   * 第7講 P8-S3 ほかの「開始｛の下に C」の実例に基づく（記号の台帳・確定版 2026-08-26）。
   * 既存データには無い任意項目（採点は単語ごとの働きで行い、これは表示・検査の補助）。
   */
  role?: string
}

export interface SyntaxAnswer {
  pos: Array<string | null>
  role: Array<string | null>
  spans: StudentSpan[]
}

export const SYNTAX_PROBLEMS: SyntaxProblem[] = [
  {
    id: 'ex1',
    title: '① My brother plays tennis very well.',
    source: '基本: SVO＋副詞修飾',
    tokens: ['My', 'brother', 'plays', 'tennis', 'very', 'well', '.'],
    key: {
      pos: {
        0: { ok: ['代名詞'] }, 1: { ok: ['名詞'] }, 2: { ok: ['動詞'] }, 3: { ok: ['名詞'] },
        4: { ok: ['副詞'] }, 5: { ok: ['副詞'] },
      },
      // 働きは塾長の書き方に合わせ S・V・O・C・P・Po・▷ のみ。修飾語（My・very・well）には書かない
      role: {
        1: { ok: ['S'] }, 2: { ok: ['V'] }, 3: { ok: ['O'] },
      },
      spans: [
        { from: 0, to: 1, ok: ['ul'], label: 'My brother' },
        {
          from: 4, to: 5, ok: ['adv'], label: 'very well',
          note: 'very well は動詞 plays を修飾する副詞のまとまり。（ ）で囲む。',
        },
      ],
      notes: [
        'very は well を前置修飾し、そのまとまり全体が動詞を修飾する。（ ）の中の前置修飾に下線を引く流儀も可（この練習では省略）。',
      ],
    },
  },
  {
    id: 'ex2',
    title: '② The girl standing by the door is my sister.',
    source: '後置修飾（分詞）',
    tokens: ['The', 'girl', 'standing', 'by', 'the', 'door', 'is', 'my', 'sister', '.'],
    key: {
      pos: {
        0: { ok: ['冠詞'] }, 1: { ok: ['名詞'] },
        2: {
          ok: ['分詞'],
          alt: [{ v: '動詞', note: '現在分詞。品詞を「動詞」とするのも理解としては誤りではないが、この教材では「分詞」に統一する。' }],
        },
        // by（前置詞）は品詞の段に書かず、働きの段の P で表す（台帳の確定版）
        4: { ok: ['冠詞'] }, 5: { ok: ['名詞'] }, 6: { ok: ['動詞'] },
        7: { ok: ['代名詞'] }, 8: { ok: ['名詞'] },
      },
      // 前置詞 by は働きの位置に P、その目的語 door は Po（塾長の実書き込みの表記）
      role: {
        1: { ok: ['S'] }, 3: { ok: ['P'] },
        5: { ok: ['Po'] }, 6: { ok: ['V'] }, 8: { ok: ['C'] },
      },
      spans: [
        { from: 0, to: 1, ok: ['ul'], label: 'The girl' },
        {
          from: 2, to: 5, ok: ['adjm'], label: 'standing by the door',
          note: 'girl を後ろから修飾する形容詞句なので < > で囲む。',
        },
        {
          from: 3, to: 5, ok: ['adv'], label: 'by the door',
          note: 'standing（動詞性）を修飾する前置詞句なので（ ）。',
        },
        { from: 4, to: 5, ok: ['ul'], label: 'the door' },
        { from: 7, to: 8, ok: ['ul'], label: 'my sister' },
      ],
      notes: [
        '<standing by the door> の内部に（by the door）が入れ子になる。外側=形容詞句、内側=副詞句という2段構造を読めているかがポイント。',
      ],
    },
  },
  {
    id: 'ex3',
    title: '③ I saw a man with a telescope.（曖昧文）',
    source: 'PP付加の曖昧性 → どちらの解釈も○',
    tokens: ['I', 'saw', 'a', 'man', 'with', 'a', 'telescope', '.'],
    key: {
      pos: {
        0: { ok: ['代名詞'] }, 1: { ok: ['動詞'] }, 2: { ok: ['冠詞'] }, 3: { ok: ['名詞'] },
        // with（前置詞）は品詞の段に書かず、働きの段の P で表す（台帳の確定版）
        5: { ok: ['冠詞'] }, 6: { ok: ['名詞'] },
      },
      role: {
        0: { ok: ['S'] }, 1: { ok: ['V'] }, 3: { ok: ['O'] },
        4: { ok: ['P'] }, 6: { ok: ['Po'] },
      },
      spans: [
        { from: 2, to: 3, ok: ['ul'], label: 'a man' },
        { from: 5, to: 6, ok: ['ul'], label: 'a telescope' },
        {
          from: 4, to: 6, ok: ['adjm', 'adv'], label: 'with a telescope',
          note: 'この文は構造的に曖昧。<with a telescope> なら「望遠鏡を持った男」（man を修飾する形容詞句）、（with a telescope）なら「望遠鏡で男を見た」（saw を修飾する副詞句）。どちらの分析も正しい。',
        },
      ],
      notes: [
        '文脈がなければ with a telescope の掛かり先は一意に決まらない。ここでは < > と（ ）のどちらで囲んでも正解として扱う。実際の入試読解では文脈が決め手になる。',
      ],
    },
  },
]

/**
 * カッコの入れ子の深さ（0=一番外側）。spans と同じ並びで返す。
 * 下線（ul）はカッコではないので深さ 0 のまま数えない。
 * 範囲が同じカッコ同士は、先に書いたほうを外側とみなす。
 * 開きと閉じを同じ深さの色で塗り分けるための表示用ロジック。
 */
export function bracketDepths(spans: StudentSpan[]): number[] {
  return spans.map((s, i) => {
    if (s.type === 'ul') return 0
    let depth = 0
    spans.forEach((o, j) => {
      if (j === i || o.type === 'ul') return
      const contains = o.from <= s.from && s.to <= o.to
      const strictly = o.from < s.from || s.to < o.to
      if (contains && (strictly || j < i)) depth++
    })
    return depth
  })
}

/* ===================== 採点 ===================== */

export type Mark = 'ok' | 'alt' | 'bad'

export interface MarkResult {
  mark: Mark
  correct?: string
  note?: string
}

export function judgeSlot(
  value: string | null,
  slot: KeySlot | undefined,
  normalize: (v: string) => string = (v) => v,
): MarkResult | null {
  if (!slot) return null
  const correct = Array.from(new Set(slot.ok.map(normalize))).join('/')
  if (value == null) return { mark: 'bad', correct, note: '未記入' }
  const nv = normalize(value)
  if (slot.ok.some((o) => normalize(o) === nv)) return { mark: 'ok' }
  const a = (slot.alt || []).find((x) => normalize(x.v) === nv)
  if (a) return { mark: 'alt', note: a.note }
  return { mark: 'bad', correct }
}

export interface SyntaxFeedback {
  tone: Mark
  text: string
}

export interface SyntaxGrade {
  posMark: Record<number, MarkResult>
  roleMark: Record<number, MarkResult>
  spanMark: Record<number, Mark>
  total: number
  got: number
  percent: number
  feedback: SyntaxFeedback[]
}

export function gradeSyntax(problem: SyntaxProblem, answer: SyntaxAnswer): SyntaxGrade {
  const k = problem.key
  const posMark: Record<number, MarkResult> = {}
  const roleMark: Record<number, MarkResult> = {}
  const spanMark: Record<number, Mark> = {}
  const feedback: SyntaxFeedback[] = []
  let total = 0
  let got = 0

  problem.tokens.forEach((w, i) => {
    const posSlot = k.pos?.[i]
    if (posSlot) {
      // 品詞は英字略記（n/v/a/ad/aux/p）で書かれても漢字名の正解表と同値として採点する
      const m = judgeSlot(answer.pos[i] ?? null, posSlot, posLetter)!
      posMark[i] = m
      total++
      if (m.mark !== 'bad') got++
      if (m.mark === 'alt')
        feedback.push({ tone: 'alt', text: `△ 品詞「${w}」= ${posLetter(answer.pos[i] ?? '')}: ${m.note}` })
      else if (m.mark === 'bad')
        feedback.push({
          tone: 'bad',
          text: `× 品詞「${w}」: ${answer.pos[i] ? posLetter(answer.pos[i]!) : '未記入'} → 正解は ${m.correct}`,
        })
    }
    const roleSlot = k.role?.[i]
    if (!isPunct(w) && roleSlot) {
      const m = judgeSlot(answer.role[i] ?? null, roleSlot)!
      roleMark[i] = m
      total++
      if (m.mark !== 'bad') got++
      if (m.mark === 'alt') feedback.push({ tone: 'alt', text: `△ 働き「${w}」= ${answer.role[i]}: ${m.note}` })
      else if (m.mark === 'bad')
        feedback.push({ tone: 'bad', text: `× 働き「${w}」: ${answer.role[i] ?? '未記入'} → 正解は ${m.correct}` })
    }
  })

  const keySpans = (k.spans || []).map((s) => ({ ...s, matched: false }))
  answer.spans.forEach((s, idx) => {
    const text = problem.tokens.slice(s.from, s.to + 1).join(' ')
    const ks = keySpans.find((x) => x.from === s.from && x.to === s.to && !x.matched)
    if (!ks) {
      spanMark[idx] = 'bad'
      total++
      feedback.push({
        tone: 'bad',
        text: `× 余分なまとまり: ${SPAN_TYPES[s.type].short}「${text}」— 正解には無い区切りです`,
      })
      return
    }
    ks.matched = true
    total++
    if (ks.ok.includes(s.type)) {
      got++
      spanMark[idx] = 'ok'
      if (ks.ok.length > 1 && ks.note) feedback.push({ tone: 'alt', text: `◎「${text}」: ${ks.note}` })
      return
    }
    const a = (ks.alt || []).find((x) => x.v === s.type)
    if (a) {
      got++
      spanMark[idx] = 'alt'
      feedback.push({ tone: 'alt', text: `△「${text}」を ${SPAN_TYPES[s.type].short} と分析: ${a.note}` })
    } else {
      spanMark[idx] = 'bad'
      feedback.push({
        tone: 'bad',
        text:
          `× まとまり「${text}」の種類: ${SPAN_TYPES[s.type].short} → 正解は ` +
          ks.ok.map((t) => SPAN_TYPES[t].short).join(' または ') +
          (ks.note ? ` — ${ks.note}` : ''),
      })
    }
  })

  keySpans.forEach((ks) => {
    if (ks.matched) return
    total++
    const text = problem.tokens.slice(ks.from, ks.to + 1).join(' ')
    feedback.push({
      tone: 'bad',
      text:
        `× 見落とし: ${ks.ok.map((t) => SPAN_TYPES[t].short).join('/')}「${text}」` +
        (ks.note ? ` — ${ks.note}` : ''),
    })
  })

  return {
    posMark,
    roleMark,
    spanMark,
    total,
    got,
    percent: total ? Math.round((got / total) * 100) : 100,
    feedback,
  }
}

/** 空の解答欄 */
export function emptyAnswer(problem: SyntaxProblem): SyntaxAnswer {
  return {
    pos: problem.tokens.map(() => null),
    role: problem.tokens.map(() => null),
    spans: [],
  }
}

/** 正解を書き込んだ状態（第一解を採用） */
export function modelAnswer(problem: SyntaxProblem): SyntaxAnswer {
  const k = problem.key
  return {
    pos: problem.tokens.map((_, i) => (k.pos?.[i] ? k.pos[i].ok[0] : null)),
    role: problem.tokens.map((w, i) => (!isPunct(w) && k.role?.[i] ? k.role[i].ok[0] : null)),
    spans: (k.spans || []).map((s) => ({ from: s.from, to: s.to, type: s.ok[0] })),
  }
}
