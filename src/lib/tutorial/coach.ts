/**
 * コーチマーク（画面ごとの初回1回だけ出すヒント）の既読管理。
 * まずは端末ローカル（localStorage）。端末をまたいで同期したくなったら
 * profiles のメタデータに昇格する。
 */

const PREFIX = 'tsubame.coach.'

export function hasSeenCoach(id: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(PREFIX + id) === '1'
  } catch {
    return true // storage が使えない環境では出さない（邪魔しない側に倒す）
  }
}

export function markCoachSeen(id: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFIX + id, '1')
  } catch {
    // ignore
  }
}
