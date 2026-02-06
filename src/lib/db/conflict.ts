/**
 * 競合検出・解決ロジック
 */

import type { LocalCardState } from './schema'
import { isNewerThan } from './utils'

export type ConflictResolution = 'local' | 'server'

export interface ConflictInfo {
  type: 'card_state'
  localData: LocalCardState
  serverData: {
    user_id: string
    card_id: string
    due: string
    interval: number
    ease_factor: number
    repetitions: number
    state: string
    learning_step: number
    lapses?: number
    updated_at: string
  }
  fieldDifferences: string[]
}

/**
 * Detect conflicts between local and server card states
 */
export function detectConflicts(
  localStates: LocalCardState[],
  serverStates: Array<{
    user_id: string
    card_id: string
    due: string
    interval: number
    ease_factor: number
    repetitions: number
    state: string
    learning_step: number
    lapses?: number
    updated_at: string
  }>
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = []

  // Create map of server states for quick lookup
  const serverMap = new Map(
    serverStates.map((s) => [`${s.user_id}:${s.card_id}`, s])
  )

  for (const local of localStates) {
    const serverState = serverMap.get(`${local.user_id}:${local.card_id}`)

    if (!serverState) {
      // No server state - no conflict, will be created on sync
      continue
    }

    const serverUpdatedAt = new Date(serverState.updated_at)

    // Check if both have been modified since last sync
    // A conflict exists when:
    // 1. Both local and server have been modified
    // 2. The modifications are different (not just timestamp)
    const localNewer = isNewerThan(local.updated_at, serverUpdatedAt)
    const serverNewer = isNewerThan(serverUpdatedAt, local.updated_at)

    // If one is strictly newer, no conflict
    if (localNewer !== serverNewer) {
      continue
    }

    // Same timestamp - check if values differ
    const differences = findFieldDifferences(local, serverState)

    if (differences.length > 0) {
      conflicts.push({
        type: 'card_state',
        localData: local,
        serverData: serverState,
        fieldDifferences: differences,
      })
    }
  }

  return conflicts
}

/**
 * Find which fields differ between local and server state
 */
function findFieldDifferences(
  local: LocalCardState,
  server: {
    due: string
    interval: number
    ease_factor: number
    repetitions: number
    state: string
    learning_step: number
    lapses?: number
  }
): string[] {
  const differences: string[] = []

  // Compare due dates (within 1 minute tolerance)
  const localDue = local.due.getTime()
  const serverDue = new Date(server.due).getTime()
  if (Math.abs(localDue - serverDue) > 60000) {
    differences.push('due')
  }

  if (local.interval !== server.interval) {
    differences.push('interval')
  }

  // Ease factor comparison with small tolerance for floating point
  if (Math.abs(local.ease_factor - server.ease_factor) > 0.01) {
    differences.push('ease_factor')
  }

  if (local.repetitions !== server.repetitions) {
    differences.push('repetitions')
  }

  if (local.state !== server.state) {
    differences.push('state')
  }

  if (local.learning_step !== server.learning_step) {
    differences.push('learning_step')
  }

  if ((local.lapses ?? 0) !== (server.lapses ?? 0)) {
    differences.push('lapses')
  }

  return differences
}

/**
 * Resolve a conflict by choosing local or server data
 */
export function resolveConflict(
  conflict: ConflictInfo,
  resolution: ConflictResolution
): LocalCardState {
  if (resolution === 'local') {
    return conflict.localData
  }

  // Convert server data to local format
  return {
    id: `${conflict.serverData.user_id}:${conflict.serverData.card_id}`,
    user_id: conflict.serverData.user_id,
    card_id: conflict.serverData.card_id,
    due: new Date(conflict.serverData.due),
    interval: conflict.serverData.interval,
    ease_factor: conflict.serverData.ease_factor,
    repetitions: conflict.serverData.repetitions,
    state: conflict.serverData.state as LocalCardState['state'],
    learning_step: conflict.serverData.learning_step,
    lapses: conflict.serverData.lapses ?? 0,
    updated_at: new Date(conflict.serverData.updated_at),
  }
}

/**
 * Auto-resolve conflicts based on strategy
 */
export function autoResolveConflicts(
  conflicts: ConflictInfo[],
  strategy: 'prefer-local' | 'prefer-server' | 'prefer-newer'
): Map<string, LocalCardState> {
  const resolutions = new Map<string, LocalCardState>()

  for (const conflict of conflicts) {
    let resolution: ConflictResolution

    if (strategy === 'prefer-local') {
      resolution = 'local'
    } else if (strategy === 'prefer-server') {
      resolution = 'server'
    } else {
      // prefer-newer
      const localUpdated = conflict.localData.updated_at
      const serverUpdated = new Date(conflict.serverData.updated_at)
      resolution = isNewerThan(localUpdated, serverUpdated) ? 'local' : 'server'
    }

    const resolved = resolveConflict(conflict, resolution)
    resolutions.set(resolved.id, resolved)
  }

  return resolutions
}

/**
 * Format conflict for display
 */
export function formatConflictForDisplay(conflict: ConflictInfo): {
  local: {
    due: string
    interval: string
    state: string
    repetitions: number
    updatedAt: string
  }
  server: {
    due: string
    interval: string
    state: string
    repetitions: number
    updatedAt: string
  }
  differences: string[]
} {
  const formatDate = (date: Date) =>
    date.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const formatInterval = (days: number) => {
    if (days < 1) return '< 1日'
    if (days === 1) return '1日'
    if (days < 30) return `${days}日`
    if (days < 365) return `${Math.round(days / 30)}ヶ月`
    return `${Math.round(days / 365)}年`
  }

  const stateLabels: Record<string, string> = {
    new: '新規',
    learning: '学習中',
    review: '復習',
    relearning: '再学習',
    suspended: '一時停止',
  }

  return {
    local: {
      due: formatDate(conflict.localData.due),
      interval: formatInterval(conflict.localData.interval),
      state: stateLabels[conflict.localData.state] ?? conflict.localData.state,
      repetitions: conflict.localData.repetitions,
      updatedAt: formatDate(conflict.localData.updated_at),
    },
    server: {
      due: formatDate(new Date(conflict.serverData.due)),
      interval: formatInterval(conflict.serverData.interval),
      state: stateLabels[conflict.serverData.state] ?? conflict.serverData.state,
      repetitions: conflict.serverData.repetitions,
      updatedAt: formatDate(new Date(conflict.serverData.updated_at)),
    },
    differences: conflict.fieldDifferences,
  }
}
