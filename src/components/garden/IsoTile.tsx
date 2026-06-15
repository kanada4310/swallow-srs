'use client'

import type { PlantState } from '@/lib/garden/plant-state'
import type { Variety } from '@/lib/garden/varieties'
import { PlantSprite } from './PlantSprite'

/** アイソメ・ブロックの寸法（天面の半幅・半高・厚み） */
export const TILE = { hw: 40, hh: 20, t: 13 } as const
/** 株が天面より上に伸びる最大高さ（レイアウトの余白計算用） */
export const PLANT_MAX_H = 58

// 天面＝土（葉の緑と被らないベージュ系）。水やり状態で乾き/湿りを出し分ける。
const GROUND_DRY = '#D9CBA6'    // 乾いたベージュ（要水やり）
const GROUND_DRY_D = '#BBAA82'
const GROUND_WET = '#C1A678'    // 湿った土（水やり済み）
const GROUND_WET_D = '#9C8459'
// 側面＝土
const SOIL_L = '#9C7C56'
const SOIL_R = '#B4946C'
const SOIL_D = '#7C6042'

/**
 * 1ノート＝ひし形ブロック1枚＋株。天面の中心を (0,0) とする <g> を返す。
 * 個別画面・全体画面の両方でこのコンポーネントを使い回す。
 */
export function IsoTile({
  plant,
  variety,
  animate = true,
  delay = 0,
}: {
  plant: PlantState
  variety?: Variety
  animate?: boolean
  delay?: number
}) {
  const { hw, hh, t } = TILE
  const delayStyle = animate && delay ? { animationDelay: `${delay}s` } : undefined
  // 水やり済み（期限内）は湿った土色、要水やり（期限切れ）は乾いたベージュ
  const ground = plant.needsWater ? GROUND_DRY : GROUND_WET
  const groundD = plant.needsWater ? GROUND_DRY_D : GROUND_WET_D
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* ブロック（天面＝土ベージュ / 左右＝土） */}
      <path d={`M0,${-hh} L${hw},0 L0,${hh} L${-hw},0 Z`} fill={ground} stroke={groundD} strokeWidth={1.6} />
      <path d={`M${-hw},0 L0,${hh} L0,${hh + t} L${-hw},${t} Z`} fill={SOIL_L} stroke={SOIL_D} strokeWidth={1.6} />
      <path d={`M${hw},0 L0,${hh} L0,${hh + t} L${hw},${t} Z`} fill={SOIL_R} stroke={SOIL_D} strokeWidth={1.6} />

      {/* 株（揺れアニメは外側のグループ、しおれ傾きは PlantSprite 内側） */}
      <g className={animate ? 'garden-sway' : undefined} style={delayStyle}>
        <PlantSprite stage={plant.growth} care={plant.care} variety={variety} />
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
