'use client'

/**
 * 書いた画を「1つの記号」にまとめて確定させる係（2026-08-27）。
 *
 * これまで、まとめの判定・待ち時間・確定の呼び出しが、書き込み部品
 * （PenSyntaxAnnotator）と計測ページ（pen-lab）に**同じ内容で2か所**書かれており、
 * 片方だけ直す事故が起きうる形だった。入力処理を useStrokeCanvas に一本化したのと
 * 同じ考え方で、まとめ判定はこのフックだけが受け持つ。
 *
 * 速さの要（塾長の実機フィードバック「書いている途中の記号が全部ひとまとめになる」）:
 * - **ペンが触れた瞬間**に、直前のまとまりと段（品詞・本文・働き）や単語が
 *   ちがうと分かれば、**待たずにその場で確定する**（紙に書くのと同じテンポ）
 * - 同じ単語の同じ段で書き続けている間だけ、いままでどおり待ち時間ぶん待つ
 *   （○で囲んだ漢字・2画で書く S や V・括弧の書き直しを途中で切らないため）
 * - 判定そのものは grouping.ts（純関数・テスト対象）
 *
 * 確定するたびに「入力の記録」へ確定までの待ち時間を残す（実機での実測用）。
 */

import { useCallback, useEffect, useRef } from 'react'
import type { PenPoint, PenStroke, TokenBox } from '@/lib/pen-syntax/types'
import {
  groupBreakReason,
  GROUP_BREAK_LABEL,
  type GroupBreakReason,
} from '@/lib/pen-syntax/grouping'
import type { PenInputLog } from '@/lib/pen-syntax/input-log'

/** 待ち時間の既定値（ms）。同じ単語・同じ段で書き続けている間だけ効く */
export const GROUP_WAIT_MS = 750

export interface CommitInfo {
  trigger: 'boundary-start' | 'boundary-end' | 'timer' | 'flush'
  reason: GroupBreakReason | null
  /** 最後の一画を書き終えてから確定するまで（ms） */
  waitedMs: number
  /** 次の記号を書き始めてから確定するまで（ms）。待ち時間切れなら null */
  sinceStartMs: number | null
}

export interface StrokeGroupingOptions {
  /** いまの単語の箱（毎描画ごとに更新される値をそのまま渡す） */
  boxes: TokenBox[]
  /** 記号がひとつ確定した */
  onCommit: (strokes: PenStroke[], info: CommitInfo) => void
  waitMs?: number
  log?: PenInputLog | null
}

export interface StrokeGrouping {
  /** 描画用: いま書きかけのまとまりの画 */
  pending: () => PenStroke[]
  hasPending: () => boolean
  /** ペンが触れた瞬間（useStrokeCanvas の onStrokeStart から呼ぶ） */
  noteStrokeStart: (p: PenPoint) => void
  /** 1画を書き終えた（useStrokeCanvas の onStroke から呼ぶ） */
  addStroke: (stroke: PenStroke) => void
  /** 書きかけをいま確定させる（採点・画面を離れるときなど） */
  flush: () => void
  /** 書きかけを捨てる */
  reset: () => void
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const lastTimeOf = (strokes: PenStroke[]): number => {
  const last = strokes[strokes.length - 1]
  const t = last?.[last.length - 1]?.t
  return typeof t === 'number' ? t : nowMs()
}

export function useStrokeGrouping({
  boxes,
  onCommit,
  waitMs = GROUP_WAIT_MS,
  log = null,
}: StrokeGroupingOptions): StrokeGrouping {
  const pendingRef = useRef<PenStroke[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 最新の値を参照で持つ（毎描画で作り直される関数に依存させない）
  const boxesRef = useRef(boxes)
  boxesRef.current = boxes
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const logRef = useRef(log)
  logRef.current = log

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  // 単語の箱を記録に残す（実機の記録から、まとめ判定を再生し直せるようにする）
  useEffect(() => {
    if (boxes.length > 0) logRef.current?.push({ kind: 'boxes', at: nowMs(), boxes })
  }, [boxes])

  const commit = useCallback(
    (trigger: CommitInfo['trigger'], reason: GroupBreakReason | null, startedAt: number | null) => {
      const strokes = pendingRef.current
      pendingRef.current = []
      clearTimer()
      if (strokes.length === 0) return
      const at = nowMs()
      const info: CommitInfo = {
        trigger,
        reason,
        waitedMs: at - lastTimeOf(strokes),
        sinceStartMs: startedAt == null ? null : Math.max(0, at - startedAt),
      }
      logRef.current?.push({
        kind: 'commit',
        at,
        strokes: strokes.length,
        trigger,
        reason: reason ? GROUP_BREAK_LABEL[reason] : undefined,
        waitedMs: info.waitedMs,
        sinceStartMs: info.sinceStartMs,
      })
      onCommitRef.current(strokes, info)
    },
    [clearTimer],
  )

  const noteStrokeStart = useCallback(
    (p: PenPoint) => {
      // 触れた瞬間に「別の記号だ」と分かるなら、待たずにその場で確定する。
      // 分からないときは待ち時間だけ止め、書き終えた時点で判定し直す（従来どおり）。
      if (pendingRef.current.length > 0) {
        const reason = groupBreakReason(pendingRef.current, [p], boxesRef.current, {
          mode: 'start',
        })
        if (reason) {
          commit('boundary-start', reason, typeof p.t === 'number' ? p.t : nowMs())
          return
        }
      }
      clearTimer()
    },
    [clearTimer, commit],
  )

  const addStroke = useCallback(
    (stroke: PenStroke) => {
      if (stroke.length === 0) return
      if (pendingRef.current.length > 0) {
        const reason = groupBreakReason(pendingRef.current, stroke, boxesRef.current, {
          mode: 'end',
        })
        if (reason) {
          const startedAt = typeof stroke[0].t === 'number' ? stroke[0].t : null
          commit('boundary-end', reason, startedAt)
        }
      }
      pendingRef.current = [...pendingRef.current, stroke]
      clearTimer()
      timerRef.current = setTimeout(() => commit('timer', null, null), waitMs)
    },
    [clearTimer, commit, waitMs],
  )

  const flush = useCallback(() => commit('flush', null, null), [commit])

  const reset = useCallback(() => {
    pendingRef.current = []
    clearTimer()
  }, [clearTimer])

  return {
    pending: () => pendingRef.current,
    hasPending: () => pendingRef.current.length > 0,
    noteStrokeStart,
    addStroke,
    flush,
    reset,
  }
}
