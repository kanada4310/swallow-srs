'use client'

import { useEffect, useRef, useState } from 'react'
import type { Application, Container, Sprite, Texture, FederatedPointerEvent } from 'pixi.js'
import type { GardenFieldItem } from './GardenField'
import { GardenField } from './GardenField'
import {
  getTileCanvas,
  tileKey,
  TILE_ANCHOR_X,
  TILE_ANCHOR_Y,
  TILE_LOGICAL_W,
  TEX_W,
  ISO_HW,
  ISO_HH,
} from './tileTexture'

const CANVAS_HEIGHT = 460
const SVG_FALLBACK_MAX = 150

/**
 * 大規模な庭を PixiJS（WebGL）で描画する（Phase 10.2 残）。
 * 既存SVGアートをテクスチャ化して数千タイルをバッチ描画。ドラッグ移動＋ホイール/ピンチズーム。
 * 遅延ロード（next/dynamic, ssr:false）前提。WebGL 初期化失敗時は従来SVGに縮退。
 */
export function GardenFieldPixi({
  items,
  onSelect,
}: {
  items: GardenFieldItem[]
  onSelect?: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    let destroyed = false
    let app: Application | null = null
    const domCleanup: Array<() => void> = []

    ;(async () => {
      const PIXI = await import('pixi.js')
      const el = containerRef.current
      if (destroyed || !el) return

      const width = el.clientWidth || 360
      const height = CANVAS_HEIGHT

      app = new PIXI.Application()
      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: true,
      })
      if (destroyed) {
        app.destroy(true)
        return
      }
      el.appendChild(app.canvas)

      const world: Container = new PIXI.Container()
      app.stage.addChild(world)
      app.stage.eventMode = 'static'
      app.stage.hitArea = app.screen

      // 配置（IsoTile と同じアイソメ式）。背面(col+row小)→前面に並べる。
      const n = items.length
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)))
      const placed = items.map((it, i) => ({ it, col: i % cols, row: Math.floor(i / cols) }))
      placed.sort((a, b) => a.col + a.row - (b.col + b.row) || a.row - b.row || a.col - b.col)

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const p of placed) {
        const x = (p.col - p.row) * ISO_HW
        const y = (p.col + p.row) * ISO_HH
        minX = Math.min(minX, x - 44); maxX = Math.max(maxX, x + 44)
        minY = Math.min(minY, y - 64); maxY = Math.max(maxY, y + 36)
      }

      // 必要なテクスチャを先に用意（同キーは1枚だけ）
      const texByKey = new Map<string, Texture>()
      for (const p of placed) {
        const key = tileKey(p.it.plant, p.it.variety)
        if (!texByKey.has(key)) {
          const canvas = await getTileCanvas(p.it.plant, p.it.variety)
          if (destroyed) return
          texByKey.set(key, PIXI.Texture.from(canvas))
        }
      }
      if (destroyed) return

      const spriteScale = TILE_LOGICAL_W / TEX_W // 論理88幅に合わせる
      let movedDist = 0
      for (const p of placed) {
        const tex = texByKey.get(tileKey(p.it.plant, p.it.variety))!
        const sprite: Sprite = new PIXI.Sprite(tex)
        sprite.anchor.set(TILE_ANCHOR_X, TILE_ANCHOR_Y)
        sprite.scale.set(spriteScale)
        sprite.x = (p.col - p.row) * ISO_HW
        sprite.y = (p.col + p.row) * ISO_HH
        sprite.eventMode = 'static'
        sprite.cursor = 'pointer'
        const id = p.it.id
        sprite.on('pointertap', () => {
          if (movedDist < 8) onSelectRef.current?.(id)
        })
        world.addChild(sprite)
      }

      // 初期表示：全体を幅にフィット＆中央寄せ
      const contentW = maxX - minX || 1
      const contentH = maxY - minY || 1
      const fit = Math.min(width / contentW, height / contentH, 1)
      world.scale.set(fit)
      world.x = (width - contentW * fit) / 2 - minX * fit
      world.y = (height - contentH * fit) / 2 - minY * fit

      const zoomAt = (px: number, py: number, factor: number) => {
        const next = Math.max(0.12, Math.min(4, world.scale.x * factor))
        const f = next / world.scale.x
        world.x = px - (px - world.x) * f
        world.y = py - (py - world.y) * f
        world.scale.set(next)
      }

      // パン（1本指/マウス）＋ピンチ（2本指）
      const pts = new Map<number, { x: number; y: number }>()
      let dragging = false
      let last = { x: 0, y: 0 }
      let pinchDist = 0

      app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
        pts.set(e.pointerId, { x: e.global.x, y: e.global.y })
        if (pts.size === 1) {
          dragging = true
          movedDist = 0
          last = { x: e.global.x, y: e.global.y }
        } else if (pts.size === 2) {
          dragging = false
          const [a, b] = Array.from(pts.values())
          pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
        }
      })
      app.stage.on('pointermove', (e: FederatedPointerEvent) => {
        if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.global.x, y: e.global.y })
        if (pts.size === 2) {
          const [a, b] = Array.from(pts.values())
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (pinchDist > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist)
          pinchDist = d
          return
        }
        if (!dragging) return
        const dx = e.global.x - last.x
        const dy = e.global.y - last.y
        movedDist += Math.abs(dx) + Math.abs(dy)
        world.x += dx
        world.y += dy
        last = { x: e.global.x, y: e.global.y }
      })
      const endPt = (e: FederatedPointerEvent) => {
        pts.delete(e.pointerId)
        if (pts.size < 2) pinchDist = 0
        if (pts.size === 0) dragging = false
      }
      app.stage.on('pointerup', endPt)
      app.stage.on('pointerupoutside', endPt)

      // ホイールズーム（デスクトップ）
      const canvas = app.canvas
      const onWheel = (ev: WheelEvent) => {
        ev.preventDefault()
        const rect = canvas.getBoundingClientRect()
        zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, ev.deltaY < 0 ? 1.1 : 1 / 1.1)
      }
      canvas.addEventListener('wheel', onWheel, { passive: false })
      canvas.style.touchAction = 'none'
      domCleanup.push(() => canvas.removeEventListener('wheel', onWheel))

      setLoading(false)
    })().catch((err) => {
      console.error('PixiJS garden failed, falling back to SVG:', err)
      if (!destroyed) setFailed(true)
    })

    return () => {
      destroyed = true
      domCleanup.forEach((f) => f())
      if (app) {
        try {
          app.destroy(true, { children: true })
        } catch {
          /* noop */
        }
        app = null
      }
    }
  }, [items])

  if (failed) {
    // WebGL 不可など → 従来SVG（先頭のみ）に縮退
    return (
      <div>
        <p className="text-xs text-amber-700 mb-2">
          高速描画を初期化できませんでした。先頭{SVG_FALLBACK_MAX}株のみ表示します。
        </p>
        <GardenField items={items.slice(0, SVG_FALLBACK_MAX)} onSelect={onSelect} />
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        style={{ height: CANVAS_HEIGHT }}
        className="w-full overflow-hidden rounded-lg"
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
          庭を描画中…
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-1 text-center">
        ドラッグで移動・ホイール/ピンチで拡大縮小・タップで株を選択
      </p>
    </div>
  )
}
