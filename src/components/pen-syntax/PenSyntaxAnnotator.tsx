'use client'

/**
 * ペンで書く構文分析の入力部品（実現可能性検証の試作）。
 *
 * 英文の上に透明なキャンバスを重ね、ペンで書いた線をその場で判別して
 * 単語位置に吸着させ、構文の練習の解答データ（SyntaxAnswer）に反映する。
 * - 判別に迷ったら線の近くに候補チップを出し、ワンタップで確定（構想 v1.1 論点3）
 * - それでも拾えないときは一覧から選ぶ（ボタン方式への逃げ道）
 * - 指・手のひらは線として拾わない（ペン専用。誤反応は数えて onPalm で報告）
 *
 * 共有部品 SyntaxAnnotator（タップ方式）には手を入れず、別部品として実装している。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  bracketDepths,
  isPunct,
  POS_LETTER_LEGEND,
  POS_LETTER_OPTIONS,
  posLetter,
  ROLE_OPTIONS,
  SPAN_TYPES,
  type Mark,
  type MarkResult,
  type StudentSpan,
  type SyntaxAnswer,
} from '@/lib/reading/syntax'
import type {
  Lane,
  PenPoint,
  PenStroke,
  SymbolCandidate,
  SymbolId,
  TokenBox,
} from '@/lib/pen-syntax/types'
import { applySymbol, emptyPenAnnotation, type PenAnnotation, type PenExtraMark } from '@/lib/pen-syntax/apply'
import { recognizeGroup } from '@/lib/pen-syntax/recognize'
import { evaluatePointer, initialPalmState, type InputPolicy, type PalmState } from '@/lib/pen-syntax/palm'
import { resolveLocalPoint } from '@/lib/pen-syntax/local-point'
import {
  captureScreenSnapshot,
  describeScreenShift,
  type PenInputLog,
  type ScreenSnapshot,
} from '@/lib/pen-syntax/input-log'
import { freezeScreenDuringStroke, usePenScreenGuard, type PenGuardEvent } from './usePenScreenGuard'
import { groupLines, laneOf, pickLine, shouldGroupStrokes, underlineSegments } from '@/lib/pen-syntax/snap'
import { pathLength, strokesBBox } from '@/lib/pen-syntax/geometry'
import type { UserTemplateStore } from '@/lib/pen-syntax/letters'

/** 計測ページ（pen-lab）が受け取る判別イベント */
export interface PenRecognitionEvent {
  /** auto=一発判別 / candidate=候補タップで確定 / fallback=一覧から選択 / failed=拾えず破棄 */
  kind: 'auto' | 'candidate' | 'fallback' | 'failed'
  symbol: SymbolId | null
  candidates: SymbolCandidate[]
  lane: Lane
  /** 吸着した単語の範囲（applied のときのみ） */
  target?: { from: number; to: number }
  applied: boolean
}

export const SYMBOL_LABELS: Record<string, string> = {
  'paren-open': '（',
  'paren-close': '）',
  'square-open': '[',
  'square-close': ']',
  'angle-open': '〈',
  'angle-close': '〉',
  'brace-open': '{',
  'brace-close': '}',
  hline: '下線',
  circle: '○囲み',
  wavy: '波線',
  question: '?',
  slash: '斜線',
  tick: '’（ダッシュ）',
  'null-sign': 'Ø',
  triangle: '▷',
}

export function symbolLabel(symbol: SymbolId): string {
  return SYMBOL_LABELS[symbol] ?? symbol
}

interface PendingGroup {
  strokes: PenStroke[]
}

interface ChipState {
  candidates: SymbolCandidate[]
  strokes: PenStroke[]
  boxes: TokenBox[]
  lane: Lane
  x: number
  y: number
}

interface PenSyntaxAnnotatorProps {
  tokens: string[]
  answer: SyntaxAnswer
  onChange: (next: SyntaxAnswer) => void
  posMarks?: Record<number, MarkResult>
  roleMarks?: Record<number, MarkResult>
  spanMarks?: Record<number, Mark>
  disabled?: boolean
  policy?: InputPolicy
  templateStore?: UserTemplateStore | null
  onEvent?: (ev: PenRecognitionEvent) => void
  onPalm?: (state: PalmState) => void
  /** 診断用「入力の記録」。渡すと接触の受理/拒否と画面の移動を時系列で記録する */
  inputLog?: PenInputLog | null
}

const GROUP_WAIT_MS = 750

/**
 * 入れ子カッコの深さ別の色（Okabe-Ito の色覚多様性対応パレットから4色）。
 * 深さ 0=青 / 1=朱 / 2=緑 / 3=赤紫 で循環する。
 */
const BRACKET_COLORS = ['#0072B2', '#D55E00', '#009E73', '#CC79A7']

export function bracketColor(depth: number): string {
  return BRACKET_COLORS[depth % BRACKET_COLORS.length]
}

/** カッコの文字を本文の行の高さの箱に入れて上下中央に置く（字がカッコの中央に来る） */
const BRACKET_CLASS = 'mb-6 flex h-9 items-center self-end text-2xl font-bold'

export function PenSyntaxAnnotator({
  tokens,
  answer,
  onChange,
  posMarks,
  roleMarks,
  spanMarks,
  disabled,
  policy = 'pen-only',
  templateStore = null,
  onEvent,
  onPalm,
  inputLog = null,
}: PenSyntaxAnnotatorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wordRefs = useRef<Array<HTMLElement | null>>([])
  const [boxes, setBoxes] = useState<TokenBox[]>([])

  // 解答＋ペン特有の状態（開きかけの括弧・採点対象外マーク）
  const annotationRef = useRef<PenAnnotation>(emptyPenAnnotation(answer))
  const [, forceRender] = useState(0)
  const lastEmittedAnswer = useRef<SyntaxAnswer>(answer)
  const historyRef = useRef<PenAnnotation[]>([])

  const palmRef = useRef<PalmState>(initialPalmState())
  // 「手のひらOK」バッジの表示切替用（ガード自体は常時有効で、ペンの接近・接触中だけ指を止める）
  const [penSeen, setPenSeen] = useState(false)
  const logRef = useRef<PenInputLog | null>(inputLog)
  logRef.current = inputLog
  const onGuard = useCallback((ev: PenGuardEvent) => {
    logRef.current?.push({
      kind: 'guard',
      at: performance.now(),
      event: ev.event,
      action: ev.action,
      reason: ev.reason,
      x: ev.x,
      y: ev.y,
    })
  }, [])
  // ペンの接近・接触中と離した直後だけ指を止める（手のひら対策と描画エリア外の
  // 指スクロールの両立）。ペンを見ていない間は何も止めないので常時有効でよい
  usePenScreenGuard(policy === 'pen-only' && !disabled, onGuard)
  const drawingRef = useRef<{ pointerId: number; stroke: PenPoint[] } | null>(null)
  // 描画中の画面固定の解除関数と、画面移動の検出用の基準
  const unfreezeRef = useRef<(() => void) | null>(null)
  const strokeScreenRef = useRef<ScreenSnapshot | null>(null)
  const lastMoveLogRef = useRef(0)
  // ペンでのタップ（onPointerUp）とその後のクリックの二重発火を防ぐ時刻
  const penTapAtRef = useRef(0)
  const groupRef = useRef<PendingGroup | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [chips, setChips] = useState<ChipState | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ kind: 'pos' | 'role'; index: number; viaFallback?: boolean } | null>(null)

  // 外から answer が差し替えられたら（リセット・問題切替・タップ方式での編集）内部状態を追従させる
  useEffect(() => {
    if (answer !== lastEmittedAnswer.current) {
      annotationRef.current = { ...annotationRef.current, answer, pendingOpens: [] }
      lastEmittedAnswer.current = answer
      historyRef.current = []
      setChips(null)
      forceRender((n) => n + 1)
    }
  }, [answer])

  const emitAnnotation = useCallback(
    (next: PenAnnotation) => {
      annotationRef.current = next
      lastEmittedAnswer.current = next.answer
      onChange(next.answer)
      forceRender((n) => n + 1)
    },
    [onChange],
  )

  const showToast = useCallback((text: string) => {
    setToast(text)
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2600)
  }, [])

  /* ---------- 単語の箱の採寸 ---------- */
  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const cRect = container.getBoundingClientRect()
    const next: TokenBox[] = []
    wordRefs.current.forEach((el, i) => {
      if (!el) return
      if (isPunct(tokens[i])) return // 句読点には吸着させない
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
      if (canvas.width !== Math.round(cRect.width * dpr) || canvas.height !== Math.round(cRect.height * dpr)) {
        canvas.width = Math.round(cRect.width * dpr)
        canvas.height = Math.round(cRect.height * dpr)
      }
    }
  }, [tokens])

  useEffect(() => {
    measure()
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(container)
    return () => ro.disconnect()
    // tokens が変わったら描画後に測り直す
  }, [measure, tokens])

  // カッコ記号の挿入・削除や採点マークの表示で単語が左右へ押されたときも測り直す
  // （文とサイズの変化だけ見ていると、下線オーバーレイが古い箱の位置に引かれてずれる）
  const ann = annotationRef.current
  useEffect(() => {
    measure()
  }, [measure, ann.answer, ann.pendingOpens, ann.extras, posMarks, roleMarks, spanMarks])

  /* ---------- インクの描画 ---------- */
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
    for (const s of groupRef.current?.strokes ?? []) paint(s)
    if (chips) {
      ctx.strokeStyle = 'rgba(43, 108, 176, 0.45)'
      for (const s of chips.strokes) paint(s)
    }
    if (drawingRef.current) paint(drawingRef.current.stroke)
  }, [chips])

  useEffect(() => {
    redraw()
  }, [redraw])

  /* ---------- 判別と反映 ---------- */
  const applyAndReport = useCallback(
    (
      symbol: SymbolId,
      strokes: PenStroke[],
      lineBoxes: TokenBox[],
      lane: Lane,
      kind: PenRecognitionEvent['kind'],
      candidates: SymbolCandidate[],
    ) => {
      historyRef.current = [...historyRef.current.slice(-29), annotationRef.current]
      const out = applySymbol(annotationRef.current, symbol, strokes, lineBoxes)
      if (out.message) showToast(out.message)
      if (out.applied) emitAnnotation(out.next)
      else historyRef.current.pop()
      onEvent?.({ kind, symbol, candidates, lane, target: out.target, applied: out.applied })
    },
    [emitAnnotation, onEvent, showToast],
  )

  const finalizeGroup = useCallback(() => {
    const group = groupRef.current
    groupRef.current = null
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!group || group.strokes.length === 0) return
    const rec = recognizeGroup(group.strokes, boxes, templateStore)
    const { result } = rec
    if (result.best && !result.ambiguous) {
      applyAndReport(result.best.symbol, group.strokes, rec.boxes, rec.lane, 'auto', result.candidates)
      redraw()
      return
    }
    // 迷った・拾えなかった: 候補チップを出してワンタップ確定
    const b = strokesBBox(group.strokes)
    setChips({
      candidates: result.candidates,
      strokes: group.strokes,
      boxes: rec.boxes,
      lane: rec.lane,
      x: b.cx,
      y: b.top,
    })
  }, [applyAndReport, boxes, redraw, templateStore])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      unfreezeRef.current?.()
    }
  }, [])

  /* ---------- ポインタ処理 ---------- */
  const toLocal = (e: React.PointerEvent): PenPoint => {
    const rect = containerRef.current!.getBoundingClientRect()
    const ne = e.nativeEvent as PointerEvent
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    // 毎イベントで枠の位置を測り直し（スクロール追従）、ピンチズーム中は
    // ブラウザ計算の要素相対座標に切り替える（座標系の食い違い対策）
    const p = resolveLocalPoint({
      clientX: e.clientX,
      clientY: e.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      offsetX: typeof ne.offsetX === 'number' ? ne.offsetX : undefined,
      offsetY: typeof ne.offsetY === 'number' ? ne.offsetY : undefined,
      vvScale: vv ? vv.scale : null,
      vvOffsetLeft: vv ? vv.offsetLeft : null,
      vvOffsetTop: vv ? vv.offsetTop : null,
    })
    return { x: p.x, y: p.y, t: e.timeStamp }
  }

  const logPointer = (
    e: React.PointerEvent,
    phase: 'down' | 'move' | 'up' | 'cancel',
    local: PenPoint,
    accepted?: boolean,
    reason?: string,
  ) => {
    const lg = logRef.current
    if (!lg) return
    const ne = e.nativeEvent as PointerEvent
    lg.push({
      kind: 'pointer',
      at: e.timeStamp,
      phase,
      pointerType: e.pointerType,
      pointerId: e.pointerId,
      client: { x: e.clientX, y: e.clientY },
      local: { x: local.x, y: local.y },
      offset: typeof ne.offsetX === 'number' ? { x: ne.offsetX, y: ne.offsetY } : null,
      contact: { w: e.width || 0, h: e.height || 0 },
      accepted,
      reason,
      screen: captureScreenSnapshot(containerRef.current),
    })
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || chips) return
    const decision = evaluatePointer(
      { pointerType: e.pointerType, width: e.width, height: e.height },
      policy,
      palmRef.current,
    )
    palmRef.current = decision.next
    if (e.pointerType === 'pen' && !penSeen) setPenSeen(true)
    logPointer(e, 'down', toLocal(e), decision.accept, decision.reason)
    if (!decision.accept) {
      // 拒否した接触はここで既定動作ごと止める（長押しの選択・後続のクリック化を防ぐ）
      e.preventDefault()
      if (e.pointerType === 'touch') onPalm?.(decision.next)
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
    // 線を描いている間は画面全体のスクロールを止める（狙いがずれる不具合対策）
    unfreezeRef.current?.()
    unfreezeRef.current = freezeScreenDuringStroke()
    strokeScreenRef.current = logRef.current ? captureScreenSnapshot(containerRef.current) : null
    lastMoveLogRef.current = e.timeStamp
    drawingRef.current = { pointerId: e.pointerId, stroke: [toLocal(e)] }
    redraw()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawingRef.current
    if (!d || d.pointerId !== e.pointerId) return
    d.stroke.push(toLocal(e))
    // 描画中に画面が動いたら記録に残す（線ずれの原因特定用）
    const lg = logRef.current
    if (lg) {
      const snap = captureScreenSnapshot(containerRef.current)
      const base = strokeScreenRef.current
      const shift = base ? describeScreenShift(base, snap) : null
      if (shift) {
        lg.push({ kind: 'shift', at: e.timeStamp, during: 'stroke', detail: shift })
        strokeScreenRef.current = snap
      }
      if (shift || e.timeStamp - lastMoveLogRef.current > 150) {
        lastMoveLogRef.current = e.timeStamp
        logPointer(e, 'move', d.stroke[d.stroke.length - 1])
      }
    }
    redraw()
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>, phase: 'up' | 'cancel' = 'up') => {
    const d = drawingRef.current
    if (!d || d.pointerId !== e.pointerId) return
    unfreezeRef.current?.()
    unfreezeRef.current = null
    strokeScreenRef.current = null
    drawingRef.current = null
    const stroke = d.stroke
    logPointer(e, phase, stroke[stroke.length - 1] ?? toLocal(e))

    // ごく小さな接触は「タップ」として扱い、品詞・働きのマスを開く
    // （キャンバスが全面を覆うため、マスのタップはここで拾う。
    //   書きかけの記号がある間は ? の点・ダッシュ等の2画目として線に数える）
    const duration = (stroke[stroke.length - 1].t ?? 0) - (stroke[0].t ?? 0)
    if (!groupRef.current && pathLength(stroke) < 7 && duration < 400) {
      const p = stroke[0]
      const line = pickLine([stroke], groupLines(boxes))
      if (line) {
        const lane = laneOf([stroke], line.boxes)
        let nearest: TokenBox | null = null
        for (const t of line.boxes) {
          const cx = (t.left + t.right) / 2
          if (!nearest || Math.abs(cx - p.x) < Math.abs((nearest.left + nearest.right) / 2 - p.x)) {
            nearest = t
          }
        }
        if (nearest && lane === 'above') setPicker({ kind: 'pos', index: nearest.index })
        else if (nearest && lane === 'below' && !isPunct(tokens[nearest.index])) {
          setPicker({ kind: 'role', index: nearest.index })
        }
      }
      redraw()
      return
    }

    if (stroke.length < 2) {
      // 触れただけの点も1画として扱う（? の点・ダッシュなど）
      stroke.push({ ...stroke[0], x: stroke[0].x + 0.5 })
    }
    const group = groupRef.current
    if (group && shouldGroupStrokes(group.strokes, stroke)) {
      group.strokes.push(stroke)
    } else {
      if (group) finalizeGroup()
      groupRef.current = { strokes: [stroke] }
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(finalizeGroup, GROUP_WAIT_MS)
    redraw()
  }

  /* ---------- チップ・一覧・取り消し ---------- */

  /**
   * ペンのタップでボタンを確実に反応させる保険（2026-08-26 実機不具合対策）。
   * 環境によってはペンのタップがクリックにならないことがあるため、
   * ペンのポインタイベントで直接発火させる。クリックも届く環境での
   * 二重発火は直前のペン発火時刻で防ぐ。押されないと先へ進めない
   * ボタン（候補チップ・一覧）にだけ付ける。
   */
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

  const resolveChip = (symbol: SymbolId | null) => {
    if (!chips) return
    if (symbol) {
      applyAndReport(symbol, chips.strokes, chips.boxes, chips.lane, 'candidate', chips.candidates)
    } else {
      onEvent?.({ kind: 'failed', symbol: null, candidates: chips.candidates, lane: chips.lane, applied: false })
    }
    setChips(null)
  }

  const openFallback = () => {
    if (!chips) return
    const lane = chips.lane
    const b = strokesBBox(chips.strokes)
    // 一番近い単語の一覧（品詞 or 働き）を開く
    let nearest = 0
    let bestD = Infinity
    for (const t of chips.boxes) {
      const cx = (t.left + t.right) / 2
      const d = Math.abs(cx - b.cx)
      if (d < bestD) {
        bestD = d
        nearest = t.index
      }
    }
    onEvent?.({ kind: 'fallback', symbol: null, candidates: chips.candidates, lane, applied: false })
    setChips(null)
    setPicker({ kind: lane === 'above' ? 'pos' : 'role', index: nearest, viaFallback: true })
  }

  const undo = () => {
    const prev = historyRef.current.pop()
    if (!prev) {
      showToast('戻せる操作がありません')
      return
    }
    emitAnnotation(prev)
  }

  const removeSpan = (idx: number) => {
    if (disabled) return
    const a = annotationRef.current
    emitAnnotation({ ...a, answer: { ...a.answer, spans: a.answer.spans.filter((_, i) => i !== idx) } })
  }

  const removeExtra = (idx: number) => {
    const a = annotationRef.current
    emitAnnotation({ ...a, extras: a.extras.filter((_, i) => i !== idx) })
  }

  const removePendingOpen = (idx: number) => {
    const a = annotationRef.current
    emitAnnotation({ ...a, pendingOpens: a.pendingOpens.filter((_, i) => i !== idx) })
  }

  const setSlot = (kind: 'pos' | 'role', index: number, value: string | null) => {
    const a = annotationRef.current
    const next = { ...a.answer, [kind]: [...a.answer[kind]] } as SyntaxAnswer
    next[kind][index] = value
    emitAnnotation({ ...a, answer: next })
  }

  /* ---------- 表示の下ごしらえ ---------- */
  const brackets = useMemo(() => {
    // 入れ子の対応がひと目で分かるよう、深さごとに色を変える（開きと閉じが同じ色）
    const depths = bracketDepths(ann.answer.spans)
    const opens: Record<number, Array<{ s: StudentSpan; depth: number }>> = {}
    const closes: Record<number, Array<{ s: StudentSpan; depth: number }>> = {}
    ann.answer.spans.forEach((s, i) => {
      if (s.type === 'ul') return
      ;(opens[s.from] = opens[s.from] || []).push({ s, depth: depths[i] })
      ;(closes[s.to] = closes[s.to] || []).push({ s, depth: depths[i] })
    })
    return { opens, closes }
  }, [ann.answer.spans])

  const extraAt = (i: number): PenExtraMark[] => ann.extras.filter((x) => i >= x.from && i <= x.to)

  const extraLabel = (x: PenExtraMark) =>
    x.kind === 'circle'
      ? '○囲み'
      : x.kind === 'wavy'
        ? '波線'
        : x.kind === 'question'
          ? '?'
          : x.kind === 'null-sign'
            ? 'Ø'
            : x.kind === 'dash'
              ? 'ダッシュ（上）'
              : x.kind === 'tick'
                ? '’'
                : '斜線'

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-sora-soft px-3 py-1 text-xs font-bold text-ai">
          ✍️ ペンで直接書き込めます（括弧・下線・○・品詞・働き）
        </span>
        <button
          type="button"
          onClick={undo}
          className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-bold text-ai"
        >
          ↩ 一手戻す
        </button>
        {policy === 'pen-only' && (
          // ペン初回接触の瞬間に出現させると、書いている最中に画面レイアウトが
          // ずれて線の狙いが狂う（2026-08-26 実機不具合）。場所は常に確保し、
          // 表示だけを切り替える
          <span
            className={`rounded-full bg-paper px-3 py-1 text-[10px] font-bold text-ink-3 ${
              penSeen ? '' : 'invisible'
            }`}
            aria-hidden={!penSeen}
          >
            🖐 手のひらを載せてもOK（ペンを離せば指でスクロールできます）
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative mb-3 select-none rounded-card border border-gray-200 bg-white p-3 pb-6 pt-5 shadow-card [-webkit-touch-callout:none]"
      >
        <div className="flex flex-wrap items-end gap-x-1 gap-y-7">
          {tokens.map((tok, i) => (
            <div key={i} className="flex items-end">
              {(brackets.opens[i] || [])
                .slice()
                .sort((a, b) => b.s.to - b.s.from - (a.s.to - a.s.from))
                .map(({ s, depth }, n) => (
                  <span key={`o${n}`} className={BRACKET_CLASS} style={{ color: bracketColor(depth) }}>
                    {SPAN_TYPES[s.type].open}
                  </span>
                ))}
              {ann.pendingOpens
                .filter((p) => p.index === i)
                .map((p, n) => (
                  <span key={`p${n}`} className={`${BRACKET_CLASS} text-gray-300`}>
                    {SPAN_TYPES[p.type].open}
                  </span>
                ))}

              <div className="flex flex-col items-center">
                <Cell
                  value={ann.answer.pos[i] == null ? null : posLetter(ann.answer.pos[i]!)}
                  mark={posMarks?.[i]?.mark}
                  onClick={() => !disabled && setPicker({ kind: 'pos', index: i })}
                />
                <span
                  ref={(el) => {
                    wordRefs.current[i] = el
                  }}
                  className={[
                    // 下線そのものは単語間で途切れない連結線分として別レイヤーに描く
                    // （下の「下線オーバーレイ」）。ここでは線ぶんの余白(3px)だけ確保する
                    'whitespace-nowrap border-b-[3px] border-transparent px-1 py-0.5 font-serif text-lg',
                    extraAt(i).some((x) => x.kind === 'wavy') ? '[text-decoration:underline_wavy_#c53030]' : '',
                    extraAt(i).some((x) => x.kind === 'circle') ? 'rounded-full ring-2 ring-nodo' : '',
                  ].join(' ')}
                >
                  {tok}
                  {extraAt(i)
                    .filter((x) => x.from === i && ['question', 'null-sign', 'tick'].includes(x.kind))
                    .map((x, n) => (
                      <sup key={n} className="ml-0.5 text-xs font-bold text-nodo-dark">
                        {x.kind === 'question' ? '?' : x.kind === 'null-sign' ? 'Ø' : '’'}
                      </sup>
                    ))}
                </span>
                {isPunct(tok) ? (
                  <span className="h-6" />
                ) : (
                  <Cell
                    value={ann.answer.role[i]}
                    mark={roleMarks?.[i]?.mark}
                    onClick={() => !disabled && setPicker({ kind: 'role', index: i })}
                  />
                )}
                {(posMarks || roleMarks) &&
                  (posMarks?.[i]?.mark === 'bad' || roleMarks?.[i]?.mark === 'bad') && (
                    <span className="mt-0.5 whitespace-nowrap text-[10px] text-again">
                      →{' '}
                      {[
                        posMarks?.[i]?.mark === 'bad' ? `品詞:${posMarks[i]?.correct}` : null,
                        roleMarks?.[i]?.mark === 'bad' ? `働き:${roleMarks[i]?.correct}` : null,
                      ]
                        .filter(Boolean)
                        .join(' / ')}
                    </span>
                  )}
              </div>

              {(brackets.closes[i] || [])
                .slice()
                .sort((a, b) => a.s.to - a.s.from - (b.s.to - b.s.from))
                .map(({ s, depth }, n) => (
                  <span key={`c${n}`} className={BRACKET_CLASS} style={{ color: bracketColor(depth) }}>
                    {SPAN_TYPES[s.type].close}
                  </span>
                ))}
            </div>
          ))}
        </div>

        {/* 下線オーバーレイ: 単語間で途切れない連結線（実測した単語の箱から行ごとに1本引く） */}
        {ann.answer.spans.map((s, idx) =>
          s.type === 'ul'
            ? underlineSegments(s, boxes, -3).map((seg, j) => (
                <div
                  key={`ul${idx}-${j}`}
                  className="pointer-events-none absolute bg-ink"
                  style={{ left: seg.left, top: seg.y, width: seg.right - seg.left, height: 1.5 }}
                />
              ))
            : null,
        )}

        {/* ペン入力のキャンバス（指はスクロールもさせない＝手のひら対策。誤反応は数える） */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-10 h-full w-full"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => onPointerUp(e, 'cancel')}
        />

        {/* 迷ったときの候補チップ */}
        {chips && (
          <div
            className="absolute z-20 -translate-x-1/2 rounded-xl border border-sora bg-white p-2 shadow-card"
            style={{ left: Math.max(80, chips.x), top: Math.max(0, chips.y - 58) }}
          >
            <p className="mb-1 text-[10px] font-bold text-ink-3">どの記号ですか？</p>
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
              {chips.lane !== 'band' && (
                <button
                  type="button"
                  {...penTap(openFallback)}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-bold text-ink-2"
                >
                  一覧から選ぶ
                </button>
              )}
              <button
                type="button"
                {...penTap(() => resolveChip(null))}
                aria-label="この線を破棄"
                className="rounded-lg px-2 py-1.5 text-xs font-bold text-again"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div className="absolute bottom-1 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-xs text-white opacity-90">
            {toast}
          </div>
        )}
      </div>

      {/* まとまり・マークの一覧（タップで消せる） */}
      {(ann.answer.spans.length > 0 || ann.extras.length > 0 || ann.pendingOpens.length > 0) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {ann.answer.spans.map((s, idx) => {
            const mark = spanMarks?.[idx]
            const tone =
              mark === 'ok'
                ? 'bg-good-bg border-good text-good'
                : mark === 'alt'
                  ? 'bg-hard-bg border-hard text-hard'
                  : mark === 'bad'
                    ? 'bg-again-bg border-again text-again'
                    : 'bg-white border-gray-300 text-ink-2'
            return (
              <span
                key={`s${idx}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${tone}`}
              >
                <b>{SPAN_TYPES[s.type].short}</b>
                {tokens.slice(s.from, s.to + 1).join(' ')}
                <button type="button" onClick={() => removeSpan(idx)} aria-label="このまとまりを消す">
                  ×
                </button>
              </span>
            )
          })}
          {ann.pendingOpens.map((p, idx) => (
            <span
              key={`po${idx}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-400 bg-white px-2.5 py-1 text-xs text-ink-3"
            >
              {SPAN_TYPES[p.type].open} {tokens[p.index]} …（閉じ待ち）
              <button type="button" onClick={() => removePendingOpen(idx)} aria-label="書きかけを消す">
                ×
              </button>
            </span>
          ))}
          {ann.extras.map((x, idx) => (
            <span
              key={`e${idx}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-nodo bg-white px-2.5 py-1 text-xs text-nodo-dark"
            >
              {extraLabel(x)} {tokens.slice(x.from, x.to + 1).join(' ')}
              <button type="button" onClick={() => removeExtra(idx)} aria-label="このマークを消す">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 品詞・働きの一覧（タップ編集＝ボタン方式への逃げ道） */}
      {picker && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center"
          {...penTap(() => setPicker(null))}
        >
          <div
            className="w-full rounded-t-card bg-white p-4 shadow-card sm:max-w-sm sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-sm font-bold text-ai">
              「{tokens[picker.index]}」の{picker.kind === 'pos' ? '品詞' : '働き'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(picker.kind === 'pos' ? POS_LETTER_OPTIONS : ROLE_OPTIONS).map((o) => (
                <button
                  key={o}
                  type="button"
                  {...penTap(() => {
                    setSlot(picker.kind, picker.index, o)
                    setPicker(null)
                  })}
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-ai"
                >
                  {o}
                  {picker.kind === 'pos' && (
                    <span className="ml-1 text-[10px] font-normal text-ink-3">
                      {POS_LETTER_LEGEND[o]}
                    </span>
                  )}
                </button>
              ))}
              <button
                type="button"
                {...penTap(() => {
                  setSlot(picker.kind, picker.index, null)
                  setPicker(null)
                })}
                className="rounded-xl border border-again bg-white px-3 py-2 text-sm font-bold text-again"
              >
                消す
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Cell({
  value,
  mark,
  onClick,
}: {
  value: string | null
  mark?: Mark
  onClick: () => void
}) {
  const tone =
    mark === 'ok'
      ? 'bg-good-bg text-good font-bold'
      : mark === 'alt'
        ? 'bg-hard-bg text-hard font-bold'
        : mark === 'bad'
          ? 'bg-again-bg text-again font-bold line-through'
          : value
            ? 'text-sora-dark'
            : 'text-gray-300'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-6 min-w-[2.2rem] rounded px-1 text-xs ${tone}`}
    >
      {value || '＋'}
    </button>
  )
}
