/**
 * タイルのテクスチャ化（Phase 10.2 残・PixiJS 大規模描画用）。
 *
 * 既存の手続き生成SVG（IsoTile/PlantSprite）を**そのまま再利用**し、
 * (成長段階×世話×要水やり×品種) の組み合わせごとに 1 度だけ canvas にラスタライズしてキャッシュする。
 * PixiJS 側はこの canvas から Texture を作って大量のスプライトをバッチ描画する。
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { IsoTile } from './IsoTile'
import type { PlantState } from '@/lib/garden/plant-state'
import type { Variety } from '@/lib/garden/varieties'

/** テクスチャの実ピクセルサイズ（2x で crisp に） */
export const TEX_W = 176
export const TEX_H = 200
/** タイルの論理サイズ（viewBox 幅・高さ） */
export const TILE_LOGICAL_W = 88
export const TILE_LOGICAL_H = 100
/** タイル中心（0,0）のテクスチャ内アンカー（0..1） */
export const TILE_ANCHOR_X = 44 / TILE_LOGICAL_W
export const TILE_ANCHOR_Y = 64 / TILE_LOGICAL_H
/** アイソメ配置の半幅・半高（IsoTile の TILE と一致） */
export const ISO_HW = 40
export const ISO_HH = 20

const canvasCache = new Map<string, HTMLCanvasElement>()

/** 見た目が同じになる組み合わせのキー（描画に効くものだけ） */
export function tileKey(plant: PlantState, variety?: Variety): string {
  return `${plant.growth}|${plant.care}|${plant.needsWater ? 'w' : '_'}|${variety?.id ?? '_'}`
}

/**
 * タイル1枚を canvas にラスタライズして返す（同キーはキャッシュ）。
 * IsoTile を SVG 文字列化 → data URL → Image → canvas。
 */
export async function getTileCanvas(
  plant: PlantState,
  variety?: Variety
): Promise<HTMLCanvasElement> {
  const key = tileKey(plant, variety)
  const cached = canvasCache.get(key)
  if (cached) return cached

  const inner = renderToStaticMarkup(
    createElement(IsoTile, { plant, variety, animate: false })
  )
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-44 -64 88 100" width="${TEX_W}" height="${TEX_H}">${inner}</svg>`
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)

  const img = new Image()
  img.decoding = 'async'
  img.src = url
  await img.decode()

  const canvas = document.createElement('canvas')
  canvas.width = TEX_W
  canvas.height = TEX_H
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.drawImage(img, 0, 0, TEX_W, TEX_H)

  canvasCache.set(key, canvas)
  return canvas
}
