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
  ROLE_LETTER_OPTIONS,
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
import {
  applySymbol,
  emptyPenAnnotation,
  roleCellParts,
  type PenAnnotation,
  type PenExtraMark,
} from '@/lib/pen-syntax/apply'
import { orderKeyFor, strokeStartTime, type OrderEvent } from '@/lib/pen-syntax/order'
import { dashesForDepth, depthOfToken } from '@/lib/pen-syntax/dash-notation'
import { deprecatedGuidance, symbolLabel } from '@/lib/pen-syntax/ledger'
import { recognizeGroup } from '@/lib/pen-syntax/recognize'
import type { InputPolicy, PalmState } from '@/lib/pen-syntax/palm'
import type { PenInputLog } from '@/lib/pen-syntax/input-log'
import { usePenZoneGuard, type PenGuardEvent } from './usePenZoneGuard'
import { PEN_UI_ATTR, PEN_WRITE_ZONE_ATTR } from '@/lib/pen-syntax/zone-guard'
import { useChipPlacement, type ChipAnchor } from './useChipPlacement'
import { useStrokeCanvas, type DrawingStroke } from './useStrokeCanvas'
import { useStrokeGrouping, type StrokeGrouping } from './useStrokeGrouping'
import { BASELINE_PROBE_ATTR, useTokenBoxes } from './useTokenBoxes'
import { bracketMark, groupLines, laneOf, pickLine, underlineSegments } from '@/lib/pen-syntax/snap'
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

// 記号の表示名の正本は台帳（ledger.ts）。既存の呼び出し元のために再輸出する
export { SYMBOL_LABELS, symbolLabel } from '@/lib/pen-syntax/ledger'

interface ChipState {
  candidates: SymbolCandidate[]
  strokes: PenStroke[]
  boxes: TokenBox[]
  lane: Lane
  /** 置き場所の手がかり（書いた線の箱・書いた行の本文の上下・段） */
  anchor: ChipAnchor
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
  /** 分析の順序の記録（order.ts）。記入・取り消し・削除を時系列で通知する */
  onOrderEvent?: (ev: OrderEvent) => void
  onPalm?: (state: PalmState) => void
  /** 診断用「入力の記録」。渡すと接触の受理/拒否と画面の移動を時系列で記録する */
  inputLog?: PenInputLog | null
}

/**
 * 入れ子カッコの深さ別の色（Okabe-Ito の色覚多様性対応パレットから4色）。
 * 深さ 0=青 / 1=朱 / 2=緑 / 3=赤紫 で循環する。
 */
const BRACKET_COLORS = ['#0072B2', '#D55E00', '#009E73', '#CC79A7']

export function bracketColor(depth: number): string {
  return BRACKET_COLORS[depth % BRACKET_COLORS.length]
}

/** 書きかけ（閉じ待ち）の開始カッコの色（薄いグレー） */
const PENDING_BRACKET_COLOR = '#9ca3af'

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
  onOrderEvent,
  onPalm,
  inputLog = null,
}: PenSyntaxAnnotatorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wordRefs = useRef<Array<HTMLElement | null>>([])

  // 解答＋ペン特有の状態（開きかけの括弧・採点対象外マーク）
  const annotationRef = useRef<PenAnnotation>(emptyPenAnnotation(answer))
  const [, forceRender] = useState(0)
  const lastEmittedAnswer = useRef<SyntaxAnswer>(answer)
  const historyRef = useRef<PenAnnotation[]>([])

  // 「手のひらOK」バッジの表示切替用
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
      zone: ev.zone,
      x: ev.x,
      y: ev.y,
    })
  }, [])
  // ゾーン方式の画面ガード: 書き込みエリア内=ペン専用（指・手のひら無効）／
  // エリア外=指は常時有効・ペンは無効（書く道具に徹する）。詳細は zone-guard.ts
  usePenZoneGuard(policy === 'pen-only' && !disabled, onGuard)
  const drawingRef = useRef<DrawingStroke | null>(null)
  // 画のまとめ（useStrokeGrouping）。描画から参照するので入れ物を先に用意する
  const groupingRef = useRef<StrokeGrouping | null>(null)
  // ペンでのタップ（onPointerUp）とその後のクリックの二重発火を防ぐ時刻
  const penTapAtRef = useRef(0)
  const [chips, setChipsState] = useState<ChipState | null>(null)
  // いまの候補を参照でも持つ（同じ書き始めで二重に閉じないため。描画前の値が要る）
  const chipsRef = useRef<ChipState | null>(null)
  const setChips = useCallback((next: ChipState | null) => {
    chipsRef.current = next
    setChipsState(next)
  }, [])
  // 候補の枠は、いま書いた場所を避けて置く（実寸を測ってから位置を決める）
  const chipRef = useRef<HTMLDivElement>(null)
  const chipPos = useChipPlacement(containerRef, chipRef, chips?.anchor ?? null)
  // この接触で候補を閉じたか（閉じただけのタップで一覧まで開かないようにする）
  const dismissedByStrokeRef = useRef(false)
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
  }, [answer, setChips])

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

  /* ---------- 単語の箱の採寸（useTokenBoxes が毎描画後に自動で測り直す） ---------- */
  const boxes = useTokenBoxes(containerRef, wordRefs, tokens, canvasRef)
  const ann = annotationRef.current

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
    for (const s of groupingRef.current?.pending() ?? []) paint(s)
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
      if (out.applied && out.target) {
        // 分析の順序の記録: 筆画の開始時刻を並びの根拠にする（order.ts）
        const key = orderKeyFor(symbol, out.target)
        if (key) {
          onOrderEvent?.({
            kind: 'apply',
            key,
            symbol,
            from: out.target.from,
            to: out.target.to,
            at: strokeStartTime(strokes) ?? performance.now(),
            via: kind === 'candidate' ? 'chip' : 'pen',
          })
        }
      }
      onEvent?.({ kind, symbol, candidates, lane, target: out.target, applied: out.applied })
    },
    [emitAnnotation, onEvent, onOrderEvent, showToast],
  )

  /**
   * 書き続けたら候補は黙って引っ込める（2026-08-27）。
   *
   * 候補が出ている間に書き込みを止めていると、テンポよく書いたときに次の記号の
   * 1画目が黙って消え、「ペンが反応しない」のと同じ体験になる。そこで
   * 「新しい線を書き始めた」＝「この候補は選ばない」とみなし、候補を閉じてから
   * その1画目をそのまま描く（線を失わない）。閉じた候補は取り消し（✕）と同じ扱い。
   *
   * 「候補を押す操作」と「書き始め」は**当たり判定で分かれる**: 候補の枠は
   * キャンバス（z-10）より上（z-20）に重ねてあるため、候補を押した接触は
   * キャンバスに届かない。ここへ来るのは候補の枠の外に触れたときだけである。
   *
   * @returns 候補を閉じたら true（この接触は「候補を閉じる操作」だった）
   */
  const dismissChips = useCallback((): boolean => {
    const c = chipsRef.current
    if (!c) return false
    setChips(null)
    logRef.current?.push({
      kind: 'note',
      at: performance.now(),
      text: '候補を出したまま書き始めたので候補を閉じた（この線は破棄）',
    })
    onEvent?.({ kind: 'failed', symbol: null, candidates: c.candidates, lane: c.lane, applied: false })
    return true
  }, [onEvent, setChips])

  /**
   * 記号のまとまりが確定したとき（まとめの判定・待ち時間は useStrokeGrouping が持つ）。
   * 境界をまたいだ瞬間にも呼ばれるので、書き始めと同時に前の記号が確定する。
   */
  const handleCommit = useCallback(
    (strokes: PenStroke[]) => {
      const rec = recognizeGroup(strokes, boxes, templateStore)
      const { result } = rec
      if (result.best && !result.ambiguous) {
        applyAndReport(result.best.symbol, strokes, rec.boxes, rec.lane, 'auto', result.candidates)
        redraw()
        return
      }
      // 迷った・拾えなかった: 候補チップを出してワンタップ確定。
      // 台帳から外れた形（?・ダッシュ・Ø・単語囲みの○）は候補に出さない（記号の台帳）
      const usable = result.candidates.filter((c) => !deprecatedGuidance(c.symbol))
      const b = strokesBBox(strokes)
      // 置き場所は「書いた線」と「その行の本文」を避けて決める（chip-place.ts）
      const row = rec.boxes.length
        ? {
            top: Math.min(...rec.boxes.map((t) => t.top)),
            bottom: Math.max(...rec.boxes.map((t) => t.bottom)),
          }
        : null
      setChips({
        candidates: usable,
        strokes,
        boxes: rec.boxes,
        lane: rec.lane,
        anchor: { stroke: { left: b.left, right: b.right, top: b.top, bottom: b.bottom }, row, lane: rec.lane },
      })
    },
    [applyAndReport, boxes, redraw, setChips, templateStore],
  )

  const grouping = useStrokeGrouping({ boxes, onCommit: handleCommit, log: inputLog })
  groupingRef.current = grouping

  /* ---------- ポインタ処理（入力・座標・画面固定は useStrokeCanvas が受け持つ） ---------- */
  const handleStroke = (stroke: PenPoint[]) => {
    // ごく小さな接触は「タップ」として扱い、品詞・働きのマスを開く
    // （キャンバスが全面を覆うため、マスのタップはここで拾う。
    //   書きかけの記号がある間は複数画の記号の2画目として線に数える）
    const duration = (stroke[stroke.length - 1].t ?? 0) - (stroke[0].t ?? 0)
    const dismissed = dismissedByStrokeRef.current
    dismissedByStrokeRef.current = false
    const tap = pathLength(stroke) < 7 && duration < 400
    if (dismissed && tap) {
      // 候補の枠の外を軽くタップしただけ＝「候補を閉じる」操作。一覧までは開かない
      redraw()
      return
    }
    if (!grouping.hasPending() && tap) {
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
      // 触れただけの点も1画として扱う（複数画の記号の点など）
      stroke.push({ ...stroke[0], x: stroke[0].x + 0.5 })
    }
    grouping.addStroke(stroke)
    redraw()
  }

  const { handlers } = useStrokeCanvas({
    containerRef,
    drawingRef,
    policy,
    // 候補が出ていても書き込みは受け付ける（受け付けたうえで候補を閉じる）。
    // 止めてしまうと、テンポよく書いたときに次の1画目が黙って消える
    active: !disabled,
    log: inputLog,
    onDecision: (d, e) => {
      if (e.pointerType === 'pen' && !penSeen) setPenSeen(true)
      if (!d.accept && e.pointerType === 'touch') onPalm?.(d.next)
    },
    onStrokeStart: (p) => {
      // 書き始めたら候補は引っ込める（この線は失わない）
      dismissedByStrokeRef.current = dismissChips()
      // 触れた瞬間に境界（段・単語・行）をまたいでいれば、待たずに前の記号を確定させる
      grouping.noteStrokeStart(p)
    },
    onStroke: handleStroke,
    onRedraw: redraw,
  })

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
    onOrderEvent?.({ kind: 'undo', at: performance.now() })
    emitAnnotation(prev)
  }

  const removeSpan = (idx: number) => {
    if (disabled) return
    const a = annotationRef.current
    const s = a.answer.spans[idx]
    if (s) onOrderEvent?.({ kind: 'remove', key: `span:${s.type}:${s.from}-${s.to}`, at: performance.now() })
    emitAnnotation({ ...a, answer: { ...a.answer, spans: a.answer.spans.filter((_, i) => i !== idx) } })
  }

  const removeExtra = (idx: number) => {
    const a = annotationRef.current
    const x = a.extras[idx]
    if (x) {
      onOrderEvent?.({
        kind: 'remove',
        key: `extra:${x.kind === 'wavy' ? 'wavy' : x.label}:${x.from}-${x.to}`,
        at: performance.now(),
      })
    }
    emitAnnotation({ ...a, extras: a.extras.filter((_, i) => i !== idx) })
  }

  const removePendingOpen = (idx: number) => {
    const a = annotationRef.current
    const p = a.pendingOpens[idx]
    if (p) onOrderEvent?.({ kind: 'remove', key: `open:${p.type}:${p.index}`, at: performance.now() })
    emitAnnotation({ ...a, pendingOpens: a.pendingOpens.filter((_, i) => i !== idx) })
  }

  const setSlot = (kind: 'pos' | 'role', index: number, value: string | null) => {
    const a = annotationRef.current
    const next = { ...a.answer, [kind]: [...a.answer[kind]] } as SyntaxAnswer
    next[kind][index] = value
    const key = kind === 'pos' ? `pos:${index}` : `role:${index}-${index}`
    if (value == null) onOrderEvent?.({ kind: 'remove', key, at: performance.now() })
    else {
      onOrderEvent?.({ kind: 'apply', key, symbol: value, from: index, to: index, at: performance.now(), via: 'list' })
    }
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

  /**
   * 括弧の重ね描き（2026-08-27）。
   *
   * 括弧を単語の並びに差し込むと、書いた瞬間に後ろの単語が右へ押されて
   * 「書き込もうとしていた領域自体が移動する」（塾長の実機の指摘）。
   * そこで下線と同じ重ね描きに寄せ、単語のすき間の中央へ置く。
   * 座標は採寸した単語の箱から求める（snap.ts の bracketMark）。
   */
  const bracketOverlay = useMemo(() => {
    const boxOf = new Map(boxes.map((t) => [t.index, t]))
    const out: Array<{
      key: string
      x: number
      y: number
      roleTop: number
      glyph: string
      color: string
      role?: string
      pending?: boolean
    }> = []
    const openIndexes = Array.from(
      new Set<number>([
        ...Object.keys(brackets.opens).map(Number),
        ...ann.pendingOpens.map((p) => p.index),
      ]),
    )
    for (const i of openIndexes) {
      const box = boxOf.get(i)
      if (!box) continue
      // 外側のまとまりほど左に置く。書きかけ（閉じ待ち）は一番内側＝右端
      const closed = (brackets.opens[i] || [])
        .slice()
        .sort((a, b) => b.s.to - b.s.from - (a.s.to - a.s.from))
      const pending = ann.pendingOpens.filter((p) => p.index === i)
      const count = closed.length + pending.length
      closed.forEach(({ s, depth }, n) => {
        out.push({
          key: `o${i}-${n}`,
          ...bracketMark(box, boxes, 'open', n, count),
          glyph: SPAN_TYPES[s.type].open,
          color: bracketColor(depth),
          role: s.role,
        })
      })
      pending.forEach((p, n) => {
        out.push({
          key: `p${i}-${n}`,
          ...bracketMark(box, boxes, 'open', closed.length + n, count),
          glyph: SPAN_TYPES[p.type].open,
          color: PENDING_BRACKET_COLOR,
          role: p.role,
          pending: true,
        })
      })
    }
    for (const key of Object.keys(brackets.closes)) {
      const i = Number(key)
      const box = boxOf.get(i)
      if (!box) continue
      // 内側のまとまりほど単語の近く（左）に置く
      const list = brackets.closes[i]
        .slice()
        .sort((a, b) => a.s.to - a.s.from - (b.s.to - b.s.from))
      list.forEach(({ s, depth }, n) => {
        out.push({
          key: `c${i}-${n}`,
          ...bracketMark(box, boxes, 'close', n, list.length),
          glyph: SPAN_TYPES[s.type].close,
          color: bracketColor(depth),
        })
      })
    }
    return out
  }, [brackets, ann.pendingOpens, boxes])

  const extraAt = (i: number): PenExtraMark[] => ann.extras.filter((x) => i >= x.from && i <= x.to)

  /** 働きの欄の1マスぶん（働きの文字＋○で囲んだ例外マーク） */
  const roleCellAt = (i: number) => roleCellParts(ann.answer.role[i], extraAt(i))

  const extraLabel = (x: PenExtraMark) =>
    x.kind === 'wavy' ? '波線（熟語）' : `○${x.label ?? ''}`

  return (
    <div>
      {/* ペン用の操作部品（ペンでも指でも押せる） */}
      <div className="mb-2 flex flex-wrap items-center gap-2" {...{ [PEN_UI_ATTR]: '' }}>
        <span className="rounded-full bg-sora-soft px-3 py-1 text-xs font-bold text-ai">
          ✍️ ペンで直接書き込めます（括弧・下線・品詞・働き）
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
            🖐 手のひらを載せてもOK（枠の外のボタンや画面送りは指で）
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative mb-3 select-none rounded-card border border-gray-200 bg-white p-3 pb-6 pt-5 shadow-card [-webkit-touch-callout:none]"
        {...{ [PEN_WRITE_ZONE_ATTR]: '' }}
      >
        {/* 括弧は単語の並びに入れない（重ね描き）。ここは単語だけを並べる */}
        <div className="flex flex-wrap items-end gap-x-1 gap-y-7">
          {tokens.map((tok, i) => (
            <div key={i} className="flex items-end">
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
                  ].join(' ')}
                >
                  {tok}
                  {/* ベースラインの目印（中身なし・下端がベースライン＝下線の高さの基準） */}
                  <span
                    aria-hidden
                    className="inline-block h-0 w-0 overflow-hidden align-baseline"
                    {...{ [BASELINE_PROBE_ATTR]: '' }}
                  />
                </span>
                {isPunct(tok) ? (
                  <span className="h-6" />
                ) : (
                  <Cell
                    // ○で囲んだ例外マークは働きの欄に置く（仮S・真S／強・同は単独）
                    value={ann.answer.role[i]}
                    before={roleCellAt(i).before}
                    after={roleCellAt(i).alone}
                    mark={roleMarks?.[i]?.mark}
                    // 節・句の深さは書かずに自動判定: 囲んだ括弧と同じ色＋控えめなダッシュ印
                    accent={
                      depthOfToken(ann.answer.spans, i) > 0
                        ? bracketColor(depthOfToken(ann.answer.spans, i) - 1)
                        : undefined
                    }
                    depthMark={dashesForDepth(depthOfToken(ann.answer.spans, i))}
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

            </div>
          ))}
        </div>

        {/* 下線オーバーレイ: 単語間で途切れない連結線（文字のベースラインのすぐ下に引く） */}
        {ann.answer.spans.map((s, idx) =>
          s.type === 'ul'
            ? underlineSegments(s, boxes, 1).map((seg, j) => (
                <div
                  key={`ul${idx}-${j}`}
                  className="pointer-events-none absolute bg-ink"
                  style={{ left: seg.left, top: seg.y, width: seg.right - seg.left, height: 1.5 }}
                />
              ))
            : null,
        )}

        {/* 括弧オーバーレイ: 単語のすき間に重ねて描く（記号を足しても単語が動かない） */}
        {bracketOverlay.map((b) => (
          <span key={b.key}>
            <span
              className="pointer-events-none absolute select-none text-xl font-bold leading-none"
              style={{ left: b.x, top: b.y, color: b.color, transform: 'translate(-50%, -50%)' }}
            >
              {b.glyph}
            </span>
            {b.role ? (
              // 開始カッコの真下＝そのまとまり全体の働き
              <span
                className="pointer-events-none absolute select-none whitespace-nowrap rounded bg-white/80 px-px text-[11px] font-bold leading-tight"
                style={{ left: b.x, top: b.roleTop, color: b.color, transform: 'translateX(-50%)' }}
              >
                {b.role}
              </span>
            ) : null}
          </span>
        ))}

        {/* ペン入力のキャンバス（指はスクロールもさせない＝手のひら対策。誤反応は数える） */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-10 h-full w-full"
          style={{ touchAction: 'none' }}
          {...handlers}
        />

        {/* 迷ったときの候補チップ（いま書いた場所を避けて出す） */}
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
        <div className="mb-3 flex flex-wrap gap-1.5" {...{ [PEN_UI_ATTR]: '' }}>
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
                {s.role ? <b>＝{s.role}</b> : null}
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
              {SPAN_TYPES[p.type].open}
              {p.role ? <b>＝{p.role}</b> : null} {tokens[p.index]} …（閉じ待ち）
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
          {...{ [PEN_UI_ATTR]: '' }}
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
              {(picker.kind === 'pos' ? POS_LETTER_OPTIONS : ROLE_LETTER_OPTIONS).map((o) => (
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

/** ○で囲んだ例外マーク（仮・真・強・同）の1字ぶん */
function ExceptionBadge({ label }: { label: string }) {
  return (
    <span className="mx-px inline-block rounded-full border border-nodo px-[2px] align-middle text-[10px] font-bold leading-tight text-nodo-dark">
      {label}
    </span>
  )
}

function Cell({
  value,
  before,
  after,
  mark,
  accent,
  depthMark,
  onClick,
}: {
  value: string | null
  /** 働きの前に付く○囲みの例外マーク（仮・真）＝「仮S」のように1つの値を作る */
  before?: string[]
  /** 単独で1マスを占める○囲みの例外マーク（強・同） */
  after?: string[]
  mark?: Mark
  /** 深さの色（囲んだ括弧と同じ色）。採点マークが付いたらマークの色を優先 */
  accent?: string
  /** 深さの印（自動ダッシュ ′ ″ ‴。書かなくても囲んだ括弧から判定して表示） */
  depthMark?: string
  onClick: () => void
}) {
  const marksBefore = before ?? []
  const marksAfter = after ?? []
  const filled = Boolean(value) || marksBefore.length > 0 || marksAfter.length > 0
  const tone =
    mark === 'ok'
      ? 'bg-good-bg text-good font-bold'
      : mark === 'alt'
        ? 'bg-hard-bg text-hard font-bold'
        : mark === 'bad'
          ? 'bg-again-bg text-again font-bold line-through'
          : filled
            ? 'text-sora-dark'
            : 'text-gray-300'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-6 min-w-[2.2rem] rounded px-1 text-xs ${tone}`}
      style={!mark && value && accent ? { color: accent } : undefined}
    >
      {filled ? (
        <>
          {marksBefore.map((m) => (
            <ExceptionBadge key={`b${m}`} label={m} />
          ))}
          {value}
          {value && depthMark ? (
            <span className="ml-px text-[9px] opacity-70">{depthMark}</span>
          ) : null}
          {marksAfter.map((m) => (
            <ExceptionBadge key={`a${m}`} label={m} />
          ))}
        </>
      ) : (
        '・'
      )}
    </button>
  )
}
