/**
 * 学習セッション内の「次に出すカード」を選ぶ純ロジック。
 *
 * 待ち時間解消（learn-ahead）: main キューが空で、次に予定された学習カードの
 * 期限が「learn-ahead しきい値（既定20分）」以内なら、待たせずに前倒しで今出す。
 * しきい値を超えるときだけ従来どおり待機（waiting）にフォールバックする。
 *
 * スケジューラ（間隔計算）には一切触れない表示専用の並べ替えロジック。
 * カードの中身は見ないので、カード型 T に対してジェネリック。
 */

/** learn-ahead の既定しきい値（分）。Anki の learn-ahead limit 相当。 */
export const LEARN_AHEAD_LIMIT_MINUTES = 20

/** 再提示待ちの学習カード（dueAt は Date.now() のタイムスタンプ） */
export interface QueueLearningItem<T> {
  card: T
  dueAt: number
}

/** 次に出すカードの判定結果 */
export interface QueuePick<T> {
  card: T | null
  /** 学習キュー由来（＝セッション内再提示 or 前倒し）か */
  fromLearning: boolean
  /** 出せるカードが無く、学習カードの期限待ちで待機すべきか */
  waiting: boolean
}

/**
 * キューから次のカードを選ぶ。優先順位:
 * 1. 期限到来済みの学習カード（最短 due）
 * 2. main キュー（新規・復習）の未処理カード
 * 3. main が空: 最短 due の学習カードが learnAheadMs 以内なら前倒しで出す（learn-ahead）／
 *    超えるなら waiting
 * 4. すべて空ならセッション完了（card=null, waiting=false）
 */
export function pickFromQueues<T>(params: {
  mainQueue: T[]
  mainIndex: number
  learningQueue: QueueLearningItem<T>[]
  now: number
  learnAheadMs?: number
}): QueuePick<T> {
  const { mainQueue, mainIndex, learningQueue, now } = params
  const learnAheadMs = params.learnAheadMs ?? LEARN_AHEAD_LIMIT_MINUTES * 60_000

  // due 昇順で並べる（最短期限が先頭）
  const sorted = [...learningQueue].sort((a, b) => a.dueAt - b.dueAt)

  // 1. 期限到来済みの学習カードが最優先
  if (sorted.length > 0 && sorted[0].dueAt <= now) {
    return { card: sorted[0].card, fromLearning: true, waiting: false }
  }

  // 2. main キューに未処理カードがあれば出す
  if (mainIndex < mainQueue.length) {
    return { card: mainQueue[mainIndex], fromLearning: false, waiting: false }
  }

  // 3. main が空 — 学習カードが残っている
  if (sorted.length > 0) {
    // learn-ahead: しきい値以内なら待たせずに前倒しで出す
    if (sorted[0].dueAt - now <= learnAheadMs) {
      return { card: sorted[0].card, fromLearning: true, waiting: false }
    }
    // しきい値超え（学習ステップが長い稀なケース）は従来どおり待機
    return { card: null, fromLearning: false, waiting: true }
  }

  // 4. すべて空 = セッション完了
  return { card: null, fromLearning: false, waiting: false }
}
