'use client'

import { useMemo } from 'react'
import type { PlantState } from '@/lib/garden/plant-state'
import type { Variety } from '@/lib/garden/varieties'
import { IsoTile, TILE, PLANT_MAX_H } from './IsoTile'

export interface GardenFieldItem {
  id: string
  label: string
  plant: PlantState
  variety?: Variety
}

/**
 * 全体画面 ＝ ブロックを斜め45°グリッドに自動レイアウトして合成する。
 * 配置式: x=(col-row)*hw, y=(col+row)*hh。奥(col+row小)から手前へ描画して重ねる。
 */
export function GardenField({
  items,
  onSelect,
}: {
  items: GardenFieldItem[]
  onSelect?: (id: string) => void
}) {
  const layout = useMemo(() => {
    const { hw, hh, t } = TILE
    const n = items.length
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)))

    const placed = items.map((item, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      return { item, i, col, row, x: (col - row) * hw, y: (col + row) * hh, order: col + row }
    })

    let minX = 0, maxX = 0, minY = 0, maxY = 0
    for (const pl of placed) {
      minX = Math.min(minX, pl.x - hw)
      maxX = Math.max(maxX, pl.x + hw)
      minY = Math.min(minY, pl.y - hh - PLANT_MAX_H)
      maxY = Math.max(maxY, pl.y + hh + t)
    }
    const pad = 10
    const offsetX = -minX + pad
    const offsetY = -minY + pad
    const width = maxX - minX + pad * 2
    const height = maxY - minY + pad * 2

    // 奥→手前（order昇順、同列はrow昇順）に並べ替えて描画順を確定
    const drawn = [...placed].sort((a, b) => a.order - b.order || a.row - b.row || a.col - b.col)

    return { drawn, width, height, offsetX, offsetY }
  }, [items])

  if (items.length === 0) {
    return (
      <div className="text-center text-gray-500 py-10 text-sm">この庭にはまだ株がありません。</div>
    )
  }

  return (
    <div className="w-full overflow-x-auto">
      <style jsx global>{`
        .garden-sway {
          transform-box: fill-box;
          transform-origin: 50% 92%;
          animation: gardenSway 4.8s ease-in-out infinite;
        }
        @keyframes gardenSway {
          0%, 100% { transform: rotate(-1.4deg); }
          50% { transform: rotate(1.4deg); }
        }
        .garden-drop {
          transform-box: fill-box;
          transform-origin: center;
          animation: gardenDrop 2.6s ease-in infinite;
        }
        @keyframes gardenDrop {
          0% { transform: translateY(-3px); opacity: 0; }
          25% { opacity: 1; }
          75% { opacity: 1; }
          100% { transform: translateY(6px); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .garden-sway, .garden-drop { animation: none; }
        }
      `}</style>
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width="100%"
        style={{ maxWidth: layout.width, display: 'block', margin: '0 auto' }}
        role="img"
        aria-label="アイソメトリックの庭。ブロックごとに1株が育つ。"
      >
        {layout.drawn.map((pl) => (
          <g
            key={pl.item.id}
            transform={`translate(${pl.x + layout.offsetX}, ${pl.y + layout.offsetY})`}
            onClick={onSelect ? () => onSelect(pl.item.id) : undefined}
            style={onSelect ? { cursor: 'pointer' } : undefined}
          >
            <IsoTile plant={pl.item.plant} variety={pl.item.variety} delay={(pl.i % 6) * 0.5} />
          </g>
        ))}
      </svg>
    </div>
  )
}
