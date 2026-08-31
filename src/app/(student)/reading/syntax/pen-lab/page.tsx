'use client'

/**
 * ペン判別の計測ページ（実現可能性検証の測定器）。
 *
 * お題（この記号をこの単語に書く）を出し、書かれた線の判別結果と吸着先を
 * お題と突き合わせて自動で数える。二車線（形の記号=群A+B / 文字=群C）で別々に集計する。
 * 手のひら・指の接触は線にせず拒否して数える（誤反応の計測）。
 * すべて端末内で完結（外部送信なし・追加費用0円）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/AppLayout'
import { symbolLabel } from '@/components/pen-syntax/PenSyntaxAnnotator'
import { isPunct } from '@/lib/reading/syntax'
import type { PenPoint, PenStroke, SymbolId, TokenBox } from '@/lib/pen-syntax/types'
import { POS_LETTERS, ROLE_LETTERS } from '@/lib/pen-syntax/types'
import { ENROLLABLE_SYMBOLS } from '@/lib/pen-syntax/ledger'
import { useAuth } from '@/contexts/AuthContext'
import { recognizeGroup } from '@/lib/pen-syntax/recognize'
import { snapTargetFor } from '@/lib/pen-syntax/apply'
import { pathLength } from '@/lib/pen-syntax/geometry'
import { initialPalmState, type InputPolicy, type PalmState } from '@/lib/pen-syntax/palm'
import type { UserTemplateStore } from '@/lib/pen-syntax/letters'
import { usePenZoneGuard, type PenGuardEvent } from '@/components/pen-syntax/usePenZoneGuard'
import { PEN_UI_ATTR, PEN_WRITE_ZONE_ATTR } from '@/lib/pen-syntax/zone-guard'
import { PenInputLogPanel } from '@/components/pen-syntax/PenInputLogPanel'
import { BASELINE_PROBE_ATTR, useTokenBoxes } from '@/components/pen-syntax/useTokenBoxes'
import {
  useChipPlacement,
  type ChipAnchor,
} from '@/components/pen-syntax/useChipPlacement'
import { useStrokeCanvas, type DrawingStroke } from '@/components/pen-syntax/useStrokeCanvas'
import {
  useStrokeGrouping,
  type CommitInfo,
  type StrokeGrouping,
} from '@/components/pen-syntax/useStrokeGrouping'
import { EnrollCanvas } from '@/components/pen-syntax/EnrollCanvas'
import { createPenInputLog, type PenInputLog } from '@/lib/pen-syntax/input-log'
import {
  clearUserTemplates,
  loadUserTemplates,
  saveUserTemplate,
} from '@/lib/pen-syntax/user-templates'

const TOKENS = ['The', 'girl', 'standing', 'by', 'the', 'door', 'is', 'my', 'sister', '.']

type ModeKey = 'a' | 'b' | 'c-pos' | 'c-role' | 'free'

const MODES: Array<{ key: ModeKey; label: string }> = [
  { key: 'a', label: '群A: 括弧4種＋下線' },
  // ○で囲む漢字（例外の印）は 2026-08-31 に手書き認識を廃止（タッチ選択式）したため、お題から外した
  { key: 'b', label: '群B: 波線（熟語の印）' },
  { key: 'c-pos', label: '群C: 品詞の英字（上の行）' },
  { key: 'c-role', label: '群C: 働きの文字（下の行）' },
  { key: 'free', label: '自由練習（数えない）' },
]

interface LabTask {
  symbol: SymbolId
  target: { from: number; to: number }
  description: string
}

interface Attempt {
  intended: SymbolId
  recognized: SymbolId | null
  kind: 'auto' | 'candidate' | 'failed'
  symbolOk: boolean
  snapOk: boolean | null
}

interface Stats {
  attempts: number
  autoOk: number
  rescuedOk: number
  wrong: number
  lost: number
  snapTotal: number
  snapOk: number
}

const emptyStats = (): Stats => ({
  attempts: 0,
  autoOk: 0,
  rescuedOk: 0,
  wrong: 0,
  lost: 0,
  snapTotal: 0,
  snapOk: 0,
})

function contentIndexes(): number[] {
  return TOKENS.map((t, i) => (isPunct(t) ? -1 : i)).filter((i) => i >= 0)
}

function randOf<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)]
}

function makeTask(mode: ModeKey): LabTask | null {
  const idxs = contentIndexes()
  const i = randOf(idxs)
  const word = (k: number) => `「${TOKENS[k]}」（${k + 1}語目）`
  if (mode === 'a') {
    const kind = randOf(['paren', 'square', 'angle', 'brace', 'hline'] as const)
    if (kind === 'hline') {
      const from = randOf(idxs.filter((k) => k < 8))
      const to = Math.min(from + 1 + Math.floor(Math.random() * 2), 8)
      return {
        symbol: 'hline',
        target: { from, to },
        description: `${word(from)}から${word(to)}までの【下】に下線を引く`,
      }
    }
    const open = Math.random() < 0.5
    const symbol = `${kind}-${open ? 'open' : 'close'}` as SymbolId
    return {
      symbol,
      target: { from: i, to: i },
      description: `${word(i)}の【${open ? '前' : '後ろ'}】に ${symbolLabel(symbol)} を書く`,
    }
  }
  if (mode === 'b') {
    return {
      symbol: 'wavy',
      target: { from: i, to: i },
      description: `${word(i)}の下に波線（熟語の印）を書く`,
    }
  }
  if (mode === 'c-pos') {
    const symbol = randOf([...POS_LETTERS]) as SymbolId
    return {
      symbol,
      target: { from: i, to: i },
      description: `${word(i)}の【上】に「${symbol}」と書く`,
    }
  }
  if (mode === 'c-role') {
    const symbol = randOf([...ROLE_LETTERS]) as SymbolId
    return {
      symbol,
      target: { from: i, to: i },
      description: `${word(i)}の【下】に「${symbol}」と書く`,
    }
  }
  return null
}

/** 確定までの時間の計測（実機で「書いたのに、まだ確定しない」時間を数える） */
interface LatencyStats {
  n: number
  sumWait: number
  maxWait: number
  /** 次の記号を書き始めてから、前の記号が確定するまで */
  nSince: number
  sumSince: number
  maxSince: number
}

const emptyLatency = (): LatencyStats => ({
  n: 0,
  sumWait: 0,
  maxWait: 0,
  nSince: 0,
  sumSince: 0,
  maxSince: 0,
})

export default function PenLabPage() {
  // お手本は利用者ごとに保存する（共有端末で他人の字を引き継がない・2026-08-27）
  const { userId, isLoading: authLoading } = useAuth()
  const [mode, setMode] = useState<ModeKey>('a')
  // 既定は「ペンのみ」（実運用と同じ・手のひら対策）
  const [policy, setPolicy] = useState<InputPolicy>('pen-only')
  // お題は乱数で作るため、サーバー描画と食い違わないよう画面表示後に作る
  const [task, setTask] = useState<LabTask | null>(null)
  useEffect(() => {
    setTask(makeTask('a'))
  }, [])
  const [stats, setStats] = useState<Record<string, Stats>>({})
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [palm, setPalm] = useState<PalmState>(initialPalmState())
  // 入力の記録（実機不具合の報告用）。受理/拒否・座標・画面の移動を時系列で残す
  const inputLogRef = useRef<PenInputLog | null>(null)
  if (!inputLogRef.current) inputLogRef.current = createPenInputLog()
  const inputLog = inputLogRef.current
  const onGuard = useCallback(
    (ev: PenGuardEvent) => {
      inputLog.push({
        kind: 'guard',
        at: performance.now(),
        event: ev.event,
        action: ev.action,
        reason: ev.reason,
        zone: ev.zone,
        x: ev.x,
        y: ev.y,
      })
    },
    [inputLog],
  )
  // ゾーン方式の画面ガード（書き込みエリア内=ペン専用／エリア外=指のみ）
  usePenZoneGuard(policy === 'pen-only', onGuard)
  const [store, setStore] = useState<UserTemplateStore>({})
  const [lastResult, setLastResult] = useState<string | null>(null)
  type ChipState = {
    candidates: Array<{ symbol: SymbolId; score: number }>
    strokes: PenStroke[]
    boxes: TokenBox[]
    /** 置き場所の手がかり（書き込み部品と同じ扱い） */
    anchor: ChipAnchor
  }
  const [chips, setChipsState] = useState<ChipState | null>(null)
  // 書き始めた瞬間に候補を閉じるので、描画前の値を参照でも持つ
  const chipsRef = useRef<ChipState | null>(null)
  const setChips = useCallback((next: ChipState | null) => {
    chipsRef.current = next
    setChipsState(next)
  }, [])

  useEffect(() => {
    if (authLoading) return
    setStore(loadUserTemplates(userId))
  }, [authLoading, userId])

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wordRefs = useRef<Array<HTMLElement | null>>([])
  const drawingRef = useRef<DrawingStroke | null>(null)
  const groupingRef = useRef<StrokeGrouping | null>(null)
  const [latency, setLatency] = useState<LatencyStats>(emptyLatency)

  // 単語の箱の採寸（毎描画後に自動で測り直す・キャンバスの画素数合わせも行う）
  const boxes = useTokenBoxes(containerRef, wordRefs, TOKENS, canvasRef)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(43, 108, 176, 0.9)'
    const paint = (stroke: PenPoint[]) => {
      if (stroke.length < 2) return
      ctx.beginPath()
      ctx.moveTo(stroke[0].x, stroke[0].y)
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y)
      ctx.stroke()
    }
    for (const s of groupingRef.current?.pending() ?? []) paint(s)
    if (chips) for (const s of chips.strokes) paint(s)
    if (drawingRef.current) paint(drawingRef.current.stroke)
  }, [chips])

  useEffect(() => redraw(), [redraw])

  const record = useCallback(
    (
      intended: SymbolId,
      recognized: SymbolId | null,
      kind: Attempt['kind'],
      strokes: PenStroke[],
      lineBoxes: TokenBox[],
      target: { from: number; to: number },
    ) => {
      const symbolOk = recognized === intended
      let snapOk: boolean | null = null
      if (symbolOk && recognized) {
        const snapped = snapTargetFor(recognized, strokes, lineBoxes)
        snapOk = snapped !== null && snapped.from === target.from && snapped.to === target.to
      }
      setAttempts((xs) => [{ intended, recognized, kind, symbolOk, snapOk }, ...xs].slice(0, 30))
      setStats((prev) => {
        const s = { ...(prev[mode] ?? emptyStats()) }
        s.attempts++
        if (symbolOk && kind === 'auto') s.autoOk++
        else if (symbolOk && kind === 'candidate') s.rescuedOk++
        else if (kind === 'failed') s.lost++
        else s.wrong++
        if (snapOk !== null) {
          s.snapTotal++
          if (snapOk) s.snapOk++
        }
        return { ...prev, [mode]: s }
      })
      setLastResult(
        symbolOk
          ? `✓ ${symbolLabel(intended)} と判別（${kind === 'auto' ? '一発' : '候補タップ'}）` +
              (snapOk === false ? ' ／ ✕ 吸着先がずれました' : snapOk ? ' ／ 吸着も正解' : '')
          : recognized
            ? `✕ ${symbolLabel(recognized)} と誤判別（正: ${symbolLabel(intended)}）`
            : `✕ 拾えませんでした（正: ${symbolLabel(intended)}）`,
      )
    },
    [mode],
  )

  const handleCommit = useCallback((strokes: PenStroke[], info: CommitInfo) => {
    setLatency((s) => ({
      n: s.n + 1,
      sumWait: s.sumWait + info.waitedMs,
      maxWait: Math.max(s.maxWait, info.waitedMs),
      nSince: s.nSince + (info.sinceStartMs == null ? 0 : 1),
      sumSince: s.sumSince + (info.sinceStartMs ?? 0),
      maxSince: Math.max(s.maxSince, info.sinceStartMs ?? 0),
    }))
    const rec = recognizeGroup(strokes, boxes, store)
    if (mode === 'free') {
      setLastResult(
        rec.result.best
          ? `判別: ${symbolLabel(rec.result.best.symbol)}（確信 ${(rec.result.best.score * 100).toFixed(0)}%）`
          : '判別できませんでした',
      )
      redraw()
      return
    }
    if (!task) return
    if (rec.result.best && !rec.result.ambiguous) {
      record(task.symbol, rec.result.best.symbol, 'auto', strokes, rec.boxes, task.target)
      setTask(makeTask(mode))
      redraw()
      return
    }
    // 迷ったとき: 候補チップから「書いたつもりの記号」をタップしてもらう。
    // 枠はいま書いた場所を避けて出す（書き込み部品と同じ chip-place.ts）
    const xs = strokes.flat()
    const stroke = {
      left: Math.min(...xs.map((p) => p.x)),
      right: Math.max(...xs.map((p) => p.x)),
      top: Math.min(...xs.map((p) => p.y)),
      bottom: Math.max(...xs.map((p) => p.y)),
    }
    const row = rec.boxes.length
      ? {
          top: Math.min(...rec.boxes.map((t) => t.top)),
          bottom: Math.max(...rec.boxes.map((t) => t.bottom)),
        }
      : null
    setChips({
      candidates: rec.result.candidates,
      strokes,
      boxes: rec.boxes,
      anchor: { stroke, row, lane: rec.lane },
    })
  }, [boxes, mode, record, redraw, setChips, store, task])

  const grouping = useStrokeGrouping({ boxes, onCommit: handleCommit, log: inputLog })
  groupingRef.current = grouping

  // 候補の枠は、いま書いた場所を避けて置く（実寸を測ってから位置を決める）
  const chipRef = useRef<HTMLDivElement>(null)
  const chipPos = useChipPlacement(containerRef, chipRef, chips?.anchor ?? null)
  // この接触で候補を閉じたか（閉じただけのタップを線にしないため）
  const dismissedByStrokeRef = useRef(false)

  /**
   * 書き続けたら候補は黙って引っ込める（2026-08-27・書き込み部品と同じ扱い）。
   * 候補を押す操作とは当たり判定で分かれる（候補の枠はキャンバスより上に重ねてある）。
   * 計測の数字を歪めないよう、**この線は数えない**（書いたつもりの記号を
   * 答えてもらっていないので、拾えた／拾えなかったの判定材料がない）。お題は据え置き、
   * 同じお題をもう一度書き直せる。
   */
  const dismissChips = useCallback((): boolean => {
    if (!chipsRef.current) return false
    setChips(null)
    inputLog.push({
      kind: 'note',
      at: performance.now(),
      text: '候補を出したまま書き始めたので候補を閉じた（この線は破棄・計測には数えない）',
    })
    setLastResult('候補を出したまま書き始めたので、前の線は捨てました（数えていません）')
    return true
  }, [inputLog, setChips])

  const resolveChip = (symbol: SymbolId | null) => {
    if (!chips) return
    if (mode !== 'free' && task) {
      if (symbol) record(task.symbol, symbol, 'candidate', chips.strokes, chips.boxes, task.target)
      else record(task.symbol, null, 'failed', chips.strokes, chips.boxes, task.target)
      setTask(makeTask(mode))
    }
    setChips(null)
  }

  // ペンのタップでボタンを確実に反応させる保険（クリックにならない環境向け）。
  // クリックも届く環境での二重発火は直前のペン発火時刻で防ぐ
  const penTapAtRef = useRef(0)
  const penTap = (fn: () => void) => ({
    onClick: () => {
      if (performance.now() - penTapAtRef.current < 400) return
      fn()
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (e.pointerType !== 'pen') return
      penTapAtRef.current = performance.now()
      fn()
    },
  })

  // 入力・座標・画面固定は useStrokeCanvas が受け持つ（書き込み部品と同じ実装を共有）
  const { handlers } = useStrokeCanvas({
    containerRef,
    drawingRef,
    policy,
    // 候補が出ていても書き込みは受け付ける（書き込み部品と同じ扱い）。
    // 止めると、続けて書いたときに次の1画目が黙って消える
    active: true,
    log: inputLog,
    onDecision: (d) => setPalm(d.next),
    onStrokeStart: (p) => {
      // 書き始めたら候補は引っ込める（この線は失わない）
      dismissedByStrokeRef.current = dismissChips()
      // 触れた瞬間に境界（段・単語・行）をまたいでいれば、待たずに前の記号を確定させる
      grouping.noteStrokeStart(p)
    },
    onStroke: (stroke) => {
      const dismissed = dismissedByStrokeRef.current
      dismissedByStrokeRef.current = false
      // 候補の枠の外を軽くタップしただけなら「候補を閉じる」操作として線にしない
      const duration = (stroke[stroke.length - 1].t ?? 0) - (stroke[0].t ?? 0)
      if (dismissed && pathLength(stroke) < 7 && duration < 400) {
        redraw()
        return
      }
      if (stroke.length < 2) stroke.push({ ...stroke[0], x: stroke[0].x + 0.5 })
      grouping.addStroke(stroke)
      redraw()
    },
    onRedraw: redraw,
  })

  const s = stats[mode] ?? emptyStats()
  const pct = (n: number, dd: number) => (dd === 0 ? '-' : `${((n / dd) * 100).toFixed(1)}%`)
  const ms = (sum: number, n: number) => (n === 0 ? '-' : `${Math.round(sum / n)}ms`)

  const summaryText = MODES.filter((m) => m.key !== 'free')
    .map((m) => {
      const st = stats[m.key]
      if (!st || st.attempts === 0) return `${m.label}: 記録なし`
      return (
        `${m.label}: n=${st.attempts} 一発判別 ${pct(st.autoOk, st.attempts)}` +
        ` 候補タップで確定 ${pct(st.rescuedOk, st.attempts)} 誤判別 ${pct(st.wrong, st.attempts)}` +
        ` 拾えず ${pct(st.lost, st.attempts)} 吸着正解 ${pct(st.snapOk, st.snapTotal)}(n=${st.snapTotal})`
      )
    })
    .concat([
      `手のひら・指: 拒否して防いだ接触 ${palm.rejectedTouches} 件 / 線として受理 ${palm.acceptedTouches} 件`,
      `確定までの時間: n=${latency.n} 書き終えてから 平均 ${ms(latency.sumWait, latency.n)}` +
        ` 最大 ${Math.round(latency.maxWait)}ms ／ 次を書き始めてから 平均 ${ms(latency.sumSince, latency.nSince)}` +
        ` 最大 ${Math.round(latency.maxSince)}ms (n=${latency.nSince})`,
    ])
    .join('\n')

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <Link href="/reading/syntax" className="text-xs font-semibold text-sora-dark">
          ← 構文の練習
        </Link>
        <h1 className="mb-1 mt-1 text-2xl font-extrabold text-ai">ペン判別の計測</h1>
        <p className="mb-3 text-sm leading-relaxed text-ink-2">
          お題どおりにペンで書くと、判別と吸着の正誤を自動で数えます。
          「形の記号（群A・B）」と「文字（群C）」は別々に集計されます。結果は端末の外に出ません。
        </p>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                setMode(m.key)
                setTask(makeTask(m.key))
                setChips(null)
                setLastResult(null)
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                mode === m.key ? 'bg-sora text-white' : 'border border-gray-300 bg-white text-ai'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-ink-3">入力:</span>
          {(
            [
              ['pen-only', 'ペンのみ（実運用と同じ）'],
              ['pen-or-mouse', 'ペン＋マウス'],
              ['any', '指でも書く'],
            ] as Array<[InputPolicy, string]>
          ).map(([p, label]) => (
            <button
              key={p}
              type="button"
              onClick={() => setPolicy(p)}
              className={`rounded-full px-2.5 py-1 font-bold ${
                policy === p ? 'bg-ai text-white' : 'border border-gray-300 bg-white text-ai'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode !== 'free' && task && (
          <div className="mb-2 rounded-card border border-nodo bg-white p-3 shadow-card">
            <p className="text-xs font-bold text-ink-3">お題</p>
            <p className="text-base font-extrabold text-ai">{task.description}</p>
          </div>
        )}

        <div
          ref={containerRef}
          className="relative mb-2 rounded-card border border-gray-200 bg-white px-3 pb-14 pt-14 shadow-card"
          {...{ [PEN_WRITE_ZONE_ATTR]: '' }}
        >
          <div className="flex flex-wrap items-end gap-x-1.5 gap-y-16">
            {TOKENS.map((tok, i) => (
              <span
                key={i}
                ref={(el) => {
                  wordRefs.current[i] = el
                }}
                className="whitespace-nowrap px-0.5 font-serif text-xl text-ink"
              >
                {tok}
                {/* ベースラインの目印（採寸の一元化・構文の練習と同じ作り） */}
                <span
                  aria-hidden
                  className="inline-block h-0 w-0 overflow-hidden align-baseline"
                  {...{ [BASELINE_PROBE_ATTR]: '' }}
                />
              </span>
            ))}
          </div>
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-10 h-full w-full"
            style={{ touchAction: 'none' }}
            {...handlers}
          />
          {chips && (
            <div
              ref={chipRef}
              className="absolute z-20 whitespace-nowrap rounded-xl border border-sora bg-white p-2 shadow-card"
              style={
                chipPos
                  ? { left: chipPos.left, top: chipPos.top }
                  : { left: 0, top: 0, visibility: 'hidden' }
              }
              {...{ [PEN_UI_ATTR]: '' }}
            >
              <p className="mb-1 text-[10px] font-bold text-ink-3">どの記号を書きましたか？</p>
              <div className="flex items-center gap-1.5">
                {chips.candidates.slice(0, 3).map((c) => (
                  <button
                    key={c.symbol}
                    type="button"
                    {...penTap(() => resolveChip(c.symbol))}
                    className="rounded-lg bg-sora-soft px-2.5 py-1.5 text-sm font-bold text-ai"
                  >
                    {symbolLabel(c.symbol)}
                  </button>
                ))}
                <button
                  type="button"
                  {...penTap(() => resolveChip(null))}
                  className="rounded-lg px-2 py-1.5 text-xs font-bold text-again"
                >
                  どれでもない
                </button>
              </div>
            </div>
          )}
        </div>

        {lastResult && (
          <p className="mb-3 rounded-xl bg-sora-soft p-2.5 text-sm font-bold text-ai">{lastResult}</p>
        )}

        <div className="mb-4 rounded-card border border-gray-200 bg-white p-3 shadow-card">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-bold text-ai">確定までの時間（速さの計測）</p>
            <button
              type="button"
              onClick={() => setLatency(emptyLatency())}
              className="text-xs font-bold text-again"
            >
              リセット
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-4">
            <Stat label="確定した記号" value={`${latency.n}`} />
            <Stat label="書き終えてから 平均" value={ms(latency.sumWait, latency.n)} />
            <Stat label="同 最大" value={latency.n === 0 ? '-' : `${Math.round(latency.maxWait)}ms`} />
            <Stat
              label="次を書き始めてから 平均"
              value={latency.nSince === 0 ? '-' : ms(latency.sumSince, latency.nSince)}
            />
          </div>
          <p className="mt-2 text-xs text-ink-3">
            「次を書き始めてから」＝もう次の記号を書いているのに、前の記号がまだ確定していない時間。
            段・単語をまたいだら待たずに確定するので、続けて書くときは 0ms 前後になります。
          </p>
        </div>

        {mode !== 'free' && (
          <div className="mb-4 rounded-card border border-gray-200 bg-white p-3 shadow-card">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-bold text-ai">この車線の集計（{MODES.find((m) => m.key === mode)?.label}）</p>
              <button
                type="button"
                onClick={() => {
                  setStats((prev) => ({ ...prev, [mode]: emptyStats() }))
                  setAttempts([])
                }}
                className="text-xs font-bold text-again"
              >
                リセット
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-5">
              <Stat label="試行" value={`${s.attempts}`} />
              <Stat label="一発判別" value={pct(s.autoOk, s.attempts)} />
              <Stat label="候補タップ" value={pct(s.rescuedOk, s.attempts)} />
              <Stat label="誤判別/拾えず" value={pct(s.wrong + s.lost, s.attempts)} />
              <Stat label="吸着正解" value={`${pct(s.snapOk, s.snapTotal)}`} />
            </div>
            <p className="mt-2 text-xs text-ink-3">
              手のひら・指の接触: 拒否して防いだもの {palm.rejectedTouches} 件 ／ 線として受理 {palm.acceptedTouches} 件
            </p>
            {attempts.length > 0 && (
              <div className="mt-2 max-h-28 overflow-y-auto rounded-lg bg-paper p-2 text-xs text-ink-2">
                {attempts.map((a, i) => (
                  <p key={i}>
                    {a.symbolOk ? '✓' : '✕'} {symbolLabel(a.intended)} →{' '}
                    {a.recognized ? symbolLabel(a.recognized) : '（拾えず）'}
                    {a.kind === 'candidate' ? '（候補タップ）' : ''}
                    {a.snapOk === false ? ' 吸着ずれ' : ''}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mb-4 rounded-card border border-gray-200 bg-white p-3 shadow-card">
          <p className="mb-1 text-sm font-bold text-ai">全車線の結果（コピーして報告に貼れます）</p>
          <textarea
            readOnly
            value={summaryText}
            rows={7}
            className="w-full rounded-xl border border-gray-200 bg-paper p-2 text-xs text-ink-2"
          />
        </div>

        <div className="mb-4">
          <PenInputLogPanel log={inputLog} />
        </div>

        <EnrollmentSection
          userId={userId}
          store={store}
          onStoreChange={setStore}
          policy={policy}
        />
      </div>
    </AppLayout>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-paper px-2 py-1.5 text-center">
      <p className="text-[10px] text-ink-3">{label}</p>
      <p className="font-extrabold text-ai">{value}</p>
    </div>
  )
}

/* ---------- お手本登録（本人の字を保存して判別に使う） ---------- */

/** 登録できる記号の一覧の正本は台帳（ledger.ts） */
const ENROLLABLE: SymbolId[] = ENROLLABLE_SYMBOLS

function EnrollmentSection({
  userId,
  store,
  onStoreChange,
  policy,
}: {
  userId: string | null | undefined
  store: UserTemplateStore
  onStoreChange: (s: UserTemplateStore) => void
  policy: InputPolicy
}) {
  const [symbol, setSymbol] = useState<SymbolId>('n')
  const strokesRef = useRef<PenStroke[]>([])
  const [resetToken, setResetToken] = useState(0)

  return (
    <div className="rounded-card border border-gray-200 bg-white p-3 shadow-card" {...{ [PEN_UI_ATTR]: '' }}>
      <p className="mb-1 text-sm font-bold text-ai">お手本登録（自分の字を判別に使う）</p>
      <p className="mb-2 text-xs text-ink-3">
        判別に迷いが多い記号・文字は、自分の字で1〜3回登録すると当たりやすくなります
        （括弧は同じ向きの4種をそろえて登録すると閉じ括弧の見分けに効きます）。
        登録した字は、この端末の中の「いまログインしている人」のぶんにだけ保存されます
        （同じ端末を別の人が使っても混ざりません）。
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value as SymbolId)}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
        >
          {ENROLLABLE.map((sym) => (
            <option key={sym} value={sym}>
              {symbolLabel(sym)}（登録 {store[sym]?.length ?? 0} 件）
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (strokesRef.current.length === 0) return
            onStoreChange(saveUserTemplate(userId, symbol, strokesRef.current))
            setResetToken((n) => n + 1)
          }}
          className="rounded-xl bg-sora px-3 py-2 text-sm font-bold text-white"
        >
          この字を登録
        </button>
        <button
          type="button"
          onClick={() => setResetToken((n) => n + 1)}
          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-ai"
        >
          書き直す
        </button>
        <button
          type="button"
          onClick={() => onStoreChange(clearUserTemplates(userId, symbol))}
          className="rounded-xl border border-again bg-white px-3 py-2 text-sm font-bold text-again"
        >
          この字の登録を消す
        </button>
      </div>
      {/* 書き込みキャンバスは初回登録フローと同じ共通部品（入力層の一本化） */}
      <EnrollCanvas
        policy={policy}
        resetToken={resetToken}
        height={140}
        onStrokesChange={(s) => {
          strokesRef.current = s
        }}
      />
    </div>
  )
}
