'use client'

/**
 * ペン入力のお手本・実書き蓄積の読み込みと保存（2026-09-01）。
 *
 * 照合対象は三段重ね（すべて UserTemplateStore の形）:
 * 1. 塾の共通お手本集（全員の土台・名前を付けない形・DB）
 * 2. 本人の蓄積（利用者ごと・DB＝端末をまたいで引き継げる）
 * 3. 端末内のお手本（従来の localStorage。オフライン・DB未適用時の逃げ道）
 *
 * - 練習を開くときに DB から読み込む。判定そのものは従来どおり端末内・書いた瞬間
 * - 読み込めないとき（オフライン・マイグレーション未適用）は前回の写し
 *   （localStorage のキャッシュ）→ それも無ければ端末内のお手本だけで動く
 * - **移行**: DB側に本人の蓄積が1件も無く、端末内にお手本があれば、初回に
 *   そのまま DB へ写す（既存の端末内保存を捨てない・指示書の指定）
 * - 初回お手本登録の要否（needsEnrollment）の判定には**本人のぶんだけ**を使う。
 *   共通お手本集があるからといって登録を免除しない（本人の字との相対比較が
 *   閉じ括弧の見分けに要るため）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PenStroke, SymbolId } from '@/lib/pen-syntax/types'
import type { UserTemplateStore } from '@/lib/pen-syntax/letters'
import { loadUserTemplates, saveUserTemplate, clearUserTemplates } from '@/lib/pen-syntax/user-templates'
import { mergeStores, type SampleSource } from '@/lib/pen-syntax/sample-store'

export interface PenSampleUpload {
  symbol: SymbolId
  strokes: PenStroke[]
  source: SampleSource
}

const CACHE_PREFIX = 'pen-syntax-samples-cache-v1'

function cacheKey(userId: string | null | undefined): string {
  return `${CACHE_PREFIX}:${userId || 'anon'}`
}

interface CachedStores {
  personal: UserTemplateStore
  shared: UserTemplateStore
}

function loadCache(userId: string | null | undefined): CachedStores | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    return { personal: parsed.personal ?? {}, shared: parsed.shared ?? {} }
  } catch {
    return null
  }
}

function saveCache(userId: string | null | undefined, stores: CachedStores): void {
  try {
    window.localStorage.setItem(cacheKey(userId), JSON.stringify(stores))
  } catch {
    // 保存できなくても動作は続ける
  }
}

export interface PenTemplates {
  /** 判別に渡す照合対象（共通＋本人＋端末内） */
  store: UserTemplateStore
  /** 本人のぶんだけ（初回お手本登録の要否・登録数の表示に使う） */
  personalStore: UserTemplateStore
  /** 端末内の読み込みが済んだか */
  ready: boolean
  /** DBへの問い合わせが済んだか（成功・失敗を問わず）。初回登録の要否判定はこれを待つ */
  synced: boolean
  /** お手本登録の保存（端末内＋DBの両方へ） */
  saveEnrollment: (symbol: SymbolId, strokes: PenStroke[]) => void
  /** その記号のお手本を消す（端末内＋DBの本人の蓄積。共通お手本集は消えない） */
  clearEnrollment: (symbol?: SymbolId) => void
  /** 確定して訂正されなかった線をためる（採点したときにまとめて呼ぶ・送信は裏で） */
  uploadSamples: (samples: PenSampleUpload[]) => void
}

export function usePenTemplates(
  userId: string | null | undefined,
  authLoading: boolean,
): PenTemplates {
  const [local, setLocal] = useState<UserTemplateStore>({})
  const [personalDb, setPersonalDb] = useState<UserTemplateStore>({})
  const [shared, setShared] = useState<UserTemplateStore>({})
  const [ready, setReady] = useState(false)
  const [synced, setSynced] = useState(false)
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  useEffect(() => {
    if (authLoading) return
    let alive = true
    const localStore = loadUserTemplates(userId)
    setLocal(localStore)
    // まず前回の写しで立ち上げ、裏で最新を取りに行く（オフラインでも従来どおり動く）
    const cached = loadCache(userId)
    if (cached) {
      setPersonalDb(cached.personal)
      setShared(cached.shared)
    }
    setReady(true)
    setSynced(false)
    fetch('/api/pen-samples')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { personal?: UserTemplateStore; shared?: UserTemplateStore; available?: boolean } | null) => {
        if (!alive) return
        setSynced(true)
        if (!data) return
        const personal = data.personal ?? {}
        const sharedStore = data.shared ?? {}
        setPersonalDb(personal)
        setShared(sharedStore)
        saveCache(userId, { personal, shared: sharedStore })
        // 移行: DB側が空で端末内にお手本があれば、そのまま DB へ写す（1回だけ）
        if (data.available && Object.keys(personal).length === 0) {
          const samples: PenSampleUpload[] = []
          for (const symbol of Object.keys(localStore)) {
            for (const strokes of localStore[symbol] ?? []) {
              if (strokes.length > 0) {
                samples.push({ symbol: symbol as SymbolId, strokes, source: 'enrolled' })
              }
            }
          }
          if (samples.length > 0) {
            fetch('/api/pen-samples', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ samples }),
            }).catch(() => {})
          }
        }
      })
      .catch(() => {
        // オフライン等: 端末内のお手本＋前回の写しで動く
        if (alive) setSynced(true)
      })
    return () => {
      alive = false
    }
  }, [authLoading, userId])

  const post = useCallback((samples: PenSampleUpload[]) => {
    if (samples.length === 0) return
    fetch('/api/pen-samples', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples }),
    }).catch(() => {
      // 送れなくても学習の流れは止めない（次回の採点でまた新しい線がたまる）
    })
  }, [])

  const saveEnrollment = useCallback(
    (symbol: SymbolId, strokes: PenStroke[]) => {
      setLocal(saveUserTemplate(userIdRef.current, symbol, strokes))
      post([{ symbol, strokes, source: 'enrolled' }])
    },
    [post],
  )

  const clearEnrollment = useCallback((symbol?: SymbolId) => {
    setLocal(clearUserTemplates(userIdRef.current, symbol))
    if (symbol) {
      setPersonalDb((prev) => {
        const next = { ...prev }
        delete next[symbol]
        return next
      })
      fetch(`/api/pen-samples?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' }).catch(() => {})
    }
  }, [])

  const uploadSamples = useCallback(
    (samples: PenSampleUpload[]) => {
      if (samples.length === 0) return
      // 送った線はすぐ手元の照合対象にも足す（次の1文から効く）
      setPersonalDb((prev) => {
        const next: UserTemplateStore = { ...prev }
        for (const s of samples) {
          next[s.symbol] = [...(next[s.symbol] ?? []), s.strokes]
        }
        return next
      })
      post(samples)
    },
    [post],
  )

  const store = useMemo(() => mergeStores(shared, personalDb, local), [shared, personalDb, local])
  const personalStore = useMemo(() => mergeStores(personalDb, local), [personalDb, local])

  return { store, personalStore, ready, synced, saveEnrollment, clearEnrollment, uploadSamples }
}
