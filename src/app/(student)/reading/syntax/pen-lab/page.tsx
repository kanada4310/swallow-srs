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
import { recognizeGroup } from '@/lib/pen-syntax/recognize'
import { snapTargetFor } from '@/lib/pen-syntax/apply'
import { shouldGroupStrokes } from '@/lib/pen-syntax/snap'
import {
  evaluatePointer,
  initialPalmState,
  type InputPolicy,
  type PalmState,
} from '@/lib/pen-syntax/palm'
import type { UserTemplateStore } from '@/lib/pen-syntax/letters'
import { usePenScreenGuard } from '@/components/pen-syntax/usePenScreenGuard'
import {
  clearUserTemplates,
  loadUserTemplates,
  saveUserTemplate,
} from '@/lib/pen-syntax/user-templates'

const TOKENS = ['The', 'girl', 'standing', 'by', 'the', 'door', 'is', 'my', 'sister', '.']

type ModeKey = 'a' | 'b' | 'c-pos' | 'c-role' | 'free'

const MODES: Array<{ key: ModeKey; label: string }> = [
  { key: 'a', label: '群A: 括弧4種＋下線' },
  { key: 'b', label: '群B: ○・波線・?・ダッシュ・Ø' },
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
    const symbol = randOf(['circle', 'wavy', 'question', 'tick', 'null-sign'] as SymbolId[])
    const where =
      symbol === 'circle'
        ? 'を丸で囲む'
        : symbol === 'wavy'
          ? 'の下に波線を書く'
          : symbol === 'question'
            ? 'の下に ? を書く'
            : symbol === 'tick'
              ? 'の下に ’（短い点画）を書く'
              : 'の下に Ø（円＋斜線）を書く'
    return { symbol, target: { from: i, to: i }, description: `${word(i)}${where}` }
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

const GROUP_WAIT_MS = 750

export default function PenLabPage() {
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
  // ペンを一度でも見たら、画面全体で指・手のひらを無効化する（キャンバスの外の誤操作対策）
  usePenScreenGuard(palm.penSeen && policy === 'pen-only')
  const [store, setStore] = useState<UserTemplateStore>({})
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [chips, setChips] = useState<{
    candidates: Array<{ symbol: SymbolId; score: number }>
    strokes: PenStroke[]
    boxes: TokenBox[]
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    setStore(loadUserTemplates())
  }, [])

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wordRefs = useRef<Array<HTMLElement | null>>([])
  const [boxes, setBoxes] = useState<TokenBox[]>([])
  const drawingRef = useRef<{ pointerId: number; stroke: PenPoint[] } | null>(null)
  const groupRef = useRef<PenStroke[] | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const palmRef = useRef<PalmState>(initialPalmState())

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const cRect = container.getBoundingClientRect()
    const next: TokenBox[] = []
    wordRefs.current.forEach((el, i) => {
      if (!el) return
      if (isPunct(TOKENS[i])) return // 句読点には吸着させない
      const r = el.getBoundingClientRect()
      next.push({
        index: i,
        left: r.left - cRect.left,
        right: r.right - cRect.left,
        top: r.top - cRect.top,
        bottom: r.bottom - cRect.top,
      })
    })
    setBoxes(next)
    const canvas = canvasRef.current
    if (canvas) {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(cRect.width * dpr)
      canvas.height = Math.round(cRect.height * dpr)
    }
  }, [])

  useEffect(() => {
    measure()
    if (typeof ResizeObserver === 'undefined' || !containerRef.current) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [measure])

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
    for (const s of groupRef.current ?? []) paint(s)
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

  const finalizeGroup = useCallback(() => {
    const strokes = groupRef.current
    groupRef.current = null
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!strokes || strokes.length === 0) return
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
    // 迷ったとき: 候補チップから「書いたつもりの記号」をタップしてもらう
    const xs = strokes.flat()
    const minX = Math.min(...xs.map((p) => p.x))
    const maxX = Math.max(...xs.map((p) => p.x))
    const minY = Math.min(...xs.map((p) => p.y))
    setChips({
      candidates: rec.result.candidates,
      strokes,
      boxes: rec.boxes,
      x: (minX + maxX) / 2,
      y: minY,
    })
  }, [boxes, mode, record, redraw, store, task])

  const resolveChip = (symbol: SymbolId | null) => {
    if (!chips) return
    if (mode !== 'free' && task) {
      if (symbol) record(task.symbol, symbol, 'candidate', chips.strokes, chips.boxes, task.target)
      else record(task.symbol, null, 'failed', chips.strokes, chips.boxes, task.target)
      setTask(makeTask(mode))
    }
    setChips(null)
  }

  const toLocal = (e: React.PointerEvent): PenPoint => {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, t: e.timeStamp }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (chips) return
    const decision = evaluatePointer(
      { pointerType: e.pointerType, width: e.width, height: e.height },
      policy,
      palmRef.current,
    )
    palmRef.current = decision.next
    setPalm(decision.next)
    if (!decision.accept) {
      // 拒否した接触は既定動作ごと止める（長押しの選択・後続のクリック化を防ぐ）
      e.preventDefault()
      return
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // 一部環境（合成イベント等）で失敗しても描画は続けられる
    }
    drawingRef.current = { pointerId: e.pointerId, stroke: [toLocal(e)] }
    redraw()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawingRef.current
    if (!d || d.pointerId !== e.pointerId) return
    d.stroke.push(toLocal(e))
    redraw()
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawingRef.current
    if (!d || d.pointerId !== e.pointerId) return
    drawingRef.current = null
    const stroke = d.stroke
    if (stroke.length < 2) stroke.push({ ...stroke[0], x: stroke[0].x + 0.5 })
    const group = groupRef.current
    if (group && shouldGroupStrokes(group, stroke)) group.push(stroke)
    else {
      if (group) finalizeGroup()
      groupRef.current = [stroke]
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(finalizeGroup, GROUP_WAIT_MS)
    redraw()
  }

  const s = stats[mode] ?? emptyStats()
  const pct = (n: number, dd: number) => (dd === 0 ? '-' : `${((n / dd) * 100).toFixed(1)}%`)

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
              </span>
            ))}
          </div>
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-10 h-full w-full"
            style={{ touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {chips && (
            <div
              className="absolute z-20 -translate-x-1/2 rounded-xl border border-sora bg-white p-2 shadow-card"
              style={{ left: Math.max(90, chips.x), top: Math.max(0, chips.y - 58) }}
            >
              <p className="mb-1 text-[10px] font-bold text-ink-3">どの記号を書きましたか？</p>
              <div className="flex items-center gap-1.5">
                {chips.candidates.slice(0, 3).map((c) => (
                  <button
                    key={c.symbol}
                    type="button"
                    onClick={() => resolveChip(c.symbol)}
                    className="rounded-lg bg-sora-soft px-2.5 py-1.5 text-sm font-bold text-ai"
                  >
                    {symbolLabel(c.symbol)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => resolveChip(null)}
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

        <EnrollmentSection store={store} onStoreChange={setStore} policy={policy} />
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

const ENROLLABLE: SymbolId[] = [...POS_LETTERS, ...ROLE_LETTERS]

function EnrollmentSection({
  store,
  onStoreChange,
  policy,
}: {
  store: UserTemplateStore
  onStoreChange: (s: UserTemplateStore) => void
  policy: InputPolicy
}) {
  const [symbol, setSymbol] = useState<SymbolId>('n')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<PenStroke[]>([])
  const drawingRef = useRef<{ pointerId: number; stroke: PenPoint[] } | null>(null)
  // お手本登録のキャンバスも判別キャンバスと同じポインタ判定を通す（手のひらを線にしない）
  const palmRef = useRef<PalmState>(initialPalmState())

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1C2B4B'
    const paint = (stroke: PenPoint[]) => {
      if (stroke.length < 2) return
      ctx.beginPath()
      ctx.moveTo(stroke[0].x, stroke[0].y)
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y)
      ctx.stroke()
    }
    for (const s of strokesRef.current) paint(s)
    if (drawingRef.current) paint(drawingRef.current.stroke)
  }, [])

  const toLocal = (e: React.PointerEvent<HTMLCanvasElement>): PenPoint => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, t: e.timeStamp }
  }

  return (
    <div className="rounded-card border border-gray-200 bg-white p-3 shadow-card">
      <p className="mb-1 text-sm font-bold text-ai">お手本登録（自分の字を判別に使う）</p>
      <p className="mb-2 text-xs text-ink-3">
        文字の判別に迷いが多いときは、その文字を自分の字で1〜3回登録すると当たりやすくなります。
        登録した字はこの端末の中だけに保存されます。
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value as SymbolId)}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
        >
          {ENROLLABLE.map((sym) => (
            <option key={sym} value={sym}>
              {sym}（登録 {store[sym]?.length ?? 0} 件）
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (strokesRef.current.length === 0) return
            onStoreChange(saveUserTemplate(symbol, strokesRef.current))
            strokesRef.current = []
            redraw()
          }}
          className="rounded-xl bg-sora px-3 py-2 text-sm font-bold text-white"
        >
          この字を登録
        </button>
        <button
          type="button"
          onClick={() => {
            strokesRef.current = []
            redraw()
          }}
          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-ai"
        >
          書き直す
        </button>
        <button
          type="button"
          onClick={() => onStoreChange(clearUserTemplates(symbol))}
          className="rounded-xl border border-again bg-white px-3 py-2 text-sm font-bold text-again"
        >
          この字の登録を消す
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={280}
        height={140}
        className="rounded-xl border border-dashed border-gray-300 bg-paper"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          const decision = evaluatePointer(
            { pointerType: e.pointerType, width: e.width, height: e.height },
            policy,
            palmRef.current,
          )
          palmRef.current = decision.next
          if (!decision.accept) {
            e.preventDefault()
            return
          }
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // 失敗しても書ける
          }
          drawingRef.current = { pointerId: e.pointerId, stroke: [toLocal(e)] }
          redraw()
        }}
        onPointerMove={(e) => {
          const d = drawingRef.current
          if (!d || d.pointerId !== e.pointerId) return
          d.stroke.push(toLocal(e))
          redraw()
        }}
        onPointerUp={(e) => {
          const d = drawingRef.current
          if (!d || d.pointerId !== e.pointerId) return
          drawingRef.current = null
          if (d.stroke.length >= 2) strokesRef.current.push(d.stroke)
          redraw()
        }}
      />
    </div>
  )
}
