'use client'

import type { GrowthStage, CareState } from '@/lib/garden/plant-state'

/**
 * 手続き生成の植物スプライト（素朴トーン）。
 * 株の基部を (0,0) として上方向（負のy）へ伸びる <g> を返す。
 * 成長段階で姿が変わり、世話状態（しおれ/枯れ）で色と傾きが変わる。
 * ※当面は汎用の木/草。品種別スプライトは Phase 10.4。
 */

interface CarePalette {
  leaf: string
  leafD: string
  leafL: string
  /** しおれ傾き（度） */
  droop: number
  opacity: number
}

function carePalette(care: CareState): CarePalette {
  switch (care) {
    case 'healthy':
    case 'thirsty':
      return { leaf: '#7FAA66', leafD: '#5C7344', leafL: '#AECB8C', droop: 0, opacity: 1 }
    case 'wilting':
      return { leaf: '#A7AE8E', leafD: '#6E7355', leafL: '#C2C6A8', droop: 7, opacity: 1 }
    case 'dryingOut':
      return { leaf: '#B49B76', leafD: '#8A7050', leafL: '#CBB89C', droop: 12, opacity: 0.95 }
    case 'withered':
      return { leaf: '#A98C66', leafD: '#7E6346', leafL: '#BBA489', droop: 16, opacity: 0.82 }
  }
}

const TRUNK = '#9C7B58'
const TRUNK_D = '#7A5E42'
const FRUIT = '#C0695A'
const FRUIT_D = '#8A4636'

function leafPath(p: CarePalette, key: string, d: string) {
  return <path key={key} d={d} fill={p.leaf} stroke={p.leafD} strokeWidth={1.4} />
}

export function PlantSprite({ stage, care }: { stage: GrowthStage; care: CareState }) {
  const p = carePalette(care)

  // 種は世話状態の影響を受けない（まだ植わっただけ）
  if (stage === 'seed') {
    return (
      <g strokeLinejoin="round" strokeLinecap="round">
        <ellipse cx={0} cy={-3} rx={6} ry={5} fill="#B89A78" stroke="#8A6A4A" strokeWidth={1.4} />
        <path d="M-2,-5 q2,-2 4,0" fill="none" stroke="#8A6A4A" strokeWidth={1.2} />
      </g>
    )
  }

  let body: React.ReactNode = null
  if (stage === 'sprout') {
    body = (
      <>
        <path d="M0,0 L0,-13" fill="none" stroke={p.leafD} strokeWidth={2} />
        {leafPath(p, 'l', 'M0,-7 q-10,-1 -12,-10 q10,1 12,8 Z')}
        {leafPath(p, 'r', 'M0,-11 q10,-1 12,-10 q-10,1 -12,8 Z')}
      </>
    )
  } else if (stage === 'seedling') {
    body = (
      <>
        <path d="M0,0 L0,-22" fill="none" stroke={p.leafD} strokeWidth={2.4} />
        {leafPath(p, 'l1', 'M0,-9 q-13,-2 -16,-12 q13,1 16,10 Z')}
        {leafPath(p, 'r1', 'M0,-15 q13,-2 16,-12 q-13,1 -16,10 Z')}
        {leafPath(p, 't', 'M0,-22 q-9,-2 -11,-10 q9,1 11,8 Z')}
      </>
    )
  } else if (stage === 'mature') {
    body = (
      <>
        <rect x={-3.5} y={-16} width={7} height={18} rx={2} fill={TRUNK} stroke={TRUNK_D} strokeWidth={1.4} />
        <ellipse cx={0} cy={-26} rx={22} ry={18} fill={p.leaf} stroke={p.leafD} strokeWidth={2} />
        <path d="M-12,-30 q12,8 24,0" fill="none" stroke={p.leafL} strokeWidth={2.5} />
      </>
    )
  } else {
    // blooming = 結実した木
    body = (
      <>
        <rect x={-4.5} y={-20} width={9} height={22} rx={2} fill={TRUNK} stroke={TRUNK_D} strokeWidth={1.6} />
        <ellipse cx={0} cy={-34} rx={28} ry={23} fill={p.leaf} stroke={p.leafD} strokeWidth={2} />
        <path d="M-15,-40 q15,9 30,0" fill="none" stroke={p.leafL} strokeWidth={3} />
        {care === 'healthy' || care === 'thirsty' ? (
          <>
            <circle cx={-12} cy={-38} r={5} fill={FRUIT} stroke={FRUIT_D} strokeWidth={1.2} />
            <circle cx={11} cy={-44} r={5} fill={FRUIT} stroke={FRUIT_D} strokeWidth={1.2} />
            <circle cx={4} cy={-28} r={5} fill={FRUIT} stroke={FRUIT_D} strokeWidth={1.2} />
          </>
        ) : null}
      </>
    )
  }

  // しおれ傾き（基部0,0を軸に回転）。CSSの揺れアニメと衝突しないよう内側に置く。
  return (
    <g opacity={p.opacity} strokeLinejoin="round" strokeLinecap="round">
      <g transform={p.droop ? `rotate(${p.droop})` : undefined}>{body}</g>
    </g>
  )
}
