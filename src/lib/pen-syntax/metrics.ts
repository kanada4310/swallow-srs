/**
 * 手書き判定の精度の測り方（2026-08-31 文字認識検討会・論点6で確定した3つの数字）。
 *
 * - 一発確定率: 書いた瞬間に正しい記号として自動確定した割合
 * - 取り違え率: **誤った記号のまま自動確定した**割合（採点・記録が汚れる。最優先で減らす）
 * - 候補選び率: 自動確定せず候補チップ（または一覧）での手選びに回った割合。
 *   内訳として「候補の中に正解があった（タップ1回で確定できる）」と
 *   「候補にも正解が無かった（書き直しになる）」を分けて数える
 *
 * 判定の分類は画面の確定ロジックと同じ規則で行う。確定のしかた（style）は2通り:
 * - 'chips'（着手前の見せ方）: best があり ambiguous=false のときだけ自動確定。
 *   それ以外は候補選び
 * - 'auto'（2026-09-02 の全記号の自動確定）: best があれば迷っていても確定。
 *   このとき「取り違え」は**修正されず残った誤り**の読みになる（画面では
 *   タッチで直せるが、この計測には修正の操作が無いため「要修正＝誤ったまま
 *   確定した」件数がそのまま出る）。候補選びは「拾えず」だけになる
 * どちらの style でも、best が台帳外の形（○・?・ダッシュ等）のときは解答へは
 * 反映されず案内が出るだけなので「取り違え」ではなく「候補にも正解が無い
 * （書き直し）」に数える。着手前との比較は同じ style どうしで行う。
 *
 * 同じ計測を「合成データ（機械生成・実機の実測ではない）」と「実書きデータ
 * （pen-lab の実書き計測で採った線）」の両方に使えるようにしてある。
 */

import type { Lane, PenStroke, RecognitionResult, SymbolId } from './types'
import { POS_LETTERS, ROLE_LETTERS } from './types'
import { classifyShape } from './shapes'
import { classifyPosLetter, classifyRoleLetter, type UserTemplateStore } from './letters'
import { deprecatedGuidance } from './ledger'
import { DEFAULT_TUNING, type RecognizerTuning } from './tuning'

/** 1回の書き込みの結末 */
export type TrialClass =
  | 'auto-ok' // 一発確定（正しい記号で自動確定）
  | 'misfire' // 取り違え（誤った記号のまま自動確定＝有害）
  | 'chip-rescued' // 候補選び（候補の中に正解あり＝タップ1回）
  | 'chip-lost' // 候補選び（候補にも正解なし＝一覧 or 書き直し）

/**
 * 確定のしかた。'chips'=着手前（迷ったら候補選び）／'auto'=全記号の自動確定
 * （2026-09-02。best があれば迷っていても確定し、誤りはタッチで直す）。
 */
export type ConfirmStyle = 'chips' | 'auto'

/** 画面の確定ロジックと同じ規則で、1回の判別結果を分類する */
export function classifyTrial(
  intended: SymbolId,
  result: RecognitionResult,
  style: ConfirmStyle = 'chips',
): TrialClass {
  const confirmed = style === 'auto' ? result.best !== null : result.best && !result.ambiguous
  if (confirmed && result.best) {
    if (result.best.symbol === intended) return 'auto-ok'
    // 台帳外の形での「確定」は解答に反映されない（案内のみ）＝記録は汚れない
    if (deprecatedGuidance(result.best.symbol)) return 'chip-lost'
    return 'misfire'
  }
  // 候補チップに出るのは上位3つ（画面と同じ）
  return result.candidates.slice(0, 3).some((c) => c.symbol === intended)
    ? 'chip-rescued'
    : 'chip-lost'
}

export interface MetricsTally {
  total: number
  autoOk: number
  misfire: number
  chipRescued: number
  chipLost: number
  /** 取り違えの内訳（正→誤 の組と件数） */
  confusions: Map<string, number>
}

export function newTally(): MetricsTally {
  return { total: 0, autoOk: 0, misfire: 0, chipRescued: 0, chipLost: 0, confusions: new Map() }
}

export function addTrial(
  t: MetricsTally,
  intended: SymbolId,
  result: RecognitionResult,
  style: ConfirmStyle = 'chips',
): TrialClass {
  const cls = classifyTrial(intended, result, style)
  t.total++
  if (cls === 'auto-ok') t.autoOk++
  else if (cls === 'misfire') {
    t.misfire++
    const key = `${intended}→${result.best?.symbol ?? '（なし）'}`
    t.confusions.set(key, (t.confusions.get(key) ?? 0) + 1)
  } else if (cls === 'chip-rescued') t.chipRescued++
  else t.chipLost++
  return cls
}

export function mergeTally(into: MetricsTally, from: MetricsTally): void {
  into.total += from.total
  into.autoOk += from.autoOk
  into.misfire += from.misfire
  into.chipRescued += from.chipRescued
  into.chipLost += from.chipLost
  for (const [k, v] of Array.from(from.confusions.entries())) {
    into.confusions.set(k, (into.confusions.get(k) ?? 0) + v)
  }
}

const pct = (n: number, d: number) => (d === 0 ? '-' : `${((n / d) * 100).toFixed(1)}%`)

/** 3つの数字を1行にする（完了報告へそのまま貼れる形） */
export function formatTallyLine(label: string, t: MetricsTally): string {
  const chips = t.chipRescued + t.chipLost
  const conf = Array.from(t.confusions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k}×${v}`)
    .join(' / ')
  return (
    `[実測] ${label}: 一発確定 ${pct(t.autoOk, t.total)} ・取り違え ${pct(t.misfire, t.total)} ` +
    `・候補選び ${pct(chips, t.total)}（内 候補に正解あり ${pct(t.chipRescued, t.total)} / ` +
    `候補にも無し ${pct(t.chipLost, t.total)}）（n=${t.total}）` +
    (conf ? ` 取り違えの内訳: ${conf}` : '')
  )
}

/* ---------- 実書きデータ（ラベル付きの線）の評価 ---------- */

/** ラベル付きの実書き1件（pen-lab の実書き計測が書き出す形） */
export interface LabeledSample {
  /** 書くよう指示した記号（正解ラベル） */
  symbol: SymbolId
  strokes: PenStroke[]
  /** 書かれた段（above=品詞 / band=本文 / below=働き）。無ければ記号の種類から推定 */
  lane?: Lane
}

/** 実書きデータひとまとまり（書き出し・報告貼り付け用） */
export interface SampleSet {
  note?: string
  device?: string
  collectedAt?: string
  samples: LabeledSample[]
}

function laneForSymbol(symbol: SymbolId): Lane {
  if ((POS_LETTERS as readonly string[]).includes(symbol)) return 'above'
  if ((ROLE_LETTERS as readonly string[]).includes(symbol) || symbol === '同') return 'below'
  return 'band'
}

/**
 * ラベル付きの線を判別器に通す（書かれた段で判別器を選ぶ＝画面と同じ振り分け）。
 * ※ 単語の箱を使う幅の判定（下線/波線と文字の切り分け）はここでは通らない。
 */
export function recognizeSample(
  sample: LabeledSample,
  store: UserTemplateStore | null,
  tuning: RecognizerTuning = DEFAULT_TUNING,
): RecognitionResult {
  const lane = sample.lane ?? laneForSymbol(sample.symbol)
  if (lane === 'above') return classifyPosLetter(sample.strokes, store, tuning)
  if (lane === 'below') return classifyRoleLetter(sample.strokes, store, tuning)
  return classifyShape(sample.strokes, store, tuning)
}

/** 記号種別の集計（全体合計は '合計' キー） */
export function evaluateSamples(
  samples: LabeledSample[],
  opts: { store?: UserTemplateStore | null; tuning?: RecognizerTuning; style?: ConfirmStyle } = {},
): Map<string, MetricsTally> {
  const per = new Map<string, MetricsTally>()
  const total = newTally()
  const style = opts.style ?? 'chips'
  for (const s of samples) {
    const result = recognizeSample(s, opts.store ?? null, opts.tuning ?? DEFAULT_TUNING)
    const t = per.get(s.symbol) ?? newTally()
    addTrial(t, s.symbol, result, style)
    per.set(s.symbol, t)
    addTrial(total, s.symbol, result, style)
  }
  per.set('合計', total)
  return per
}

/** 記号種別の一覧を報告用の複数行にする */
export function formatEvaluation(label: string, per: Map<string, MetricsTally>): string[] {
  const lines: string[] = []
  for (const [symbol, t] of Array.from(per.entries())) {
    if (symbol === '合計') continue
    lines.push(formatTallyLine(`${label} ${symbol}`, t))
  }
  const total = per.get('合計')
  if (total) lines.push(formatTallyLine(`${label} 合計`, total))
  return lines
}
