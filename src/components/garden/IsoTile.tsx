'use client'

import type { PlantState } from '@/lib/garden/plant-state'
import { PlantSprite } from './PlantSprite'

/** アイソメ・ブロックの寸法（天面の半幅・半高・厚み） */
export const TILE = { hw: 40, hh: 20, t: 13 } as const
/** 株が天面より上に伸びる最大高さ（レイアウトの余白計算用） */
export const PLANT_MAX_H = 58

const GRASS = '#90B873'
const GRASS_D = '#6E9355'
const SOIL_L = '#9C7C56'
const SOIL_R = '#B4946C'
const SOIL_D = '#7C6042'

/**
 * 1ノート＝ひし形ブロック1枚＋株。天面の中心を (0,0) とする <g> を返す。
 * 個別画面・全体画面の両方でこのコンポーネントを使い回す。
 */
export function IsoTile({
  plant,
  animate = true,
  delay = 0,
}: {
  plant: PlantState
  animate?: boolean
  delay?: number
}) {
  const { hw, hh, t } = TILE
  const delayStyle = animate && delay ? { animationDelay: `${delay}s` } : undefined
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* ブロック（天面＝芝 / 左右＝土） */}
      <path d={`M0,${-hh} L${hw},0 L0,${hh} L${-hw},0 Z`} fill={GRASS} stroke={GRASS_D} strokeWidth={1.6} />
      <path d={`M${-hw},0 L0,${hh} L0,${hh + t} L${-hw},${t} Z`} fill={SOIL_L} stroke={SOIL_D} strokeWidth={1.6} />
      <path d={`M${hw},0 L0,${hh} L0,${hh + t} L${hw},${t} Z`} fill={SOIL_R} stroke={SOIL_D} strokeWidth={1.6} />

      {/* 株（揺れアニメは外側のグループ、しおれ傾きは PlantSprite 内側） */}
      <g className={animate ? 'garden-sway' : undefined} style={delayStyle}>
        <PlantSprite stage={plant.growth} care={plant.care} />
      </g>

      {/* 水やりが必要ならしずくバッジ（位置は外側、脈打ちは内側＝transform衝突回避） */}
      {plant.needsWater && (
        <g transform={`translate(${hw * 0.52}, ${-hh * 0.4})`}>
          <g className={animate ? 'garden-drop' : undefined} style={delayStyle}>
            <path d="M0,-6 q-6,8 0,13 q6,-5 0,-13 Z" fill="#7FA0B4" stroke="#54707F" strokeWidth={1.2} />
          </g>
        </g>
      )}
    </g>
  )
}
