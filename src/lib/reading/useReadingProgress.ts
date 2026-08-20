'use client'

/**
 * 途中保存と再開のつなぎ込み。
 *
 * - 開いた瞬間は端末の中の控え（localStorage）から即座に復元する
 * - 同時にサーバーへも問い合わせ、新しいほうを採る（別の端末で続きから開ける）
 * - 入力のたびに端末へ即保存し、サーバーへは少し待ってからまとめて送る
 * - サーバーの置き場所がまだ無いときは「この端末にだけ保存」に切り替える（入力は失わない）
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReadingLessonData, ReadingProgressState } from './types'
import { emptyProgress, pickNewer, progressChanged, reconcileProgress } from './progress'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'local-only' | 'error'

const SAVE_DELAY_MS = 1200

function localKey(userId: string, lessonId: string) {
  return `reading-progress:${userId}:${lessonId}`
}

function readLocal(userId: string, lessonId: string): ReadingProgressState | null {
  try {
    const raw = localStorage.getItem(localKey(userId, lessonId))
    return raw ? (JSON.parse(raw) as ReadingProgressState) : null
  } catch {
    return null
  }
}

function writeLocal(userId: string, lessonId: string, state: ReadingProgressState) {
  try {
    localStorage.setItem(localKey(userId, lessonId), JSON.stringify(state))
  } catch {
    // 端末の保存領域がいっぱい等。サーバー保存が生きていれば失われない
  }
}

interface UseReadingProgressResult {
  state: ReadingProgressState | null
  /** 状態を書き換える。保存は自動 */
  update: (fn: (prev: ReadingProgressState) => ReadingProgressState) => void
  status: SaveStatus
  /** 保存に失敗したときの手動再試行 */
  retry: () => void
  loaded: boolean
}

export function useReadingProgress(
  userId: string | null,
  lessonId: string | null,
  data: ReadingLessonData | null
): UseReadingProgressResult {
  const [state, setState] = useState<ReadingProgressState | null>(null)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [loaded, setLoaded] = useState(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<ReadingProgressState | null>(null)
  const localOnly = useRef(false)

  const pushToServer = useCallback(
    async (next: ReadingProgressState) => {
      if (!lessonId) return
      if (localOnly.current) {
        setStatus('local-only')
        return
      }
      setStatus('saving')
      try {
        const res = await fetch('/api/reading/progress', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId, state: next }),
        })
        if (res.status === 503) {
          const body = await res.json().catch(() => ({}))
          if (body.code === 'TABLE_MISSING') {
            localOnly.current = true
            setStatus('local-only')
            return
          }
        }
        if (!res.ok) {
          setStatus('error')
          return
        }
        const body = await res.json().catch(() => ({}))
        if (body.conflict && body.progress?.state && data && lessonId) {
          // 別の端末のほうが新しかった。そちらに合わせる
          const adopted = reconcileProgress(body.progress.state, lessonId, data)
          setState(adopted)
          if (userId) writeLocal(userId, lessonId, adopted)
        }
        setStatus('saved')
      } catch {
        setStatus('error')
      }
    },
    [lessonId, data, userId]
  )

  // 読み込み: 端末の控え → サーバー、新しいほうを採る
  useEffect(() => {
    if (!userId || !lessonId || !data) return
    let cancelled = false
    setLoaded(false)

    const local = readLocal(userId, lessonId)
    const localReconciled = local ? reconcileProgress(local, lessonId, data) : null
    if (localReconciled && !cancelled) {
      setState(localReconciled)
      setLoaded(true)
    }

    ;(async () => {
      let remote: ReadingProgressState | null = null
      try {
        const res = await fetch(`/api/reading/progress?lessonId=${encodeURIComponent(lessonId)}`)
        if (res.status === 503) {
          const body = await res.json().catch(() => ({}))
          if (body.code === 'TABLE_MISSING') {
            localOnly.current = true
            if (!cancelled) setStatus('local-only')
          }
        } else if (res.ok) {
          const body = await res.json()
          if (body.progress?.state) remote = body.progress.state as ReadingProgressState
        }
      } catch {
        // オフライン。端末の控えで続ける
      }
      if (cancelled) return
      const remoteReconciled = remote ? reconcileProgress(remote, lessonId, data) : null
      const chosen = pickNewer(localReconciled, remoteReconciled) ?? emptyProgress(lessonId, data)
      setState(chosen)
      writeLocal(userId, lessonId, chosen)
      setLoaded(true)
    })()

    return () => {
      cancelled = true
    }
  }, [userId, lessonId, data])

  const update = useCallback(
    (fn: (prev: ReadingProgressState) => ReadingProgressState) => {
      setState((prev) => {
        if (!prev) return prev
        const draft = fn(prev)
        if (!progressChanged(prev, draft)) return prev
        const next = { ...draft, updatedAt: new Date().toISOString() }
        if (userId && lessonId) writeLocal(userId, lessonId, next)
        pending.current = next
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          const p = pending.current
          pending.current = null
          if (p) void pushToServer(p)
        }, SAVE_DELAY_MS)
        return next
      })
    },
    [userId, lessonId, pushToServer]
  )

  const retry = useCallback(() => {
    localOnly.current = false
    if (state) void pushToServer(state)
  }, [state, pushToServer])

  // 画面を離れるときは待たずに送る
  useEffect(() => {
    const flush = () => {
      const p = pending.current
      if (!p) return
      pending.current = null
      if (timer.current) clearTimeout(timer.current)
      void pushToServer(p)
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
      flush()
    }
  }, [pushToServer])

  return { state, update, status, retry, loaded }
}
