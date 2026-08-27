'use client'

/**
 * 候補（チップ）の置き場所を、枠と候補の実寸を測って決める配線（2026-08-27）。
 *
 * 決め方そのものは純関数 `placeChipBox`（lib/pen-syntax/chip-place.ts）に置き、
 * ここは「測って渡す・描く前に位置を当てる」だけを受け持つ。
 * 書き込み部品と計測ページで同じ挙動にするため、両方からこのフックを使う。
 */

import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import { placeChipBox, type ChipPlacement, type ChipRect } from '@/lib/pen-syntax/chip-place'
import type { Lane } from '@/lib/pen-syntax/types'

export interface ChipAnchor {
  /** 書いた線の外接箱（枠相対） */
  stroke: ChipRect
  /** 書いた行の本文の上下（分かるとき） */
  row?: { top: number; bottom: number } | null
  lane: Lane
}

export function useChipPlacement(
  containerRef: RefObject<HTMLElement | null>,
  chipRef: RefObject<HTMLElement | null>,
  anchor: ChipAnchor | null,
): ChipPlacement | null {
  const [pos, setPos] = useState<ChipPlacement | null>(null)

  // 候補が出た（＝手がかりが変わった）ときに、枠と候補の実寸を測って置き場所を決める。
  // 画面に出る前（useLayoutEffect）に決めるので、出てから動くちらつきは無い
  useLayoutEffect(() => {
    if (!anchor) {
      setPos((p) => (p === null ? p : null))
      return
    }
    const container = containerRef.current
    const chipEl = chipRef.current
    if (!container || !chipEl) return
    const c = container.getBoundingClientRect()
    const el = chipEl.getBoundingClientRect()
    const next = placeChipBox({
      stroke: anchor.stroke,
      row: anchor.row,
      lane: anchor.lane,
      container: { width: c.width, height: c.height },
      chip: { width: el.width, height: el.height },
    })
    setPos((p) =>
      p && Math.abs(p.left - next.left) < 0.5 && Math.abs(p.top - next.top) < 0.5 ? p : next,
    )
  }, [anchor, containerRef, chipRef])

  return pos
}
