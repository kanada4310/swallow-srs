/**
 * ペン入力の診断用「入力の記録」（2026-08-26 実機不具合の原因特定用）。
 *
 * 実機でしか再現しない不具合（ペンが反応しない・線がずれる）を切り分けるため、
 * 受け付けた/捨てた接触の種類・座標と、描画中の画面の移動量を時系列で記録する。
 * 塾長が実機で症状を起こし、記録をコピーして貼るだけで原因が確定できる形にする。
 * すべて端末内で完結（外部送信なし）。
 */

/** 記録1件に添える画面の状態（枠の位置・ページのスクロール・表示域） */
export interface ScreenSnapshot {
  /** 書き込み枠の画面上の位置（getBoundingClientRect） */
  rectLeft: number
  rectTop: number
  /** ページのスクロール量 */
  scrollX: number
  scrollY: number
  /** 表示域（visualViewport）。未対応ブラウザは null */
  vvOffsetLeft: number | null
  vvOffsetTop: number | null
  vvScale: number | null
}

export type InputLogEntry =
  | {
      kind: 'pointer'
      at: number
      phase: 'down' | 'move' | 'up' | 'cancel'
      pointerType: string
      pointerId: number
      client: { x: number; y: number }
      local: { x: number; y: number }
      /** ブラウザが計算した要素相対座標（offsetX/Y）。局所座標と食い違えばずれの証拠 */
      offset?: { x: number; y: number } | null
      /** 接触楕円の大きさ（px）。手のひらは大きく出ることが多い */
      contact?: { w: number; h: number }
      accepted?: boolean
      reason?: string
      screen?: ScreenSnapshot
    }
  | {
      kind: 'guard'
      at: number
      event: 'touchstart' | 'touchmove'
      action: 'blocked' | 'allowed'
      reason: string
      x: number
      y: number
    }
  | { kind: 'shift'; at: number; during: 'stroke' | 'idle'; detail: string }
  | { kind: 'note'; at: number; text: string }

export interface InputLogEnv {
  userAgent: string
  devicePixelRatio: number
  visualViewportSupported: boolean
}

const round1 = (n: number) => Math.round(n * 10) / 10

function fmtScreen(s: ScreenSnapshot): string {
  const vv =
    s.vvScale == null
      ? '表示域=未対応'
      : `表示域=(${round1(s.vvOffsetLeft ?? 0)},${round1(s.vvOffsetTop ?? 0)}) 倍率=${(s.vvScale ?? 1).toFixed(2)}`
  return `枠=(${round1(s.rectLeft)},${round1(s.rectTop)}) スクロール=(${round1(s.scrollX)},${round1(s.scrollY)}) ${vv}`
}

const TYPE_LABEL: Record<string, string> = { pen: 'ペン', touch: '指', mouse: 'マウス' }

export function formatInputLogEntry(e: InputLogEntry, startAt: number): string {
  const t = `+${((e.at - startAt) / 1000).toFixed(2)}s`
  if (e.kind === 'pointer') {
    const type = TYPE_LABEL[e.pointerType] ?? e.pointerType
    const parts: string[] = [t, type, e.phase, `id=${e.pointerId}`]
    parts.push(`画面(${round1(e.client.x)},${round1(e.client.y)})`)
    parts.push(`局所(${round1(e.local.x)},${round1(e.local.y)})`)
    if (e.offset) {
      const dx = round1(e.offset.x - e.local.x)
      const dy = round1(e.offset.y - e.local.y)
      parts.push(`要素相対(${round1(e.offset.x)},${round1(e.offset.y)})${dx || dy ? ` 差(${dx},${dy})` : ''}`)
    }
    if (e.contact && (e.contact.w || e.contact.h)) parts.push(`接触=${round1(e.contact.w)}x${round1(e.contact.h)}`)
    if (e.accepted !== undefined) parts.push(e.accepted ? `受理(${e.reason})` : `拒否(${e.reason})`)
    if (e.screen) parts.push(fmtScreen(e.screen))
    return parts.join(' ')
  }
  if (e.kind === 'guard') {
    const act = e.action === 'blocked' ? '遮断' : '通過'
    return `${t} ガード ${e.event} ${act}(${e.reason}) 位置(${round1(e.x)},${round1(e.y)})`
  }
  if (e.kind === 'shift') {
    const when = e.during === 'stroke' ? '線を描いている最中' : '待機中'
    return `${t} ⚠ 画面移動（${when}）: ${e.detail}`
  }
  return `${t} メモ: ${e.text}`
}

/** 記録全体を報告に貼れる1つの文字列にする */
export function formatInputLog(entries: InputLogEntry[], env: InputLogEnv): string {
  const header = [
    `# ペン入力の記録（${entries.length}件）`,
    `端末: ${env.userAgent}`,
    `画素密度=${env.devicePixelRatio} 表示域API=${env.visualViewportSupported ? 'あり' : 'なし'}`,
  ]
  if (entries.length === 0) return [...header, '（まだ記録がありません）'].join('\n')
  const startAt = entries[0].at
  return [...header, ...entries.map((e) => formatInputLogEntry(e, startAt))].join('\n')
}

/**
 * 画面の状態2つを比べ、動いていれば内容を言葉で返す（動いていなければ null）。
 * 「線を描いている最中に画面が動いた」ことの検出に使う。
 */
export function describeScreenShift(a: ScreenSnapshot, b: ScreenSnapshot, threshold = 1): string | null {
  const parts: string[] = []
  if (Math.abs(a.rectLeft - b.rectLeft) > threshold || Math.abs(a.rectTop - b.rectTop) > threshold) {
    parts.push(`枠 (${round1(a.rectLeft)},${round1(a.rectTop)})→(${round1(b.rectLeft)},${round1(b.rectTop)})`)
  }
  if (Math.abs(a.scrollX - b.scrollX) > threshold || Math.abs(a.scrollY - b.scrollY) > threshold) {
    parts.push(`スクロール (${round1(a.scrollX)},${round1(a.scrollY)})→(${round1(b.scrollX)},${round1(b.scrollY)})`)
  }
  const av = a.vvScale ?? 1
  const bv = b.vvScale ?? 1
  if (Math.abs(av - bv) > 0.01) parts.push(`倍率 ${av.toFixed(2)}→${bv.toFixed(2)}`)
  const aox = a.vvOffsetLeft ?? 0
  const aoy = a.vvOffsetTop ?? 0
  const box = b.vvOffsetLeft ?? 0
  const boy = b.vvOffsetTop ?? 0
  if (Math.abs(aox - box) > threshold || Math.abs(aoy - boy) > threshold) {
    parts.push(`表示域 (${round1(aox)},${round1(aoy)})→(${round1(box)},${round1(boy)})`)
  }
  return parts.length ? parts.join(' / ') : null
}

export interface PenInputLog {
  push(e: InputLogEntry): void
  entries(): InputLogEntry[]
  clear(): void
  /** 記録が変わるたびに呼ばれる購読（表示の更新用） */
  subscribe(fn: () => void): () => void
}

/** 直近 limit 件だけ保持する記録（リングバッファ） */
export function createPenInputLog(limit = 400): PenInputLog {
  let items: InputLogEntry[] = []
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((fn) => fn())
  return {
    push(e) {
      items.push(e)
      if (items.length > limit) items = items.slice(items.length - limit)
      notify()
    },
    entries: () => items.slice(),
    clear() {
      items = []
      notify()
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

/** いまの画面の状態を撮る（ブラウザ専用・記録に添える） */
export function captureScreenSnapshot(container: HTMLElement | null): ScreenSnapshot {
  const rect = container?.getBoundingClientRect()
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  return {
    rectLeft: rect?.left ?? 0,
    rectTop: rect?.top ?? 0,
    scrollX: typeof window !== 'undefined' ? window.scrollX : 0,
    scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
    vvOffsetLeft: vv ? vv.offsetLeft : null,
    vvOffsetTop: vv ? vv.offsetTop : null,
    vvScale: vv ? vv.scale : null,
  }
}
