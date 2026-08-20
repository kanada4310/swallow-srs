/**
 * 判定の純ロジック（画面に依存しない）。
 *
 * 方針は工房の読解コーチをそのまま引き継ぐ:
 * - 切れ目は「必須の切れ目の見逃し」だけを指摘する。切りすぎは減点しない
 * - 組み立ては「字下げが一段浅い直近の上のチップ＝親」として模範と突き合わせる
 * - 例示（ex.）と根拠（←）は相互に許容する（読み方として両立するため）
 */

import { cutKey, kotoForSegment, studentSegments, type StudentSegment } from './segments'
import type {
  ArrangeItem,
  ParagraphWork,
  ReadingFoldBoundary,
  ReadingKoto,
  ReadingLessonData,
  ReadingParagraph,
  ReadingRequiredCut,
} from './types'

export const ROLE_RANK: Record<string, number> = { claim: 0, major: 1, minor: 2 }
export const ROLE_LABEL = ['主張に関わる箇所', 'サポートの箇所', '付帯の箇所']

export interface CutJudgement {
  missed: ReadingRequiredCut[]
  hitCount: number
  requiredCount: number
  extra: string[]
  /** 切らずに1まとまりとして読めた畳み境界 */
  foldsKept: ReadingFoldBoundary[]
  passed: boolean
}

export function judgeCuts(para: ReadingParagraph, cuts: string[] | Set<string>): CutJudgement {
  const cutSet = cuts instanceof Set ? cuts : new Set(cuts)
  const required = para.requiredCuts || []
  const folds = para.foldBoundaries || []

  const missed = required.filter((c) => !cutSet.has(cutKey(c.sentence, c.gap)))
  const extra = Array.from(cutSet).filter(
    (key) =>
      !required.some((c) => cutKey(c.sentence, c.gap) === key) &&
      !folds.some((f) => cutKey(f.sentence, f.gap) === key)
  )
  const foldsKept = folds.filter((f) => !cutSet.has(cutKey(f.sentence, f.gap)))

  return {
    missed,
    hitCount: required.length - missed.length,
    requiredCount: required.length,
    extra,
    foldsKept,
    passed: missed.length === 0,
  }
}

/* ===================== 講評モード（全段落まとめて） ===================== */

export interface ReviewMiss {
  paraIdx: number
  paraNo: number
  cut: ReadingRequiredCut
  rank: number
}

export interface ReviewJudgement {
  missed: ReviewMiss[]
  totalRequired: number
  totalHit: number
  foldsKept: number
  passed: boolean
}

export function judgeReview(data: ReadingLessonData, works: ParagraphWork[]): ReviewJudgement {
  const missed: ReviewMiss[] = []
  let totalRequired = 0
  let totalHit = 0
  let foldsKept = 0

  data.paragraphs.forEach((p, pi) => {
    const w = works[pi]
    const cutSet = new Set(w?.cuts ?? [])
    const required = p.requiredCuts || []
    required.forEach((c) => {
      totalRequired += 1
      if (cutSet.has(cutKey(c.sentence, c.gap))) {
        totalHit += 1
        return
      }
      const after = p.kotos.find((k) => k.no === c.afterNo)
      missed.push({ paraIdx: pi, paraNo: p.no, cut: c, rank: ROLE_RANK[after?.role ?? ''] ?? 2 })
    })
    const folds = p.foldBoundaries || []
    folds.forEach((f) => {
      if (!cutSet.has(cutKey(f.sentence, f.gap))) foldsKept += 1
    })
  })

  missed.sort((a, b) => a.rank - b.rank || a.paraIdx - b.paraIdx || a.cut.sentence - b.cut.sentence)

  return { missed, totalRequired, totalHit, foldsKept, passed: missed.length === 0 }
}

/* ===================== 組み立て ===================== */

export const ROOT_SYMS = ['TS', '⇔', '＝', '→']
export const CHILD_SYMS = ['←', 'ex.', '└', '⊂', '△', '→', '＝', '⇔']

/** 置いた場所によって選べる記号を絞る。同じ深さで仲間の下に並んだら ＋ が先頭候補。 */
export function symOptionsFor(arrange: ArrangeItem[], idx: number): string[] {
  const it = arrange[idx]
  if (!it) return ROOT_SYMS
  if (it.indent === 0) return ROOT_SYMS
  let hasPrevSibling = false
  for (let j = idx - 1; j >= 0; j--) {
    if (arrange[j].indent < it.indent) break
    if (arrange[j].indent === it.indent) {
      hasPrevSibling = true
      break
    }
  }
  return hasPrevSibling ? ['＋', ...CHILD_SYMS] : CHILD_SYMS
}

/** 例示と根拠は読み方として両立するので相互に許容する */
export function relSymOk(answer: string, expected: string): boolean {
  if (answer === expected) return true
  const soft = ['ex.', '←']
  return soft.includes(answer) && soft.includes(expected)
}

/**
 * 配置から相手（親）を導く。
 * ＋（並列）の行は同じ深さで上にある直近のチップ、それ以外は字下げが浅い直近の上のチップ。
 */
export function parentMap(arrange: ArrangeItem[]): Record<number, number | null> {
  const parentOf: Record<number, number | null> = {}
  arrange.forEach((it, i) => {
    if (it.indent === 0) {
      parentOf[it.no] = null
      return
    }
    let p: number | null = null
    if (it.sym === '＋') {
      for (let j = i - 1; j >= 0; j--) {
        const o = arrange[j]
        if (o.indent < it.indent) break
        if (o.indent === it.indent) {
          p = o.no
          break
        }
      }
    }
    if (p == null) {
      for (let j = i - 1; j >= 0; j--) {
        if (arrange[j].indent < it.indent) {
          p = arrange[j].no
          break
        }
      }
    }
    parentOf[it.no] = p
  })
  return parentOf
}

export interface RelationWrong {
  item: ArrangeItem
  koto: Partial<ReadingKoto>
  /** 受け入れ可能な（相手の事柄番号, 記号）の組 */
  pairs: Array<[number | null, string]>
  rank: number
}

export interface RelationJudgement {
  okCount: number
  total: number
  wrong: RelationWrong[]
  /** 事柄番号 → その事柄の先頭セグメント番号 */
  firstSegOfKoto: Record<number, number>
  passed: boolean
}

export function judgeRelations(para: ReadingParagraph, work: ParagraphWork): RelationJudgement {
  const arrange = work.arrange ?? []
  const segs = studentSegments(para, work.cuts)

  const kotoOf: Record<number, number | null> = {}
  segs.forEach((s) => {
    kotoOf[s.num] = kotoForSegment(para, s)
  })
  const firstSegOfKoto: Record<number, number> = {}
  segs.forEach((s) => {
    const kno = kotoOf[s.num]
    if (kno != null && firstSegOfKoto[kno] === undefined) firstSegOfKoto[kno] = s.num
  })

  const parentOf = parentMap(arrange)
  const wrong: RelationWrong[] = []
  let okCount = 0

  arrange.forEach((it) => {
    const kno = kotoOf[it.no]
    const k = (para.kotos.find((x) => x.no === kno) || {}) as Partial<ReadingKoto>
    const parentNum = parentOf[it.no]
    const parentKno = parentNum == null ? null : kotoOf[parentNum]

    // 同じ事柄の内部をさらに割った構造は、どう付けても良い（切りすぎ・フレーム切り出し）
    if (parentNum != null && parentKno === kno) {
      okCount += 1
      return
    }

    const pairs: Array<[number | null, string]> = []
    if (k.relParent == null) {
      pairs.push([null, k.relSym ?? ''])
    } else {
      pairs.push([k.relParent, k.relSym ?? ''])
      const alts = k.relAlts || []
      alts.forEach((a) => pairs.push([a, '＋']))
      if (k.relSym === '＋' && k.parent != null) {
        const firstMember = para.kotos.find((x) => x.no === alts[0])
        pairs.push([k.parent, firstMember ? firstMember.relSym : 'ex.'])
      }
    }

    const ok = pairs.some(
      ([pk, ps]) =>
        (pk == null ? parentKno == null && it.indent === 0 : parentKno === pk) &&
        relSymOk(it.sym, ps)
    )
    if (ok) okCount += 1
    else wrong.push({ item: it, koto: k, pairs, rank: ROLE_RANK[k.role ?? ''] ?? 2 })
  })

  wrong.sort((a, b) => a.rank - b.rank || a.item.no - b.item.no)

  return {
    okCount,
    total: arrange.length,
    wrong,
    firstSegOfKoto,
    passed: wrong.length === 0 && arrange.length > 0,
  }
}

/* ===================== 全体の組み立て ===================== */

export interface GlobalWrong {
  paraNo: number
  item: ArrangeItem
  expected: string
  macro: string
}

export interface GlobalJudgement {
  okCount: number
  total: number
  judged: number
  wrong: GlobalWrong[]
  passed: boolean
}

export function judgeGlobalArrange(
  paragraphs: ReadingParagraph[],
  arrange: ArrangeItem[]
): GlobalJudgement {
  const wrong: GlobalWrong[] = []
  let okCount = 0
  let judged = 0

  arrange.forEach((it) => {
    const p = paragraphs.find((x) => x.no === it.no)
    if (!p) {
      okCount += 1
      return
    }
    // 模範記号のない段落は判定しない（先頭を TS とだけ見なす）
    const expected = p.macroSym || (it.indent === 0 && arrange[0]?.no === it.no ? 'TS' : '')
    if (!expected) {
      okCount += 1
      return
    }
    judged += 1
    if (relSymOk(it.sym, expected)) okCount += 1
    else wrong.push({ paraNo: p.no, item: it, expected, macro: p.macro })
  })

  return { okCount, total: arrange.length, judged, wrong, passed: wrong.length === 0 }
}

/** 記号を選んでいない行 */
export function missingSyms(arrange: ArrangeItem[]): ArrangeItem[] {
  return arrange.filter((it) => !it.sym)
}

/** 生徒の切れ目が変わっていたら組み立てを組み直す必要がある */
export function arrangeMatchesSegments(
  arrange: ArrangeItem[] | null,
  segs: StudentSegment[]
): boolean {
  if (!arrange) return false
  if (arrange.length !== segs.length) return false
  return arrange.every((a) => segs.some((s) => s.num === a.no && s.id === a.id))
}
