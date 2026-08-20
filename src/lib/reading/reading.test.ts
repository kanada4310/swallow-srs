import { describe, it, expect } from 'vitest'
import {
  circled,
  cutKey,
  gistFilled,
  gistText,
  gistsComplete,
  kotoForSegment,
  studentSegments,
} from './segments'
import {
  arrangeMatchesSegments,
  judgeCuts,
  judgeGlobalArrange,
  judgeRelations,
  judgeReview,
  missingSyms,
  parentMap,
  relSymOk,
  symOptionsFor,
} from './judge'
import {
  describeStep,
  emptyProgress,
  pickNewer,
  progressChanged,
  reconcileProgress,
  summarizeProgress,
} from './progress'
import { buildJudgePrompt } from './prompt'
import type { ArrangeItem, ParagraphWork, ReadingLessonData, ReadingParagraph } from './types'
import { emptyParagraphWork } from './progress'

/* ---------- テスト用の教材（届いた seg JSON と同じ形） ---------- */

function makeParagraph(): ReadingParagraph {
  return {
    no: 1,
    sentences: [
      { id: 'P1-S1', text: 'A b c', tokens: ['A', 'b', 'c'] },
      { id: 'P1-S2', text: 'D e', tokens: ['D', 'e'] },
    ],
    kotos: [
      {
        no: 1, s: 'S1', en: 'A b', sym: 'TS', lv: 1, role: 'claim', parent: null,
        relParent: null, relSym: 'TS', relAlts: [], t: '主張', cue: '', packed: '', expand: '', sentence: 0,
      },
      {
        no: 2, s: 'S1', en: 'c', sym: '←', lv: 2, role: 'major', parent: 1,
        relParent: 1, relSym: '←', relAlts: [], t: '根拠', cue: 'because', packed: '', expand: '', sentence: 0,
      },
      {
        no: 3, s: 'S2', en: 'D e', sym: 'ex.', lv: 2, role: 'minor', parent: 1,
        relParent: 1, relSym: 'ex.', relAlts: [], t: '例', cue: 'for example', packed: '', expand: '', sentence: 1,
      },
    ],
    segments: [
      { sentence: 0, token: 0, no: 1, cont: false },
      { sentence: 0, token: 2, no: 2, cont: false },
      { sentence: 1, token: 0, no: 3, cont: false },
    ],
    foldBoundaries: [],
    requiredCuts: [
      { sentence: 0, gap: 2, beforeNo: 1, afterNo: 2, cue: 'because', sym: '←', tBefore: '主張', tAfter: '根拠' },
      { sentence: 1, gap: 0, beforeNo: 2, afterNo: 3, cue: 'for example', sym: 'ex.', tBefore: '根拠', tAfter: '例' },
    ],
    macro: '段落の要旨',
    macroSym: '',
  }
}

function makeData(): ReadingLessonData {
  const p1 = makeParagraph()
  const p2: ReadingParagraph = {
    ...makeParagraph(),
    no: 2,
    macroSym: '⇔',
    macro: '第2段落の要旨',
    requiredCuts: [
      { sentence: 1, gap: 0, beforeNo: 2, afterNo: 3, cue: 'however', sym: '⇔', tBefore: 'x', tAfter: 'y' },
    ],
  }
  return { meta: { textbook: 'テスト教材', lesson: '第1講' }, paragraphs: [p1, p2] }
}

function workWithCuts(para: ReadingParagraph, cuts: string[]): ParagraphWork {
  return { ...emptyParagraphWork(para.requiredCuts), cuts }
}

/* ---------- セグメント ---------- */

describe('reading/segments', () => {
  it('cutKey と circled', () => {
    expect(cutKey(2, 3)).toBe('2:3')
    expect(circled(1)).toBe('①')
    expect(circled(21)).toBe('(21)')
  })

  it('切れ目が1つも無いと、段落全体が1つのまとまりになる', () => {
    const para = makeParagraph()
    const segs = studentSegments(para, [])
    expect(segs).toHaveLength(1)
    expect(segs[0].text).toBe('A b c D e')
    expect(segs[0].contStarts).toEqual([1])
  })

  it('文中の切れ目と文頭の切れ目でまとまりが分かれる', () => {
    const para = makeParagraph()
    const segs = studentSegments(para, ['0:2', '1:0'])
    expect(segs.map((s) => s.text)).toEqual(['A b', 'c', 'D e'])
    expect(segs.map((s) => s.id)).toEqual(['0:0', '0:2', '1:0'])
    expect(segs.map((s) => s.num)).toEqual([1, 2, 3])
  })

  it('まとまりは模範の事柄に対応づけられる', () => {
    const para = makeParagraph()
    const segs = studentSegments(para, ['0:2', '1:0'])
    expect(segs.map((s) => kotoForSegment(para, s))).toEqual([1, 2, 3])
  })

  it('大意は単文でも「A → B」でも書ける', () => {
    expect(gistText('ひとこと')).toBe('ひとこと')
    expect(gistText({ a: '原因', b: '結果' })).toBe('原因 → 結果')
    expect(gistFilled('')).toBe(false)
    expect(gistFilled({ a: '原因', b: '' })).toBe(false)
    expect(gistFilled({ a: '原因', b: '結果' })).toBe(true)
  })

  it('大意ゲート: 全部書くまで完了にならない', () => {
    const para = makeParagraph()
    const work = workWithCuts(para, ['0:2', '1:0'])
    expect(gistsComplete(para, work)).toBe(false)
    work.gists = { '0:0': 'あ', '0:2': 'い', '1:0': 'う' }
    expect(gistsComplete(para, work)).toBe(true)
  })
})

/* ---------- 切れ目の判定 ---------- */

describe('reading/judge 切れ目', () => {
  it('必須の切れ目が揃えば合格', () => {
    const para = makeParagraph()
    const r = judgeCuts(para, ['0:2', '1:0'])
    expect(r.passed).toBe(true)
    expect(r.hitCount).toBe(2)
    expect(r.missed).toHaveLength(0)
  })

  it('見逃しだけを指摘する', () => {
    const para = makeParagraph()
    const r = judgeCuts(para, ['0:2'])
    expect(r.passed).toBe(false)
    expect(r.missed).toHaveLength(1)
    expect(r.missed[0].sentence).toBe(1)
  })

  it('切りすぎは数えるだけで減点しない', () => {
    const para = makeParagraph()
    const r = judgeCuts(para, ['0:2', '1:0', '0:1'])
    expect(r.passed).toBe(true)
    expect(r.extra).toEqual(['0:1'])
  })

  it('畳み境界は切りすぎに数えず、切らなければ承認になる', () => {
    const para = makeParagraph()
    para.foldBoundaries = [{ sentence: 0, gap: 1 }]
    const kept = judgeCuts(para, ['0:2', '1:0'])
    expect(kept.extra).toHaveLength(0)
    expect(kept.foldsKept).toHaveLength(1)
    const cutThere = judgeCuts(para, ['0:2', '1:0', '0:1'])
    expect(cutThere.extra).toHaveLength(0)
    expect(cutThere.foldsKept).toHaveLength(0)
  })

  it('講評モードは全段落をまとめ、主張に関わるものを先に並べる', () => {
    const data = makeData()
    const works = data.paragraphs.map((p) => emptyParagraphWork(p.requiredCuts))
    const r = judgeReview(data, works)
    expect(r.totalRequired).toBe(3)
    expect(r.totalHit).toBe(0)
    expect(r.passed).toBe(false)
    // 第1段落 gap 0:2 の後続事柄は major(rank1)、1:0 の後続は minor(rank2)
    expect(r.missed[0].rank).toBeLessThanOrEqual(r.missed[1].rank)
  })
})

/* ---------- 組み立ての判定 ---------- */

describe('reading/judge 組み立て', () => {
  const arrangeOk: ArrangeItem[] = [
    { no: 1, id: '0:0', indent: 0, sym: 'TS' },
    { no: 2, id: '0:2', indent: 1, sym: '←' },
    { no: 3, id: '1:0', indent: 1, sym: 'ex.' },
  ]

  it('置いた場所で選べる記号が変わる', () => {
    expect(symOptionsFor(arrangeOk, 0)).toContain('TS')
    expect(symOptionsFor(arrangeOk, 1)).not.toContain('＋')
    // 同じ深さで仲間の下に並んだら ＋ が先頭候補
    expect(symOptionsFor(arrangeOk, 2)[0]).toBe('＋')
  })

  it('例示と根拠は相互に許容する', () => {
    expect(relSymOk('ex.', '←')).toBe(true)
    expect(relSymOk('⇔', 'ex.')).toBe(false)
  })

  it('字下げから相手（親）が決まる', () => {
    const map = parentMap(arrangeOk)
    expect(map[1]).toBeNull()
    expect(map[2]).toBe(1)
    expect(map[3]).toBe(1)
  })

  it('＋ は同じ深さの仲間に付く', () => {
    const arrange: ArrangeItem[] = [
      { no: 1, id: '0:0', indent: 0, sym: 'TS' },
      { no: 2, id: '0:2', indent: 1, sym: 'ex.' },
      { no: 3, id: '1:0', indent: 1, sym: '＋' },
    ]
    expect(parentMap(arrange)[3]).toBe(2)
  })

  it('正しく組めば全部○になる', () => {
    const para = makeParagraph()
    const work: ParagraphWork = { ...workWithCuts(para, ['0:2', '1:0']), arrange: arrangeOk }
    const r = judgeRelations(para, work)
    expect(r.okCount).toBe(3)
    expect(r.passed).toBe(true)
  })

  it('記号が違えば指摘する（正解候補も返す）', () => {
    const para = makeParagraph()
    const arrange = arrangeOk.map((a) => (a.no === 3 ? { ...a, sym: '⇔' } : a))
    const work: ParagraphWork = { ...workWithCuts(para, ['0:2', '1:0']), arrange }
    const r = judgeRelations(para, work)
    expect(r.passed).toBe(false)
    expect(r.wrong).toHaveLength(1)
    expect(r.wrong[0].item.no).toBe(3)
    expect(r.wrong[0].pairs[0]).toEqual([1, 'ex.'])
  })

  it('記号未選択の行を拾える', () => {
    expect(missingSyms([{ no: 1, id: 'a', indent: 0, sym: '' }])).toHaveLength(1)
  })

  it('切れ目を変えたら組み立ては組み直しになる', () => {
    const para = makeParagraph()
    const segs = studentSegments(para, ['0:2', '1:0'])
    expect(arrangeMatchesSegments(arrangeOk, segs)).toBe(true)
    expect(arrangeMatchesSegments(arrangeOk, studentSegments(para, ['1:0']))).toBe(false)
    expect(arrangeMatchesSegments(null, segs)).toBe(false)
  })
})

/* ---------- 全体の組み立て ---------- */

describe('reading/judge 全体', () => {
  it('模範記号のある段落だけ判定する', () => {
    const data = makeData()
    const arrange: ArrangeItem[] = [
      { no: 1, id: '1', indent: 0, sym: 'TS' },
      { no: 2, id: '2', indent: 0, sym: '⇔' },
    ]
    const r = judgeGlobalArrange(data.paragraphs, arrange)
    expect(r.judged).toBe(2)
    expect(r.passed).toBe(true)
  })

  it('段落間の記号が違えば指摘する', () => {
    const data = makeData()
    const arrange: ArrangeItem[] = [
      { no: 1, id: '1', indent: 0, sym: 'TS' },
      { no: 2, id: '2', indent: 0, sym: '→' },
    ]
    const r = judgeGlobalArrange(data.paragraphs, arrange)
    expect(r.passed).toBe(false)
    expect(r.wrong[0].expected).toBe('⇔')
  })
})

/* ---------- 途中保存 ---------- */

describe('reading/progress', () => {
  it('新規の状態は段落ぶんの器を持つ', () => {
    const data = makeData()
    const st = emptyProgress('テスト講', data)
    expect(st.paragraphs).toHaveLength(2)
    expect(Object.keys(st.paragraphs[0].cutStats)).toEqual(['0:2', '1:0'])
    expect(st.step).toBe('read')
    expect(st.completedAt).toBeNull()
  })

  it('保存済みの作業を読み直せる（教材が作り直されても壊れない）', () => {
    const data = makeData()
    const saved = emptyProgress('テスト講', data)
    saved.paragraphs[0].cuts = ['0:2']
    saved.paragraphs[0].cutStats['0:2'] = { hint: 3, resolved: true }
    saved.paragraphs[0].cutStats['消えた切れ目'] = { hint: 4, resolved: true }
    saved.step = 'gist'

    const restored = reconcileProgress(saved, 'テスト講', data)
    expect(restored.paragraphs[0].cuts).toEqual(['0:2'])
    expect(restored.paragraphs[0].cutStats['0:2'].hint).toBe(3)
    expect(restored.paragraphs[0].cutStats['消えた切れ目']).toBeUndefined()
    expect(restored.step).toBe('gist')
  })

  it('別の講の保存は引き継がない', () => {
    const data = makeData()
    const saved = emptyProgress('別の講', data)
    saved.paragraphs[0].cuts = ['0:2']
    const restored = reconcileProgress(saved, 'テスト講', data)
    expect(restored.paragraphs[0].cuts).toEqual([])
  })

  it('端末をまたいだら後に更新したほうを採る', () => {
    const data = makeData()
    const older = emptyProgress('テスト講', data, new Date('2026-08-20T01:00:00Z'))
    const newer = emptyProgress('テスト講', data, new Date('2026-08-20T02:00:00Z'))
    expect(pickNewer(older, newer)).toBe(newer)
    expect(pickNewer(newer, older)).toBe(newer)
    expect(pickNewer(null, older)).toBe(older)
  })

  it('中身が変わったときだけ保存する', () => {
    const data = makeData()
    const a = emptyProgress('テスト講', data)
    const b = { ...a, updatedAt: '2030-01-01T00:00:00Z' }
    expect(progressChanged(a, b)).toBe(false)
    const c = { ...a, step: 'cut' as const }
    expect(progressChanged(a, c)).toBe(true)
  })

  it('ヒント段数を集計して講師の画面に出せる形にする', () => {
    const data = makeData()
    const st = emptyProgress('テスト講', data)
    st.paragraphs[0].cuts = ['0:2', '1:0']
    st.paragraphs[0].passed = true
    st.paragraphs[0].cutStats['0:2'] = { hint: 0, resolved: true }
    st.paragraphs[0].cutStats['1:0'] = { hint: 3, resolved: true }
    st.paragraphs[0].gists = { '0:0': 'あ', '0:2': '', '1:0': 'う' }

    const s = summarizeProgress(st, [3, 1])
    expect(s.requiredCutsTotal).toBe(3)
    expect(s.cutsFound).toBe(2)
    expect(s.hints.self).toBe(2) // ¶1の1つ + ¶2の未着手1つ
    expect(s.hints.cue).toBe(1)
    expect(s.hintUsedCuts).toBe(1)
    expect(s.paragraphsPassed).toBe(1)
    expect(s.paragraphs[0].gistsWritten).toBe(2)
    expect(s.paragraphs[0].gistsTotal).toBe(3)
  })

  it('どこまで進んだかを一言で表せる', () => {
    const data = makeData()
    const st = emptyProgress('テスト講', data)
    st.step = 'cut'
    expect(describeStep(summarizeProgress(st))).toBe('切る（¶1 / 2）')
    st.completedAt = new Date().toISOString()
    expect(describeStep(summarizeProgress(st))).toBe('まとめまで終了')
  })
})

/* ---------- AI講評プロンプト（貼り付け方式） ---------- */

describe('reading/prompt', () => {
  it('正規形が無くても教材の模範を基準にした文章を作れる', () => {
    const para = makeParagraph()
    const work: ParagraphWork = {
      ...workWithCuts(para, ['0:2', '1:0']),
      gists: { '0:0': '主張のメモ', '0:2': '根拠のメモ', '1:0': '例のメモ' },
      arrange: [
        { no: 1, id: '0:0', indent: 0, sym: 'TS' },
        { no: 2, id: '0:2', indent: 1, sym: '←' },
        { no: 3, id: '1:0', indent: 1, sym: 'ex.' },
      ],
    }
    const prompt = buildJudgePrompt(para, work)
    expect(prompt).toContain('【採点の基準')
    expect(prompt).toContain('正規形（検収済みの採点基準）がまだ入っていない')
    expect(prompt).toContain('主張のメモ')
    expect(prompt).toContain('① A b')
  })

  it('検収済みの正規形があればそちらを基準にする', () => {
    const para = makeParagraph()
    para.anchor = { macro: '正規形の要旨', chain: [{ ja: '命題1' }, { ja: '命題2' }] }
    const work = workWithCuts(para, ['0:2', '1:0'])
    const prompt = buildJudgePrompt(para, work)
    expect(prompt).toContain('【内部アンカー')
    expect(prompt).toContain('命題1')
  })
})
