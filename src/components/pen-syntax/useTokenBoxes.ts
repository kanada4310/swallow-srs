'use client'

/**
 * 単語の箱（TokenBox）の採寸を1か所に集める（2026-08-26 基盤の作り込み）。
 *
 * これまで「文が変わったら」「答えが変わったら」「採点マークが出たら」と
 * 採寸のやり直し条件を1つずつ列挙しており、条件が漏れるたびに
 * 「下線がカッコの幅ぶんずれる」類いの不具合が再発していた。
 *
 * このフックは列挙をやめ、**描画のたびに毎回測り直す**（変わっていなければ
 * 状態を更新しない）ことで「表示が変われば採寸が自動で追随する」を
 * 仕組みとして保証する:
 * - React の再描画すべての後（useLayoutEffect・依存配列なし）
 * - 枠の大きさの変化（ResizeObserver＝画面回転・折り返しの変化も拾う）
 * - フォントの読み込み完了（document.fonts.ready＝字幅が変わる）
 * 単語数は高々数十なので、毎回測っても描画1回あたりの負担は小さい。
 *
 * キャンバスの画素数合わせ（devicePixelRatio 倍）も採寸と同時に行う。
 */

import { useCallback, useLayoutEffect, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { TokenBox } from '@/lib/pen-syntax/types'
import { isPunct } from '@/lib/reading/syntax'

/** 箱の一覧が実質同じか（0.5px 未満の揺れは同じとみなし、無限再描画を防ぐ） */
export function sameBoxes(a: TokenBox[], b: TokenBox[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (
      x.index !== y.index ||
      Math.abs(x.left - y.left) >= 0.5 ||
      Math.abs(x.right - y.right) >= 0.5 ||
      Math.abs(x.top - y.top) >= 0.5 ||
      Math.abs(x.bottom - y.bottom) >= 0.5
    ) {
      return false
    }
  }
  return true
}

export function useTokenBoxes(
  containerRef: RefObject<HTMLDivElement | null>,
  wordRefs: RefObject<Array<HTMLElement | null>>,
  tokens: string[],
  canvasRef?: RefObject<HTMLCanvasElement | null>,
): TokenBox[] {
  const [boxes, setBoxes] = useState<TokenBox[]>([])
  const boxesRef = useRef(boxes)
  boxesRef.current = boxes

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const cRect = container.getBoundingClientRect()
    const next: TokenBox[] = []
    wordRefs.current?.forEach((el, i) => {
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
    if (!sameBoxes(boxesRef.current, next)) setBoxes(next)
    const canvas = canvasRef?.current
    if (canvas) {
      const dpr = window.devicePixelRatio || 1
      const w = Math.round(cRect.width * dpr)
      const h = Math.round(cRect.height * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }
  }, [containerRef, wordRefs, tokens, canvasRef])

  // 描画のたびに毎回測り直す（依存配列を意図的に付けない）。
  // 「何が変わったら測り直すか」を列挙しないことが、この仕組みの核。
  useLayoutEffect(() => {
    measure()
  })

  useEffect(() => {
    const container = containerRef.current
    if (container && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => measure())
      ro.observe(container)
      // フォント読み込みで字幅が変わったら測り直す
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        document.fonts.ready.then(() => measure()).catch(() => {})
      }
      return () => ro.disconnect()
    }
    return undefined
  }, [containerRef, measure])

  return boxes
}
