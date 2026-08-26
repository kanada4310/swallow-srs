/**
 * ペン座標の局所化（画面の移動・拡大に強い座標変換）。
 *
 * 通常は「画面座標 − 書き込み枠の位置」で枠相対の座標を出す（毎イベントで
 * 枠の位置を測り直すため、ページのスクロールには元々追従する）。
 *
 * ただしピンチズーム中（表示域が拡大・移動している間）は、一部のブラウザ
 * （特にアプリ内ブラウザ）でイベントの画面座標と要素位置の座標系が食い違い、
 * 線が常に一定量ずれることがある。その間はブラウザ自身が計算した
 * 要素相対座標（offsetX/Y）を使う。offsetX/Y は要素の中で完結した座標なので
 * 表示域の食い違いの影響を受けない（2026-08-26 実機不具合対策）。
 */

export interface LocalPointInput {
  clientX: number
  clientY: number
  /** 書き込み枠の画面上の位置（getBoundingClientRect の left/top） */
  rectLeft: number
  rectTop: number
  /** ブラウザ計算の要素相対座標。未対応環境・テスト環境では undefined を渡す */
  offsetX?: number
  offsetY?: number
  /** 表示域（visualViewport）の状態。未対応ブラウザは null/undefined */
  vvScale?: number | null
  vvOffsetLeft?: number | null
  vvOffsetTop?: number | null
}

export interface LocalPoint {
  x: number
  y: number
  /** rect=枠の位置から計算 / element=ブラウザ計算の要素相対座標 */
  source: 'rect' | 'element'
}

/** 表示域が拡大・移動しているか（＝座標系の食い違いが起こりうる状態か） */
export function isViewportTransformed(i: {
  vvScale?: number | null
  vvOffsetLeft?: number | null
  vvOffsetTop?: number | null
}): boolean {
  if (i.vvScale == null) return false
  return Math.abs(i.vvScale - 1) > 0.001 || Math.abs(i.vvOffsetLeft ?? 0) > 0.5 || Math.abs(i.vvOffsetTop ?? 0) > 0.5
}

export function resolveLocalPoint(i: LocalPointInput): LocalPoint {
  if (isViewportTransformed(i) && typeof i.offsetX === 'number' && typeof i.offsetY === 'number') {
    return { x: i.offsetX, y: i.offsetY, source: 'element' }
  }
  return { x: i.clientX - i.rectLeft, y: i.clientY - i.rectTop, source: 'rect' }
}
