/**
 * 品種カタログ（Phase 10.4）— 記憶のいきもの育成のインプリント。
 *
 * 「ベース形状（果樹 / 花き）＋品種ごとのアクセント色」で個別性を出す方針。
 * 1品種ずつフル描き下ろしはせず、PlantSprite が kind と色で姿を変える。
 * 素朴・落ち着いたトーン（くすんだアースカラー）を維持する。
 *
 * 仕様: docs/memory-creatures-design.md
 */

/** 株のベース形状 */
export type VarietyKind = 'tree' | 'flower'

export interface Variety {
  /** カタログID（user_creature_state.imprint.variety に保存） */
  id: string
  /** 表示名（りんご 等） */
  name: string
  /** ベース形状 */
  kind: VarietyKind
  /** アクセント色（果実 / 花びら） */
  accent: string
  /** アクセント濃色（縁取り） */
  accentDark: string
  /** アクセント淡色（ハイライト） */
  accentLight: string
  /** ピッカー表示用の絵文字 */
  emoji: string
}

/** 果樹（fruit trees）と花き（flowers）。有限・手描き可能な規模。 */
export const VARIETIES: Variety[] = [
  // 果樹
  { id: 'apple', name: 'りんご', kind: 'tree', accent: '#C0524A', accentDark: '#8A3A33', accentLight: '#D98179', emoji: '🍎' },
  { id: 'orange', name: 'みかん', kind: 'tree', accent: '#E08A3C', accentDark: '#B5631F', accentLight: '#F0AE72', emoji: '🍊' },
  { id: 'cherry', name: 'さくらんぼ', kind: 'tree', accent: '#B33B52', accentDark: '#82273B', accentLight: '#D0697E', emoji: '🍒' },
  { id: 'grape', name: 'ぶどう', kind: 'tree', accent: '#7C5C9E', accentDark: '#564073', accentLight: '#9E83BC', emoji: '🍇' },
  { id: 'lemon', name: 'レモン', kind: 'tree', accent: '#D8B23E', accentDark: '#A9851F', accentLight: '#E8CD78', emoji: '🍋' },
  { id: 'fig', name: 'いちじく', kind: 'tree', accent: '#8A6A78', accentDark: '#5E4450', accentLight: '#A88E99', emoji: '🫐' },
  // 花き
  { id: 'sunflower', name: 'ひまわり', kind: 'flower', accent: '#E0B43C', accentDark: '#B0851E', accentLight: '#EDCD6E', emoji: '🌻' },
  { id: 'tulip', name: 'チューリップ', kind: 'flower', accent: '#CC5A6E', accentDark: '#9B3A4C', accentLight: '#E08C9C', emoji: '🌷' },
  { id: 'rose', name: 'ばら', kind: 'flower', accent: '#BC4A5C', accentDark: '#8A2E3D', accentLight: '#D2818F', emoji: '🌹' },
  { id: 'cosmos', name: 'コスモス', kind: 'flower', accent: '#CE7E9E', accentDark: '#9E5474', accentLight: '#E0A6BE', emoji: '🌸' },
  { id: 'morningGlory', name: 'あさがお', kind: 'flower', accent: '#6E7BB8', accentDark: '#4A5690', accentLight: '#97A2CE', emoji: '💠' },
]

/** id → Variety */
export const VARIETY_MAP: Record<string, Variety> = Object.fromEntries(
  VARIETIES.map((v) => [v.id, v])
)

/** id から Variety を引く（未知IDは undefined） */
export function getVariety(id: string | null | undefined): Variety | undefined {
  if (!id) return undefined
  return VARIETY_MAP[id]
}

/**
 * シード文字列（noteId 等）から決定的に品種を1つ選ぶ（「おまかせ」用）。
 * 同じ種は常に同じ品種＝再描画でブレない。FNV-1a 風の簡易ハッシュ。
 */
export function pickVarietyByHash(seed: string): Variety {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  const idx = (h >>> 0) % VARIETIES.length
  return VARIETIES[idx]
}
