/**
 * 「入力の記録」の再生（2026-08-26 基盤の作り込み）。
 *
 * 実機で起きた不具合の記録（入力の記録の JSON）を、そのまま判定ロジックに
 * 通し直してテストにできるようにする。今後の実機不具合は
 * 「記録をコピー（再生用）」を貼るだけで再現テストになる:
 * 1. 症状が出たら計測ページ・構文の練習の「入力の記録」→「再生用をコピー」
 * 2. 貼り付けた JSON を src/lib/pen-syntax/replays/ に保存
 * 3. replay.test.ts に期待する挙動を1件足す
 *
 * 再生できるもの:
 * - 画面ガードの判定（ゾーン方式 zone-guard）: 接触ごとに通す/止めるをやり直す
 * - 画のまとめ判定（grouping）: 記録した接触から線を組み立て直し、
 *   「いくつの記号に分かれ、いつ確定するか」を新旧の方式で計算し直す（2026-08-27 追加）
 * - 座標変換（resolveLocalPoint）: 記録した座標から局所座標を計算し直し、
 *   記録された座標とのずれ（drift）を出す（線ずれの検証）
 * - 描画中の画面移動（shift）の抽出
 *
 * 限界: 記録は接触の識別番号を持たないため、「止めた接触の続き」の判定は
 * 記録1件ずつを新しい接触として再生する（方針の検証には十分）。
 */

import type { InputLogEntry, InputLogEnv } from './input-log'
import type { PenStroke, TokenBox } from './types'
import { simulateCommits, type CommitEvent } from './grouping'
import { resolveLocalPoint } from './local-point'
import {
  createZoneGuardState,
  decidePenPointer,
  decideTouchEvent,
  trackPen,
  type PenZone,
} from './zone-guard'

/** 「再生用をコピー」が出力し、再生テストが読み込む形 */
export interface InputLogDump {
  env: InputLogEnv
  entries: InputLogEntry[]
}

export function dumpInputLog(entries: InputLogEntry[], env: InputLogEnv): string {
  return JSON.stringify({ env, entries } satisfies InputLogDump, null, 1)
}

export function parseInputLogDump(text: string): InputLogDump {
  const parsed = JSON.parse(text) as InputLogDump
  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error('入力の記録の JSON ではありません（entries がありません）')
  }
  return parsed
}

/* ---------- 画面ガードの再生 ---------- */

export interface GuardReplayRow {
  at: number
  event: 'touchstart' | 'touchmove' | 'pen-down'
  zone: PenZone
  /** 記録に残っていた実機での結果（古い方式の記録には無いこともある） */
  recorded?: 'blocked' | 'allowed'
  /** いまの判定ロジックで再生した結果 */
  replayed: 'blocked' | 'allowed'
  reason: string
}

/**
 * 記録を時系列に再生し、ゾーン方式のガード判定をやり直す。
 * ペンのポインタ記録で状態（接触中・直近位置）を追い、
 * ガード記録（指の接触・エリア外のペン）ごとに判定する。
 */
export function replayGuard(entries: InputLogEntry[]): GuardReplayRow[] {
  const state = createZoneGuardState()
  const rows: GuardReplayRow[] = []
  entries.forEach((e, i) => {
    if (e.kind === 'pointer' && e.pointerType === 'pen') {
      trackPen(state, e.phase, e.client.x, e.client.y, e.at)
      return
    }
    if (e.kind !== 'guard') return
    const zone: PenZone = e.zone ?? 'page'
    if (e.event === 'pen-down') {
      const d = decidePenPointer(zone)
      rows.push({
        at: e.at,
        event: e.event,
        zone,
        recorded: e.action,
        replayed: d.allow ? 'allowed' : 'blocked',
        reason: d.reason,
      })
      return
    }
    const d = decideTouchEvent(
      state,
      [{ identifier: i, clientX: e.x, clientY: e.y }],
      zone,
      e.at,
    )
    rows.push({
      at: e.at,
      event: e.event,
      zone,
      recorded: e.action,
      replayed: d.allow ? 'allowed' : 'blocked',
      reason: d.reason,
    })
  })
  return rows
}

/* ---------- 座標変換の再生（線ずれの検証） ---------- */

export interface LocalPointReplayRow {
  at: number
  phase: string
  recorded: { x: number; y: number }
  recomputed: { x: number; y: number }
  /** 記録と再計算の距離（px）。大きければ座標変換に問題がある */
  drift: number
  source: 'rect' | 'element'
}

export function replayLocalPoints(entries: InputLogEntry[]): LocalPointReplayRow[] {
  const rows: LocalPointReplayRow[] = []
  for (const e of entries) {
    if (e.kind !== 'pointer' || !e.screen) continue
    const p = resolveLocalPoint({
      clientX: e.client.x,
      clientY: e.client.y,
      rectLeft: e.screen.rectLeft,
      rectTop: e.screen.rectTop,
      offsetX: e.offset?.x,
      offsetY: e.offset?.y,
      vvScale: e.screen.vvScale,
      vvOffsetLeft: e.screen.vvOffsetLeft,
      vvOffsetTop: e.screen.vvOffsetTop,
    })
    rows.push({
      at: e.at,
      phase: e.phase,
      recorded: e.local,
      recomputed: { x: p.x, y: p.y },
      drift: Math.hypot(p.x - e.local.x, p.y - e.local.y),
      source: p.source,
    })
  }
  return rows
}

/* ---------- 描画中の画面移動の抽出 ---------- */

export function strokeShifts(entries: InputLogEntry[]): string[] {
  return entries
    .filter((e): e is Extract<InputLogEntry, { kind: 'shift' }> => e.kind === 'shift')
    .filter((e) => e.during === 'stroke')
    .map((e) => e.detail)
}

/* ---------- 画のまとめ判定の再生（記号が1つにまとまってしまう不具合の検証） ---------- */

/** 記録した接触（down→move→up）から線を組み立て直す */
export function replayStrokes(entries: InputLogEntry[]): PenStroke[] {
  const strokes: PenStroke[] = []
  let current: { id: number; pts: PenStroke } | null = null
  for (const e of entries) {
    if (e.kind !== 'pointer') continue
    if (e.phase === 'down') {
      // 拒否された接触（手のひら等）は線にならない
      if (e.accepted === false) {
        current = null
        continue
      }
      current = { id: e.pointerId, pts: [{ x: e.local.x, y: e.local.y, t: e.at }] }
      continue
    }
    if (!current || current.id !== e.pointerId) continue
    current.pts.push({ x: e.local.x, y: e.local.y, t: e.at })
    if (e.phase === 'up' || e.phase === 'cancel') {
      strokes.push(current.pts)
      current = null
    }
  }
  if (current) strokes.push(current.pts)
  return strokes
}

export interface GroupingReplay {
  strokes: PenStroke[]
  boxes: TokenBox[]
  /** いまの方式（境界で即確定）で数え直した確定 */
  commits: CommitEvent[]
  /** 旧方式（2026-08-26 まで・まとまり全体の外接箱で比べる）で数え直した確定 */
  legacyCommits: CommitEvent[]
  /** 記録に残っていた実機での確定（新しい記録にだけ入っている） */
  recorded: Array<Extract<InputLogEntry, { kind: 'commit' }>>
}

/**
 * 記録から線と単語の箱を取り出し、まとめ判定をやり直す。
 * 記録の move は間引かれているため、線の形は粗い（まとめ判定には十分）。
 */
export function replayGrouping(entries: InputLogEntry[]): GroupingReplay {
  const boxesEntry = entries.find(
    (e): e is Extract<InputLogEntry, { kind: 'boxes' }> => e.kind === 'boxes',
  )
  const boxes = boxesEntry?.boxes ?? []
  const strokes = replayStrokes(entries)
  return {
    strokes,
    boxes,
    commits: simulateCommits(strokes, boxes, { early: true }),
    legacyCommits: simulateCommits(strokes, boxes, { legacy: true }),
    recorded: entries.filter(
      (e): e is Extract<InputLogEntry, { kind: 'commit' }> => e.kind === 'commit',
    ),
  }
}
