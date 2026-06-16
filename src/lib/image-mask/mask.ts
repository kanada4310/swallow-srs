// 画像マスキング（Phase 13.4 増分B）の純ロジック
//
// 1ノート＝1画像＋複数のマスク領域。SRS はノート単位。
// レビューごとに領域からランダムにN個を選んで隠す（コロケーション例文プールと同じ思想）。
// 座標はすべて画像に対する 0〜100 の % で保持し、表示サイズに依存しない。

export interface MaskRegion {
  id: string
  /** 左上 x（%, 0-100） */
  x: number
  /** 左上 y（%, 0-100） */
  y: number
  /** 幅（%, 0-100） */
  w: number
  /** 高さ（%, 0-100） */
  h: number
  /** 隠れる正解テキスト（裏面で表示） */
  answer?: string
  /** ヒント（任意） */
  hint?: string
}

/** ノートの マスク領域 フィールドに格納する JSON 構造（配列そのもの） */
export type MaskRegions = MaskRegion[]

/** 毎回隠す数のデフォルト割合（領域数に対する比率） */
export const DEFAULT_MASK_RATIO = 0.3

/**
 * 1回のレビューで隠す領域数を決める。
 * configured が正の整数ならそれを採用（領域総数で頭打ち）。
 * 未指定なら総数 × DEFAULT_MASK_RATIO（四捨五入・最低1）。
 */
export function resolveMaskCount(total: number, configured?: number | null): number {
  if (total <= 0) return 0
  if (configured != null && Number.isFinite(configured) && configured >= 1) {
    return Math.min(Math.floor(configured), total)
  }
  return Math.max(1, Math.min(total, Math.round(total * DEFAULT_MASK_RATIO)))
}

/**
 * [0, total) から count 個の相異なるインデックスを選ぶ（Fisher-Yates の部分シャッフル）。
 * rng はテスト用に差し替え可能（既定 Math.random）。返り値はソート済み。
 */
export function pickMaskIndices(
  total: number,
  count: number,
  rng: () => number = Math.random
): number[] {
  const n = Math.max(0, Math.min(count, total))
  if (n === 0) return []
  const arr = Array.from({ length: total }, (_, i) => i)
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (total - i))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, n).sort((a, b) => a - b)
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function boxStyle(r: MaskRegion): string {
  return `position:absolute;left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;box-sizing:border-box;`
}

/**
 * カード表示用の HTML を組み立てる。
 * side='front': masked の領域を不透明グレーで覆う（「?」付き）。
 * side='back' : 画像は全表示（元のラベル文字が読める）。masked だった領域は
 *   枠線＋小さな番号バッジだけを重ね、答えは画像の下に番号付きリストで表示する
 *   （文字を画像の上に重ねないので、元の文字と衝突しない）。
 *
 * imageUrl は http(s) 公開URL（StudyCard 側でオフライン用に data: URL へ書換えられる）。
 */
export function buildMaskHtml(
  imageUrl: string,
  regions: MaskRegions,
  maskedIds: Set<string>,
  side: 'front' | 'back'
): string {
  if (!imageUrl) return ''
  const img = `<img src="${esc(imageUrl)}" style="display:block;max-width:100%;height:auto;">`

  if (side === 'front') {
    const overlays = regions
      .filter((r) => maskedIds.has(r.id))
      .map(
        (r) =>
          `<div style="${boxStyle(
            r
          )}background:#475569;border-radius:3px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:0.9em;">?</div>`
      )
      .join('')
    return `<div style="position:relative;display:inline-block;max-width:100%;">${img}${overlays}</div>`
  }

  // 裏面: マスクしていた領域を上から下→左から右の順に番号付け
  const masked = regions
    .filter((r) => maskedIds.has(r.id))
    .sort((a, b) => a.y - b.y || a.x - b.x)

  const overlays = masked
    .map((r, i) => {
      const badge = `<span style="position:absolute;top:0;left:0;transform:translate(-35%,-35%);background:#f59e0b;color:#fff;font-size:11px;line-height:16px;min-width:16px;height:16px;border-radius:8px;text-align:center;font-weight:bold;padding:0 3px;box-shadow:0 0 0 1px #fff;">${i + 1}</span>`
      return `<div style="${boxStyle(r)}border:2px solid #f59e0b;border-radius:3px;">${badge}</div>`
    })
    .join('')

  const list = masked
    .map((r) => `<li style="margin:2px 0;">${r.answer ? esc(r.answer) : ''}</li>`)
    .join('')

  return `<div style="display:inline-block;max-width:100%;text-align:left;"><div style="position:relative;display:inline-block;max-width:100%;">${img}${overlays}</div><ol style="margin:10px 0 0;padding-left:1.6em;font-size:14px;color:#374151;line-height:1.5;">${list}</ol></div>`
}
