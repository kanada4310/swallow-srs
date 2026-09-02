/**
 * 手書き判定の精度計測（2026-09-01・検討会確定の3つの数字）。
 *
 * 一発確定率・取り違え率・候補選び率を記号種別に数える。
 * - 「着手前」= LEGACY_TUNING（2026-09-01 時点の挙動）
 * - 「改修後」= DEFAULT_TUNING（実運用の値）
 * を**同じ線**に通して前後比較する。
 *
 * データは2系統:
 * 1. 合成データ（synthetic-strokes.ts・種固定）——**実機の実測ではない**
 * 2. 実書きデータ（`samples/*.json`・pen-lab の実書き計測で採った線）——あれば読む。
 *    お手本に使う線と評価に使う線は出どころを分ける（教訓 benchmark-self-reference）:
 *    実書きデータの評価では、同じ書き出しに含まれる線をお手本化して使わない。
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PosLetter, RoleLetter, ShapeKind } from './types'
import type { UserTemplateStore } from './letters'
import { POS_STROKE_SOURCES, ROLE_STROKE_SOURCES } from './templates'
import { DEFAULT_TUNING, LEGACY_TUNING, type RecognizerTuning } from './tuning'
import {
  evaluateSamples,
  formatEvaluation,
  formatTallyLine,
  type ConfirmStyle,
  type LabeledSample,
  type SampleSet,
} from './metrics'
import {
  drawShape,
  jitter,
  mulberry32,
  QUIRK_KINDS,
  quirkClose,
  quirkStore,
  rand,
} from './synthetic-strokes'

const N = 60

/** 合成データ一式（種固定・毎回同じ）。お手本の写しではなく生成器で描く */
function syntheticSamples(): LabeledSample[] {
  const samples: LabeledSample[] = []
  const shapeKinds: ShapeKind[] = [
    'paren-open', 'paren-close', 'square-open', 'square-close',
    'angle-open', 'angle-close', 'brace-open', 'brace-close', 'hline', 'wavy',
  ]
  const rngShape = mulberry32(20260910)
  for (const kind of shapeKinds) {
    for (let i = 0; i < N; i++) {
      samples.push({ symbol: kind, strokes: drawShape(kind, rngShape), lane: 'band' })
    }
  }
  const rngRole = mulberry32(20260911)
  for (const src of ROLE_STROKE_SOURCES) {
    for (let i = 0; i < N / 2; i++) {
      samples.push({
        symbol: src.symbol as RoleLetter,
        strokes: jitter(src.strokes, rngRole, { size: rand(rngRole, 18, 30), noise: 1.2, rotDeg: 5 }),
        lane: 'below',
      })
    }
  }
  const rngPos = mulberry32(20260912)
  for (const src of POS_STROKE_SOURCES) {
    for (let i = 0; i < N / 2; i++) {
      samples.push({
        symbol: src.symbol as PosLetter,
        strokes: jitter(src.strokes, rngPos, { size: rand(rngPos, 20, 32), noise: 1.2, rotDeg: 4 }),
        lane: 'above',
      })
    }
  }
  return samples
}

/** 癖のある閉じ括弧（実機で判別率が低い書き方の模擬） */
function quirkSamples(): LabeledSample[] {
  const rng = mulberry32(20260913)
  const samples: LabeledSample[] = []
  for (const kind of QUIRK_KINDS) {
    for (let i = 0; i < N; i++) {
      samples.push({ symbol: kind, strokes: quirkClose(kind, rng), lane: 'band' })
    }
  }
  return samples
}

/**
 * 標準的な書き手のお手本（括弧8種×2本・初回お手本登録どおり）。
 * 本番はお手本登録が必須なので、計測も「お手本あり」を標準の条件にする。
 * お手本と評価データは別の種＝出どころを分ける。
 */
function standardBracketStore(): UserTemplateStore {
  const rng = mulberry32(20260950)
  const store: UserTemplateStore = {}
  const brackets: ShapeKind[] = [
    'paren-open', 'paren-close', 'square-open', 'square-close',
    'angle-open', 'angle-close', 'brace-open', 'brace-close',
  ]
  for (const kind of brackets) {
    store[kind] = [drawShape(kind, rng), drawShape(kind, rng)]
  }
  return store
}

/**
 * 実書き蓄積が育った状態の模擬（1記号あたり10件・お手本と評価は別の種）。
 * 項目1の本命「使うほど当たる」の効果を数えるための想定。
 */
function grownQuirkStore(): UserTemplateStore {
  const rng = mulberry32(20260914)
  const store: UserTemplateStore = {}
  for (const kind of QUIRK_KINDS) {
    store[kind] = Array.from({ length: 10 }, () => quirkClose(kind, rng))
  }
  const others: ShapeKind[] = ['paren-open', 'paren-close', 'square-open', 'angle-open', 'brace-open']
  for (const kind of others) {
    store[kind] = Array.from({ length: 6 }, () => drawShape(kind, rng))
  }
  return store
}

function report(
  label: string,
  samples: LabeledSample[],
  store: UserTemplateStore | null,
  tuning: RecognizerTuning,
  style: ConfirmStyle = 'chips',
) {
  const per = evaluateSamples(samples, { store, tuning, style })
  for (const line of formatEvaluation(label, per)) console.log(line)
  return per.get('合計')!
}

describe('精度計測: 合成データ（種固定・実機の実測ではない）', () => {
  it('着手前（LEGACY）と現行（DEFAULT）の3つの数字を記号種別に出す', { timeout: 120_000 }, () => {
    const samples = syntheticSamples()
    const std = standardBracketStore()
    const before = report('着手前 合成・標準（お手本8種あり）', samples, std, LEGACY_TUNING)
    const beforeQuirk = report('着手前 合成・癖のある閉じ括弧（お手本8種あり）', quirkSamples(), quirkStore(), LEGACY_TUNING)
    const beforeGrown = report('着手前 合成・癖のある閉じ括弧（蓄積10件）', quirkSamples(), grownQuirkStore(), LEGACY_TUNING)
    const after = report('現行 合成・標準（お手本8種あり）', samples, std, DEFAULT_TUNING)
    const afterQuirk = report('現行 合成・癖のある閉じ括弧（お手本8種あり）', quirkSamples(), quirkStore(), DEFAULT_TUNING)
    const afterGrown = report('現行 合成・癖のある閉じ括弧（蓄積10件）', quirkSamples(), grownQuirkStore(), DEFAULT_TUNING)
    console.log(formatTallyLine('着手前 合成 総合計', mergeAll(before, beforeQuirk)))
    console.log(formatTallyLine('現行 合成 総合計', mergeAll(after, afterQuirk)))
    expect(after.total).toBe(before.total)
    // 取り違え（誤ったまま確定）は改修で確実に減ること（最優先の目標）
    expect(after.misfire).toBeLessThan(before.misfire)
    expect(afterQuirk.misfire).toBeLessThanOrEqual(beforeQuirk.misfire)
    expect(afterGrown.misfire).toBeLessThan(beforeGrown.misfire)
    // 標準的な書き手（お手本8種）: 一発確定は下げず、取り違えは 1.5% 以下へ
    expect(after.autoOk / after.total).toBeGreaterThanOrEqual(before.autoOk / before.total)
    expect(after.misfire / after.total).toBeLessThanOrEqual(0.015)
    // 癖のある書き手も、候補（上位3）からタップ1回で拾える割合が高いこと
    expect((afterQuirk.autoOk + afterQuirk.chipRescued) / afterQuirk.total).toBeGreaterThanOrEqual(0.9)

    // 全記号の自動確定（2026-09-02 塾長判断）の読み: best があれば迷っていても確定する。
    // 「取り違え」＝修正されず残った誤り（画面ではタッチで直せるが、この計測には
    // 修正の操作が無いため「要修正＝誤ったまま確定」の件数がそのまま出る）
    const autoStd = report('自動確定 合成・標準（お手本8種あり）', samples, std, DEFAULT_TUNING, 'auto')
    const autoQuirk = report(
      '自動確定 合成・癖のある閉じ括弧（お手本8種あり）',
      quirkSamples(),
      quirkStore(),
      DEFAULT_TUNING,
      'auto',
    )
    console.log(formatTallyLine('自動確定 合成 総合計', mergeAll(autoStd, autoQuirk)))
    // 自動確定は「候補選びに回していた線」を確定に変えるだけなので、
    // 一発確定は候補選び方式（chips）以上・誤ったままの確定も同数以上になる
    expect(autoStd.autoOk).toBeGreaterThanOrEqual(after.autoOk)
    expect(autoStd.misfire).toBeGreaterThanOrEqual(after.misfire)
    // 標準的な書き手: 自動確定でも要修正（誤ったまま確定）は小さく収まること
    expect(autoStd.misfire / autoStd.total).toBeLessThanOrEqual(0.05)
  })
})

function mergeAll(...tallies: Array<ReturnType<typeof report>>) {
  const out = {
    total: 0,
    autoOk: 0,
    misfire: 0,
    chipRescued: 0,
    chipLost: 0,
    confusions: new Map<string, number>(),
  }
  for (const t of tallies) {
    out.total += t.total
    out.autoOk += t.autoOk
    out.misfire += t.misfire
    out.chipRescued += t.chipRescued
    out.chipLost += t.chipLost
    for (const [k, v] of Array.from(t.confusions.entries())) {
      out.confusions.set(k, (out.confusions.get(k) ?? 0) + v)
    }
  }
  return out
}

/* ---------- 実書きデータ（あれば読む） ---------- */

const SAMPLES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'samples')

function loadRealSampleSets(): Array<{ file: string; set: SampleSet }> {
  if (!existsSync(SAMPLES_DIR)) return []
  return readdirSync(SAMPLES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      file: f,
      set: JSON.parse(readFileSync(path.join(SAMPLES_DIR, f), 'utf8')) as SampleSet,
    }))
    .filter((x) => Array.isArray(x.set.samples) && x.set.samples.length > 0)
}

describe('精度計測: 実書きデータ（samples/*.json・pen-lab の実書き計測から）', () => {
  const sets = loadRealSampleSets()
  it(sets.length === 0 ? '実書きデータは未収集（塾長の書き込み待ち）' : '着手前と現行を同じ線で前後比較する', { timeout: 120_000 }, () => {
    if (sets.length === 0) {
      console.log('[実測] 実書きデータ（src/lib/pen-syntax/samples/*.json）はまだありません')
      return
    }
    for (const { file, set } of sets) {
      console.log(`--- 実書きデータ: ${file}（${set.samples.length}本・${set.device ?? '端末不明'}）`)
      report(`実書き ${file} 着手前`, set.samples, null, LEGACY_TUNING)
      report(`実書き ${file} 現行`, set.samples, null, DEFAULT_TUNING)
      report(`実書き ${file} 自動確定`, set.samples, null, DEFAULT_TUNING, 'auto')
    }
    expect(sets.every((s) => s.set.samples.length > 0)).toBe(true)
  })
})
