'use client'

import type { GrowthStage, CareState } from '@/lib/garden/plant-state'
import type { Variety } from '@/lib/garden/varieties'

/**
 * 手続き生成の植物スプライト（素朴トーン）。
 * 株の基部を (0,0) として上方向（負のy）へ伸びる <g> を返す。
 * 成長段階で姿が変わり、世話状態（しおれ/枯れ）で色と傾きが変わる。
 *
 * Phase 10.4: `variety`（品種）を渡すと、果樹は果実の色、花きは開花の姿が変わる。
 * 未指定（インプリント前）は汎用の果樹（赤い実）。早い段階（種/芽/苗）は品種差なし。
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

/** 花の頭（花びら＋中心）。基部からの相対位置 (cx,cy) に描く。 */
function flowerHead(v: Variety, cx: number, cy: number, r: number) {
  const petals = []
  const petalCount = 7
  for (let i = 0; i < petalCount; i++) {
    const a = (i / petalCount) * Math.PI * 2
    const px = cx + Math.cos(a) * r
    const py = cy + Math.sin(a) * r
    petals.push(
      <ellipse
        key={`pt${i}`}
        cx={px}
        cy={py}
        rx={r * 0.62}
        ry={r * 0.42}
        fill={v.accent}
        stroke={v.accentDark}
        strokeWidth={1.1}
        transform={`rotate(${(a * 180) / Math.PI} ${px} ${py})`}
      />
    )
  }
  return (
    <>
      {petals}
      <circle cx={cx} cy={cy} r={r * 0.7} fill={v.accentDark} stroke={v.accentDark} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r * 0.4} fill={v.accentLight} opacity={0.6} />
    </>
  )
}

export function PlantSprite({
  stage,
  care,
  variety,
}: {
  stage: GrowthStage
  care: CareState
  variety?: Variety
}) {
  const p = carePalette(care)
  const isFlower = variety?.kind === 'flower'
  const fruit = variety?.accent ?? FRUIT
  const fruitD = variety?.accentDark ?? FRUIT_D
  const lush = care === 'healthy' || care === 'thirsty'

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
    if (isFlower) {
      // 花き・成株 = 茎＋葉＋つぼみ
      body = (
        <>
          <path d="M0,0 L0,-26" fill="none" stroke={p.leafD} strokeWidth={2.6} />
          {leafPath(p, 'fl', 'M0,-10 q-14,-2 -17,-12 q14,1 17,10 Z')}
          {leafPath(p, 'fr', 'M0,-17 q14,-2 17,-12 q-14,1 -17,10 Z')}
          {lush ? (
            <ellipse cx={0} cy={-31} rx={6} ry={9} fill={variety!.accent} stroke={variety!.accentDark} strokeWidth={1.4} />
          ) : (
            <ellipse cx={0} cy={-30} rx={5} ry={7} fill={p.leaf} stroke={p.leafD} strokeWidth={1.4} />
          )}
        </>
      )
    } else {
      // 果樹・成株 = 木（実なし）
      body = (
        <>
          <rect x={-3.5} y={-16} width={7} height={18} rx={2} fill={TRUNK} stroke={TRUNK_D} strokeWidth={1.4} />
          <ellipse cx={0} cy={-26} rx={22} ry={18} fill={p.leaf} stroke={p.leafD} strokeWidth={2} />
          <path d="M-12,-30 q12,8 24,0" fill="none" stroke={p.leafL} strokeWidth={2.5} />
        </>
      )
    }
  } else {
    // blooming = 開花・結実
    if (isFlower) {
      // 花き・開花 = 茎＋葉＋花（しおれ以降はつぼみのまま）
      body = (
        <>
          <path d="M0,0 L0,-30" fill="none" stroke={p.leafD} strokeWidth={3} />
          {leafPath(p, 'bl', 'M0,-12 q-16,-2 -19,-13 q16,1 19,11 Z')}
          {leafPath(p, 'br', 'M0,-20 q16,-2 19,-13 q-16,1 -19,11 Z')}
          {lush ? (
            flowerHead(variety!, 0, -36, 8)
          ) : (
            <ellipse cx={0} cy={-34} rx={5} ry={8} fill={p.leaf} stroke={p.leafD} strokeWidth={1.4} />
          )}
        </>
      )
    } else {
      // 果樹・結実 = 木＋果実（しおれ以降は実が落ちる）
      body = (
        <>
          <rect x={-4.5} y={-20} width={9} height={22} rx={2} fill={TRUNK} stroke={TRUNK_D} strokeWidth={1.6} />
          <ellipse cx={0} cy={-34} rx={28} ry={23} fill={p.leaf} stroke={p.leafD} strokeWidth={2} />
          <path d="M-15,-40 q15,9 30,0" fill="none" stroke={p.leafL} strokeWidth={3} />
          {lush ? (
            <>
              <circle cx={-12} cy={-38} r={5} fill={fruit} stroke={fruitD} strokeWidth={1.2} />
              <circle cx={11} cy={-44} r={5} fill={fruit} stroke={fruitD} strokeWidth={1.2} />
              <circle cx={4} cy={-28} r={5} fill={fruit} stroke={fruitD} strokeWidth={1.2} />
            </>
          ) : null}
        </>
      )
    }
  }

  // しおれ傾き（基部0,0を軸に回転）。CSSの揺れアニメと衝突しないよう内側に置く。
  return (
    <g opacity={p.opacity} strokeLinejoin="round" strokeLinecap="round">
      <g transform={p.droop ? `rotate(${p.droop})` : undefined}>{body}</g>
    </g>
  )
}
