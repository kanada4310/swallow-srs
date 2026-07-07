'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { StudyCard } from './StudyCard'
import { MultiStepCard } from './MultiStepCard'
import { KobunTangoCard } from './KobunTangoCard'
import { isMultiStepNote, type EaseValue, type StepResult } from '@/lib/multi-step'
import { isKobunTangoNote } from '@/lib/kobun-tango'
import {
  Ease,
  getNextIntervalPreview,
  calculateNextReview,
  checkLeech,
  resolveDeckSettings,
  type CardSchedule,
} from '@/lib/srs/scheduler'
import type { FieldValues } from '@/lib/template'
import { saveAnswerLocally, undoAnswerLocally, pushToServer, getSyncStatus } from '@/lib/db/sync'
import { getCardState, getCreatureState, saveCreatureState, getCreatureStatesMap, type LocalCardState } from '@/lib/db/schema'
import { isOnline as checkOnline } from '@/lib/db/utils'
import { SyncStatusBadge } from '@/components/ui/SyncStatusBadge'
import { ImprintPicker } from '@/components/garden/ImprintPicker'
import { IsoTile } from '@/components/garden/IsoTile'
import { PlantSprite } from '@/components/garden/PlantSprite'
import { pickLabel } from '@/lib/garden/garden-data'
import { pickVarietyByHash, getVariety, type Variety } from '@/lib/garden/varieties'
import { derivePlantState, GROWTH_ORDER, type GrowthStage } from '@/lib/garden/plant-state'
import { GARDEN_ENABLED } from '@/lib/garden/feature'
import { useStreak } from '@/lib/stats/useStreak'
import { SwallowMark } from '@/components/ui/SwallowMark'
import { CoachTip } from '@/components/ui/CoachTip'
import { hasSeenCoach, markCoachSeen } from '@/lib/tutorial/coach'
import Link from 'next/link'
import type { GeneratedContent, FieldDefinition, DeckSettings, CreatureImprint } from '@/types/database'

/** セッション中に段階が上がった株（学習完了演出用） */
interface GrowthEvent {
  noteId: string
  label: string
  from: GrowthStage
  to: GrowthStage
}

const GROWTH_LABEL_SHORT: Record<GrowthStage, string> = {
  seed: '種', sprout: '芽', seedling: '苗', mature: '成株', blooming: '開花',
}

/** CardSchedule から成長段階を導く（care は使わないので now は任意） */
function growthOf(schedule: CardSchedule, now: Date): GrowthStage {
  return derivePlantState(
    {
      state: schedule.state,
      stability: schedule.stability ?? null,
      interval: schedule.interval,
      due: schedule.due,
      lapses: schedule.lapses ?? 0,
    },
    now
  ).growth
}

interface CardData {
  id: string
  noteId: string
  fieldValues: FieldValues
  audioUrls: Record<string, string> | null
  generatedContent: GeneratedContent | null
  template: {
    front: string
    back: string
    css: string
  }
  fields?: FieldDefinition[]
  clozeNumber?: number
  schedule: CardSchedule
}

interface LearningQueueItem {
  card: CardData
  dueAt: number // Date.now() timestamp
}

interface UndoSnapshot {
  answeredCard: CardData
  previousSchedule: CardSchedule
  previousMainIndex: number
  previousLearningQueue: LearningQueueItem[]
  previousFromLearningQueue: boolean
  previousGraduatedCount: number
  previousStats: { reviewed: number; correct: number }
  previousCardState: LocalCardState | null
  reviewLogId: string
  serverSyncFired: boolean
  answeredAt: number
}

interface StudySessionProps {
  deckId?: string
  priorityCardId?: string
  deckName: string
  initialCards: CardData[]
  userId: string
  deckSettings?: Partial<DeckSettings>
  /** 練習モード（繰り上げ学習）。回答を card_states / review_logs に永続化しない */
  practiceMode?: boolean
  /** 完了画面の「もっと練習する」ボタン押下時に呼ばれる（親が練習カードを取得して再マウント） */
  onRequestPractice?: () => void
  /** 練習カードを取得中（ボタンをローディング表示にする） */
  practiceLoading?: boolean
  /** 繰り上げられるカードが無かった（ボタンの代わりにメッセージを出す） */
  practiceUnavailable?: boolean
}

/**
 * Reorder cards so that priorityCardId is first (if found).
 * Used when launching from LINE notification to show the previewed card first.
 */
function reorderWithPriority(cards: CardData[], priorityCardId?: string): CardData[] {
  if (!priorityCardId) return cards
  const idx = cards.findIndex(c => c.id === priorityCardId)
  if (idx <= 0) return cards // not found or already first
  const reordered = [...cards]
  const [priorityCard] = reordered.splice(idx, 1)
  reordered.unshift(priorityCard)
  return reordered
}

export function StudySession({ deckId, priorityCardId, deckName, initialCards, userId, deckSettings, practiceMode = false, onRequestPractice, practiceLoading = false, practiceUnavailable = false }: StudySessionProps) {
  // Queue-based state (reorder to put priority card first if specified)
  const [mainQueue] = useState<CardData[]>(() => reorderWithPriority(initialCards, priorityCardId))
  const [mainIndex, setMainIndex] = useState(0)
  const [learningQueue, setLearningQueue] = useState<LearningQueueItem[]>([])
  const [currentCard, setCurrentCard] = useState<CardData | null>(() => reorderWithPriority(initialCards, priorityCardId)[0] ?? null)
  const [fromLearningQueue, setFromLearningQueue] = useState(false)
  const [totalCards] = useState(initialCards.length)
  const [graduatedCount, setGraduatedCount] = useState(0)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stats, setStats] = useState({ reviewed: 0, correct: 0 })
  const [isOnline, setIsOnline] = useState(true)
  const [leechNotification, setLeechNotification] = useState<string | null>(null)
  const [isWaiting, setIsWaiting] = useState(false)
  const [autoFlipTrigger, setAutoFlipTrigger] = useState(false)
  const [isCardFlipped, setIsCardFlipped] = useState(false)
  const [autoAgainCountdown, setAutoAgainCountdown] = useState<number | null>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null)
  // 記憶のいきもの育成（Phase 10.4）— 初回出題時の品種インプリント
  const [imprintPrompt, setImprintPrompt] = useState<{ noteId: string; word: string } | null>(null)
  const resolvedNotesRef = useRef<Set<string>>(new Set())
  // ノート→品種（完了演出のスプライト描画用）
  const [imprintMap, setImprintMap] = useState<Map<string, CreatureImprint>>(new Map())
  // セッション中の成長（段階アップ）演出（Phase 10.2 残）
  const [grownEvents, setGrownEvents] = useState<GrowthEvent[]>([])
  const growthBaselineRef = useRef<Map<string, GrowthStage>>(new Map())
  // 回答ごとの「水やり→成長」リアルタイム演出（非ブロッキング・一時オーバーレイ）
  const [waterFx, setWaterFx] = useState<{ key: number; grewTo: GrowthStage | null; variety?: Variety } | null>(null)
  const fxKeyRef = useRef(0)
  const fxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardStartTime = useRef<number>(Date.now())
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleAnswerRef = useRef<(ease: Ease) => void>(() => {})

  const settings = resolveDeckSettings(deckSettings)
  // 完了画面のストリーク表示用（Dexie 駆動・オフライン可）
  const streak = useStreak(userId)
  // コーチマーク: 初回だけ評価ボタンの意味を説明（マウント後に判定＝SSR/水和ずれ回避）
  const [showAnswerCoach, setShowAnswerCoach] = useState(false)
  useEffect(() => {
    if (!hasSeenCoach('answer-buttons')) setShowAnswerCoach(true)
  }, [])

  // Pick next card from queues
  const pickNextCard = useCallback((
    currentMainIndex: number,
    currentLearningQueue: LearningQueueItem[]
  ): { card: CardData | null; fromLearning: boolean; waiting: boolean } => {
    const now = Date.now()

    // Sort learning queue by due time
    const sorted = [...currentLearningQueue].sort((a, b) => a.dueAt - b.dueAt)

    // Check if any learning card is due
    if (sorted.length > 0 && sorted[0].dueAt <= now) {
      return { card: sorted[0].card, fromLearning: true, waiting: false }
    }

    // Try main queue
    if (currentMainIndex < mainQueue.length) {
      return { card: mainQueue[currentMainIndex], fromLearning: false, waiting: false }
    }

    // No main queue cards left — check if learning cards are pending
    if (sorted.length > 0) {
      return { card: null, fromLearning: false, waiting: true }
    }

    // Session complete
    return { card: null, fromLearning: false, waiting: false }
  }, [mainQueue])

  // Track online status
  useEffect(() => {
    setIsOnline(checkOnline())

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Reset timer and flip state when current card changes
  useEffect(() => {
    cardStartTime.current = Date.now()
    setAutoFlipTrigger(false)
    setIsCardFlipped(false)
    setAutoAgainCountdown(null)
  }, [currentCard])

  // 初回出題時の品種インプリント（Phase 10.4）。
  // 未学習(new)で、まだ品種が刻まれていないノートだけ、学習前に1度だけ選ばせる。
  useEffect(() => {
    let cancelled = false
    // 練習モードでは品種インプリント（API 永続化を伴う）を出さない
    if (!GARDEN_ENABLED || practiceMode || !currentCard || currentCard.schedule.state !== 'new') {
      setImprintPrompt(null)
      return
    }
    const noteId = currentCard.noteId
    if (resolvedNotesRef.current.has(noteId)) {
      setImprintPrompt(null)
      return
    }
    getCreatureState(userId, noteId)
      .then((cs) => {
        if (cancelled) return
        if (cs) {
          resolvedNotesRef.current.add(noteId)
          setImprintPrompt(null)
        } else {
          setImprintPrompt({ noteId, word: pickLabel(currentCard.fieldValues) })
        }
      })
      .catch(() => {
        // 取得失敗時はプロンプトを出さない（学習を妨げない）
        if (!cancelled) setImprintPrompt(null)
      })
    return () => {
      cancelled = true
    }
  }, [currentCard, userId, practiceMode])

  // 完了演出のスプライト用に、ノート→品種の対応を読み込む（オフライン可）
  useEffect(() => {
    if (!GARDEN_ENABLED) return
    getCreatureStatesMap(userId).then(setImprintMap).catch(() => {})
  }, [userId])

  // FX タイマーのクリーンアップ
  useEffect(() => {
    return () => {
      if (fxTimerRef.current) clearTimeout(fxTimerRef.current)
    }
  }, [])

  // 品種を確定して保存（Dexie 即時 ＋ サーバー upsert は fire-and-forget）
  const commitImprint = useCallback(
    (noteId: string, variety: Variety) => {
      resolvedNotesRef.current.add(noteId)
      setImprintPrompt(null)
      setImprintMap((prev) => new Map(prev).set(noteId, { variety: variety.id }))
      saveCreatureState(userId, noteId, { variety: variety.id }).catch((e) =>
        console.warn('Failed to save imprint locally:', e)
      )
      if (checkOnline()) {
        fetch('/api/garden/imprint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteId, variety: variety.id }),
        }).catch((e) => console.warn('Failed to sync imprint:', e))
      }
    },
    [userId]
  )

  // 「あとで」= 今回はスキップ（このセッション中は再プロンプトしない・汎用の姿で学習）
  const skipImprint = useCallback((noteId: string) => {
    resolvedNotesRef.current.add(noteId)
    setImprintPrompt(null)
  }, [])

  // Try to sync when coming back online
  useEffect(() => {
    if (isOnline) {
      const { pendingCount } = getSyncStatus()
      if (pendingCount > 0) {
        pushToServer().catch(console.warn)
      }
    }
  }, [isOnline])

  // Auto-dismiss leech notification
  useEffect(() => {
    if (leechNotification) {
      const timer = setTimeout(() => setLeechNotification(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [leechNotification])

  // Timer for waiting on learning queue cards
  useEffect(() => {
    if (!isWaiting || learningQueue.length === 0) return

    const sorted = [...learningQueue].sort((a, b) => a.dueAt - b.dueAt)
    const nextDue = sorted[0].dueAt
    const delay = Math.max(0, nextDue - Date.now())

    waitTimerRef.current = setTimeout(() => {
      setIsWaiting(false)
      // Pick the now-due learning card
      const result = pickNextCard(mainIndex, learningQueue)
      if (result.card) {
        setCurrentCard(result.card)
        setFromLearningQueue(result.fromLearning)
      }
    }, delay)

    return () => {
      if (waitTimerRef.current) {
        clearTimeout(waitTimerRef.current)
      }
    }
  }, [isWaiting, learningQueue, mainIndex, pickNextCard])

  // Also check learning queue periodically when processing main queue
  // (a learning card might become due while user is reviewing main queue cards)
  useEffect(() => {
    if (isWaiting || !currentCard || learningQueue.length === 0) return

    const sorted = [...learningQueue].sort((a, b) => a.dueAt - b.dueAt)
    const nextDue = sorted[0].dueAt
    const now = Date.now()

    // If a learning card is already due and we're showing a main queue card that hasn't been answered yet,
    // we don't interrupt — the user will see it after answering the current card.
    // But if not due yet, set a timer to check when it becomes due (in case user is slow)
    if (nextDue > now && !fromLearningQueue) {
      const timer = setTimeout(() => {
        // Don't interrupt current card, just mark that we should check on next pick
      }, nextDue - now)
      return () => clearTimeout(timer)
    }
  }, [learningQueue, currentCard, isWaiting, fromLearningQueue])

  // Auto-again countdown: decrement every second, auto-answer at 0
  useEffect(() => {
    if (autoAgainCountdown === null || autoAgainCountdown <= 0) {
      if (autoAgainCountdown === 0) {
        handleAnswerRef.current(Ease.Again)
      }
      return
    }
    const timer = setTimeout(() => {
      setAutoAgainCountdown(prev => prev !== null ? prev - 1 : null)
    }, 1000)
    return () => clearTimeout(timer)
  }, [autoAgainCountdown])

  // Auto-dismiss undo banner after 10 seconds
  useEffect(() => {
    if (undoSnapshot) {
      undoTimerRef.current = setTimeout(() => {
        setUndoSnapshot(null)
      }, 10000)
      return () => {
        if (undoTimerRef.current) {
          clearTimeout(undoTimerRef.current)
          undoTimerRef.current = null
        }
      }
    }
  }, [undoSnapshot])

  // Timer time-up handler
  const handleTimeUp = useCallback(() => {
    if (settings.timer_action === 'flip') {
      setAutoFlipTrigger(true)
    } else if (settings.timer_action === 'auto_again') {
      setAutoFlipTrigger(true)
      setAutoAgainCountdown(5)
    }
    // timer_action === 'none': do nothing
  }, [settings.timer_action])

  const handleAnswer = (
    ease: Ease,
    extra?: { score?: number | null; stepResults?: StepResult[] | null }
  ) => {
    if (!currentCard || isSubmitting) return

    setIsSubmitting(true)
    const score = extra?.score ?? null
    const stepResults = extra?.stepResults ?? null
    const timeMs = Date.now() - cardStartTime.current
    const now = new Date()
    const cardId = currentCard.id
    const lastInterval = currentCard.schedule.interval
    const reviewLogId = crypto.randomUUID()

    // Capture snapshot for undo BEFORE modifying state
    const snapshotCard = currentCard
    const snapshotMainIndex = mainIndex
    const snapshotLearningQueue = [...learningQueue]
    const snapshotFromLearning = fromLearningQueue
    const snapshotGraduated = graduatedCount
    const snapshotStats = { ...stats }

    try {
      // Calculate new schedule locally
      const newSchedule = calculateNextReview(currentCard.schedule, ease, now, deckSettings)

      // 成長（段階アップ）の検出・回答ごとの演出（庭機能が有効なときのみ）
      if (GARDEN_ENABLED) {
        // セッション開始時の段階をノートごとに基準として保持し、最新段階と比べる。
        const growthNoteId = currentCard.noteId
        if (!growthBaselineRef.current.has(growthNoteId)) {
          growthBaselineRef.current.set(growthNoteId, growthOf(currentCard.schedule, now))
        }
        const baselineStage = growthBaselineRef.current.get(growthNoteId)!
        const preStage = growthOf(currentCard.schedule, now)
        const postStage = growthOf(newSchedule, now)
        if (GROWTH_ORDER[postStage] > GROWTH_ORDER[baselineStage]) {
          const label = pickLabel(currentCard.fieldValues)
          setGrownEvents((prev) => [
            ...prev.filter((e) => e.noteId !== growthNoteId),
            { noteId: growthNoteId, label, from: baselineStage, to: postStage },
          ])
        } else {
          // Again などで基準まで戻った場合は演出から外す
          setGrownEvents((prev) => prev.filter((e) => e.noteId !== growthNoteId))
        }

        // 回答ごとの一時演出（非ブロッキング）。この回答で段階が上がれば「成長ポップ」、
        // それ以外でも正答（Good/Easy）なら「水やり」しずく。Again/Hard は出さない（うるさくしない）。
        const grewThisAnswer = GROWTH_ORDER[postStage] > GROWTH_ORDER[preStage]
        if (grewThisAnswer || ease >= Ease.Good) {
          const fxVariety = getVariety(imprintMap.get(growthNoteId)?.variety)
          fxKeyRef.current += 1
          setWaterFx({ key: fxKeyRef.current, grewTo: grewThisAnswer ? postStage : null, variety: fxVariety })
          if (fxTimerRef.current) clearTimeout(fxTimerRef.current)
          fxTimerRef.current = setTimeout(() => setWaterFx(null), 1100)
        }
      }

      // Check for leech
      let isSuspended = false
      if (ease === Ease.Again && newSchedule.lapses > (currentCard.schedule.lapses || 0)) {
        const isLeech = checkLeech(newSchedule, settings)
        if (isLeech) {
          setLeechNotification(`このカードはリーチです（失念回数: ${newSchedule.lapses}回）`)
          if (settings.leech_action === 'suspend') {
            newSchedule.state = 'suspended'
            isSuspended = true
          }
        }
      }

      // Update stats
      setStats(prev => ({
        reviewed: prev.reviewed + 1,
        correct: ease >= Ease.Good ? prev.correct + 1 : prev.correct,
      }))

      // Determine what to do with this card
      const updatedCard: CardData = { ...currentCard, schedule: newSchedule }
      let newLearningQueue = [...learningQueue]

      // Remove from learning queue if it came from there
      if (fromLearningQueue) {
        newLearningQueue = newLearningQueue.filter(item => item.card.id !== currentCard.id)
      }

      // Determine next main index
      let newMainIndex = mainIndex
      if (!fromLearningQueue) {
        newMainIndex = mainIndex + 1
      }

      // Add to learning queue or count as graduated
      if (!isSuspended && (newSchedule.state === 'learning' || newSchedule.state === 'relearning')) {
        // Card needs re-presentation — add to learning queue
        newLearningQueue.push({
          card: updatedCard,
          dueAt: newSchedule.due.getTime(),
        })
      } else {
        // Card graduated (review state) or suspended — done for this session
        setGraduatedCount(prev => prev + 1)
      }

      setLearningQueue(newLearningQueue)
      setMainIndex(newMainIndex)

      // Clear previous undo snapshot and timer
      setUndoSnapshot(null)
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current)
        undoTimerRef.current = null
      }

      // Reset timer state before switching cards (must be synchronous, not in useEffect)
      setAutoFlipTrigger(false)
      setIsCardFlipped(false)
      setAutoAgainCountdown(null)

      // Pick next card
      const next = pickNextCard(newMainIndex, newLearningQueue)
      if (next.card) {
        setCurrentCard(next.card)
        setFromLearningQueue(next.fromLearning)
        setIsWaiting(false)
      } else if (next.waiting) {
        setCurrentCard(null)
        setFromLearningQueue(false)
        setIsWaiting(true)
      } else {
        // Session complete
        setCurrentCard(null)
        setFromLearningQueue(false)
        setIsWaiting(false)
      }

      setIsSubmitting(false)

      // 練習モードでは card_states / review_logs を一切更新しない（純粋な追加練習）。
      // ローカル計算した newSchedule はキュー再提示の判定だけに使い、永続化はしない。
      if (practiceMode) {
        return
      }

      // Fetch current card_state from IndexedDB for undo (async, non-blocking)
      getCardState(userId, cardId).then(previousCardState => {
        const snapshot: UndoSnapshot = {
          answeredCard: snapshotCard,
          previousSchedule: snapshotCard.schedule,
          previousMainIndex: snapshotMainIndex,
          previousLearningQueue: snapshotLearningQueue,
          previousFromLearningQueue: snapshotFromLearning,
          previousGraduatedCount: snapshotGraduated,
          previousStats: snapshotStats,
          previousCardState: previousCardState ?? null,
          reviewLogId,
          serverSyncFired: false,
          answeredAt: Date.now(),
        }

        // Save locally and sync in background (non-blocking)
        saveAnswerLocally(
          userId,
          cardId,
          ease,
          {
            due: newSchedule.due,
            interval: newSchedule.interval,
            easeFactor: newSchedule.easeFactor,
            repetitions: newSchedule.repetitions,
            state: newSchedule.state,
            learningStep: newSchedule.learningStep,
            lapses: newSchedule.lapses,
            stability: newSchedule.stability,
            difficulty: newSchedule.difficulty,
            elapsed_days: newSchedule.elapsed_days,
            scheduled_days: newSchedule.scheduled_days,
            last_review: newSchedule.last_review,
          },
          lastInterval,
          timeMs,
          reviewLogId,
          deckId,
          score,
          stepResults
        ).then(() => {
          // Set undo snapshot after local save completes
          setUndoSnapshot(prev => {
            // Only update if this is still the current snapshot (not overwritten by a newer answer)
            if (prev === null) return snapshot
            return prev
          })

          if (isOnline) {
            snapshot.serverSyncFired = true
            fetch('/api/study/answer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cardId, ease, timeMs, deckId, score, stepResults }),
            }).catch(syncError => {
              console.warn('Server sync failed, will retry later:', syncError)
            })
          }
        }).catch(error => {
          console.error('Error saving answer locally:', error)
        })

        // Set undo snapshot immediately (before local save, so user sees the banner right away)
        setUndoSnapshot(snapshot)
      }).catch(() => {
        // If we can't get previous state, still save the answer but without undo
        saveAnswerLocally(
          userId,
          cardId,
          ease,
          {
            due: newSchedule.due,
            interval: newSchedule.interval,
            easeFactor: newSchedule.easeFactor,
            repetitions: newSchedule.repetitions,
            state: newSchedule.state,
            learningStep: newSchedule.learningStep,
            lapses: newSchedule.lapses,
            stability: newSchedule.stability,
            difficulty: newSchedule.difficulty,
            elapsed_days: newSchedule.elapsed_days,
            scheduled_days: newSchedule.scheduled_days,
            last_review: newSchedule.last_review,
          },
          lastInterval,
          timeMs,
          reviewLogId,
          deckId,
          score,
          stepResults
        ).then(() => {
          if (isOnline) {
            fetch('/api/study/answer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cardId, ease, timeMs, deckId, score, stepResults }),
            }).catch(syncError => {
              console.warn('Server sync failed, will retry later:', syncError)
            })
          }
        }).catch(error => {
          console.error('Error saving answer locally:', error)
        })
      })
    } catch (error) {
      console.error('Error processing answer:', error)
      setIsSubmitting(false)
    }
  }

  const handleUndo = () => {
    if (!undoSnapshot) return

    const snapshot = undoSnapshot

    // Clear undo state immediately
    setUndoSnapshot(null)
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }

    // Restore React state
    setCurrentCard(snapshot.answeredCard)
    // 成長演出からも外す（再回答されれば再評価される）
    setGrownEvents((prev) => prev.filter((e) => e.noteId !== snapshot.answeredCard.noteId))
    setMainIndex(snapshot.previousMainIndex)
    setLearningQueue(snapshot.previousLearningQueue)
    setFromLearningQueue(snapshot.previousFromLearningQueue)
    setGraduatedCount(snapshot.previousGraduatedCount)
    setStats(snapshot.previousStats)
    setIsWaiting(false)

    // Undo in IndexedDB (async, non-blocking)
    undoAnswerLocally(
      userId,
      snapshot.answeredCard.id,
      snapshot.reviewLogId,
      snapshot.previousCardState
    ).catch(error => {
      console.error('Error undoing answer locally:', error)
    })

    // Undo on server if sync was fired (fire-and-forget)
    if (snapshot.serverSyncFired && isOnline) {
      const previousServerState = snapshot.previousCardState ? {
        due: snapshot.previousCardState.due.toISOString(),
        interval: snapshot.previousCardState.interval,
        ease_factor: snapshot.previousCardState.ease_factor,
        repetitions: snapshot.previousCardState.repetitions,
        state: snapshot.previousCardState.state,
        learning_step: snapshot.previousCardState.learning_step,
        lapses: snapshot.previousCardState.lapses ?? 0,
      } : null

      fetch('/api/study/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: snapshot.answeredCard.id,
          reviewLogId: snapshot.reviewLogId,
          previousState: previousServerState,
        }),
      }).catch(error => {
        console.warn('Server undo failed, compensation sync will handle it:', error)
      })
    }
  }

  // Keep handleAnswerRef in sync
  handleAnswerRef.current = handleAnswer

  // Session complete (no current card and not waiting)
  const isSessionComplete = !currentCard && !isWaiting && mainIndex >= mainQueue.length && learningQueue.length === 0

  if (isSessionComplete) {
    const nothingStudied = stats.reviewed === 0
    return (
      <div className="max-w-lg mx-auto text-center py-12 px-4">
        <div className="w-24 h-24 mx-auto rounded-full bg-nodo-soft flex items-center justify-center mb-5">
          <SwallowMark className="w-14 h-auto" fill="#FF7849" />
        </div>
        <h2 className="text-2xl font-extrabold text-ai mb-1">
          {nothingStudied
            ? '今日のノルマはありません'
            : practiceMode
              ? '練習おつかれさま！'
              : '今日のノルマ完了！'}
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {nothingStudied
            ? `${deckName}は今日やるカードがない状態です。`
            : practiceMode
              ? `${deckName}の練習が終わりました。`
              : `${deckName}を${stats.reviewed}枚やりきりました。おつかれさま。`}
        </p>
        {!nothingStudied && (
          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-3">
              <div className="text-2xl font-extrabold text-ai tabular-nums">{stats.reviewed}</div>
              <div className="text-[11px] font-bold text-gray-400">学習カード</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-3">
              <div className="text-2xl font-extrabold text-good tabular-nums">
                {Math.round((stats.correct / stats.reviewed) * 100)}%
              </div>
              <div className="text-[11px] font-bold text-gray-400">正答率</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-3">
              <div className="text-2xl font-extrabold text-nodo tabular-nums">
                {streak.loading ? '–' : `${streak.current}日`}
              </div>
              <div className="text-[11px] font-bold text-gray-400">連続記録</div>
            </div>
          </div>
        )}
        {grownEvents.length > 0 && (
          <GrowthCelebration events={grownEvents} imprintMap={imprintMap} deckId={deckId} />
        )}
        {undoSnapshot && <UndoBanner onUndo={handleUndo} />}
        <div className="flex flex-col items-center gap-3">
          <MorePracticeSection
            onRequestPractice={onRequestPractice}
            loading={practiceLoading}
            unavailable={practiceUnavailable}
          />
          <Link
            href="/decks"
            className="text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors py-2"
          >
            デッキ一覧に戻る
          </Link>
          <SyncStatusBadge />
        </div>
      </div>
    )
  }

  // No cards to study (empty initial cards)
  if (totalCards === 0) {
    return (
      <div className="max-w-lg mx-auto text-center py-12 px-4">
        <div className="w-24 h-24 mx-auto rounded-full bg-sora-soft flex items-center justify-center mb-5">
          <SwallowMark className="w-14 h-auto" fill="#3E8EF7" />
        </div>
        <h2 className="text-xl font-extrabold text-ai mb-1">今日のカードはありません</h2>
        <p className="text-gray-500 text-sm mb-6">
          このデッキの今日の学習は完了しています。また明日！
        </p>
        <div className="flex flex-col items-center gap-3">
          <MorePracticeSection
            onRequestPractice={onRequestPractice}
            loading={practiceLoading}
            unavailable={practiceUnavailable}
          />
          <Link
            href="/decks"
            className="text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors py-2"
          >
            デッキ一覧に戻る
          </Link>
        </div>
      </div>
    )
  }

  // Waiting for learning queue card to become due
  if (isWaiting && !currentCard) {
    const sorted = [...learningQueue].sort((a, b) => a.dueAt - b.dueAt)
    const nextDueIn = sorted.length > 0 ? Math.max(0, Math.ceil((sorted[0].dueAt - Date.now()) / 1000)) : 0
    return (
      <div className="py-6">
        <div className="max-w-2xl mx-auto mb-6">
          <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
            <span>{deckName}</span>
            <div className="flex items-center gap-4">
              <span>{graduatedCount} / {totalCards}</span>
              {!isOnline && (
                <span className="flex items-center gap-1 text-yellow-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21" />
                  </svg>
                  オフライン
                </span>
              )}
            </div>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-sora transition-all duration-300"
              style={{ width: `${(graduatedCount / totalCards) * 100}%` }}
            />
          </div>
        </div>

        {undoSnapshot && (
          <div className="max-w-2xl mx-auto mb-4">
            <UndoBanner onUndo={handleUndo} />
          </div>
        )}

        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 min-h-[300px] flex flex-col items-center justify-center p-8">
            <div className="text-gray-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <WaitingCountdown seconds={nextDueIn} learningCount={learningQueue.length} />
          </div>
        </div>
      </div>
    )
  }

  if (!currentCard) return null

  const intervalPreviews = getNextIntervalPreview(currentCard.schedule, undefined, deckSettings)
  const isMultiStep = isMultiStepNote(currentCard.fieldValues)
  const isKobunTango = isKobunTangoNote(currentCard.fieldValues)
  // React で直接描画する自動採点カード（タイマー/スワイプを無効化する）
  const isReactQuizCard = isMultiStep || isKobunTango

  // 残数の内訳（Anki式の3色カウント: 新規/学習中/復習）。現在表示中のカードも残数に含む
  const remainingMain = mainQueue.slice(mainIndex)
  const newLeft = remainingMain.filter(c => c.schedule.state === 'new').length
  const learnLeftMain = remainingMain.filter(
    c => c.schedule.state === 'learning' || c.schedule.state === 'relearning'
  ).length
  const learnLeft = learnLeftMain + learningQueue.length
  const reviewLeft = remainingMain.length - newLeft - learnLeftMain

  return (
    <div className="py-6">
      {/* Leech notification */}
      {leechNotification && (
        <div className="max-w-2xl mx-auto mb-4">
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            {leechNotification}
            <button
              onClick={() => setLeechNotification(null)}
              className="ml-auto text-amber-600 hover:text-amber-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="max-w-2xl mx-auto mb-6">
        <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
          <span className="flex items-center gap-2 min-w-0">
            <CardStateBadge state={currentCard.schedule.state} fromLearningQueue={fromLearningQueue} />
            <span className="truncate">{deckName}</span>
          </span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 font-bold tabular-nums" title="新規 / 学習中 / 復習">
              <span className="text-easy">{newLeft}</span>
              <span className="text-hard">{learnLeft}</span>
              <span className="text-good">{reviewLeft}</span>
            </span>
            {!isOnline && (
              <span className="flex items-center gap-1 text-yellow-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21" />
                </svg>
                オフライン
              </span>
            )}
          </div>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${(graduatedCount / totalCards) * 100}%` }}
          />
        </div>
      </div>

      {/* Undo banner */}
      {undoSnapshot && (
        <div className="max-w-2xl mx-auto mb-2">
          <UndoBanner onUndo={handleUndo} />
        </div>
      )}

      {/* コーチマーク: 初回フリップ時に評価ボタンの意味を1度だけ説明 */}
      {showAnswerCoach && isCardFlipped && !isReactQuizCard && (
        <div className="max-w-2xl mx-auto mb-4">
          <CoachTip
            title="4つのボタンで「次に出るタイミング」が決まります"
            onDismiss={() => {
              markCoachSeen('answer-buttons')
              setShowAnswerCoach(false)
            }}
          >
            思い出せたら<b className="text-good">「正解」</b>、余裕なら
            <b className="text-easy">「簡単」</b>、ギリギリなら
            <b className="text-hard">「難しい」</b>、出てこなかったら
            <b className="text-again">「もう一度」</b>。
            自分の記憶に正直に押すほど、ちょうど忘れかけた頃にカードが戻ってきます。
          </CoachTip>
        </div>
      )}

      {/* Countdown Timer（多段階設問はフリップしないので無効） */}
      {settings.answer_time_limit > 0 && !isReactQuizCard && (
        <CountdownTimer
          key={'timer-' + currentCard.id + '-' + stats.reviewed}
          totalSeconds={settings.answer_time_limit}
          onTimeUp={handleTimeUp}
          isPaused={isCardFlipped || isSubmitting || imprintPrompt !== null}
        />
      )}

      {/* 初回インプリント（品種選択）オーバーレイ */}
      {imprintPrompt && (
        <ImprintPicker
          word={imprintPrompt.word}
          onSelect={(v) => commitImprint(imprintPrompt.noteId, v)}
          onAuto={() => commitImprint(imprintPrompt.noteId, pickVarietyByHash(imprintPrompt.noteId))}
          onSkip={() => skipImprint(imprintPrompt.noteId)}
        />
      )}

      {/* Card */}
      {isKobunTango ? (
        <KobunTangoCard
          key={currentCard.id + '-' + stats.reviewed}
          fieldValues={currentCard.fieldValues}
          intervalPreviews={intervalPreviews as Record<EaseValue, string>}
          onComplete={(ease, extra) =>
            handleAnswer(ease as Ease, {
              score: extra.score,
              stepResults: extra.stepResults as unknown as StepResult[],
            })
          }
        />
      ) : isMultiStep ? (
        <MultiStepCard
          key={currentCard.id + '-' + stats.reviewed}
          fieldValues={currentCard.fieldValues}
          intervalPreviews={intervalPreviews as Record<EaseValue, string>}
          onComplete={(ease, extra) => handleAnswer(ease as Ease, extra)}
        />
      ) : (
        <StudyCard
          key={currentCard.id + '-' + stats.reviewed}
          noteId={currentCard.noteId}
          fieldValues={currentCard.fieldValues}
          audioUrls={currentCard.audioUrls}
          generatedContent={currentCard.generatedContent}
          template={currentCard.template}
          fields={currentCard.fields}
          clozeNumber={currentCard.clozeNumber}
          intervalPreviews={intervalPreviews}
          onAnswer={handleAnswer}
          autoFlip={autoFlipTrigger}
          onFlipped={() => setIsCardFlipped(true)}
          autoAgainCountdown={autoAgainCountdown}
          swipeEnabled={settings.swipe_enabled}
          ttsVoice={settings.tts_voice}
          ttsSpeed={settings.tts_speed}
          ttsAutoplay={settings.tts_autoplay}
          ttsAutoButton={settings.tts_auto_button}
        />
      )}

      {/* 回答ごとの「水やり→成長」演出（非ブロッキング・操作を妨げない） */}
      {waterFx && (
        <div
          key={waterFx.key}
          className="pointer-events-none fixed inset-x-0 top-1/3 flex justify-center z-40"
          aria-hidden
        >
          {waterFx.grewTo ? (
            <svg viewBox="-44 -64 88 80" width="96" height="88" className="study-grow-pop">
              <PlantSprite stage={waterFx.grewTo} care="healthy" variety={waterFx.variety} />
            </svg>
          ) : (
            <div className="study-water-drop text-4xl">💧</div>
          )}
        </div>
      )}

      <style jsx global>{`
        .study-grow-pop {
          transform-origin: 50% 90%;
          animation: studyGrowPop 1.1s ease-out forwards;
        }
        @keyframes studyGrowPop {
          0% { transform: scale(0.5) translateY(10px); opacity: 0; }
          25% { transform: scale(1.12) translateY(0); opacity: 1; }
          70% { transform: scale(1) translateY(-6px); opacity: 1; }
          100% { transform: scale(1) translateY(-18px); opacity: 0; }
        }
        .study-water-drop {
          animation: studyWaterDrop 1s ease-in forwards;
        }
        @keyframes studyWaterDrop {
          0% { transform: translateY(-14px) scale(0.8); opacity: 0; }
          30% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(14px) scale(0.9); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .study-grow-pop, .study-water-drop { animation-duration: 0.01s; }
        }
      `}</style>
    </div>
  )
}

/** 現在のカードが「新規 / 復習 / 学習中」のどれかを示すバッジ */
function CardStateBadge({
  state,
  fromLearningQueue,
}: {
  state: CardSchedule['state']
  fromLearningQueue: boolean
}) {
  // セッション内で再提示中（Again/Hard）のカードは learning/relearning 状態。
  // それ以外の learning/relearning（初回学習中）も含めて「学習中」として扱う。
  let label: string
  let cls: string
  if (state === 'new') {
    label = '🆕 新規'
    cls = 'bg-green-100 text-green-700'
  } else if (state === 'learning' || state === 'relearning' || fromLearningQueue) {
    label = '📖 学習中'
    cls = 'bg-orange-100 text-orange-700'
  } else {
    label = '🔁 復習'
    cls = 'bg-blue-100 text-blue-700'
  }
  return (
    <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  )
}

/**
 * 完了画面の「もっと練習する」セクション（繰り上げ学習）。
 * 練習の結果はスケジュールに記録されない旨を明示する。
 */
function MorePracticeSection({
  onRequestPractice,
  loading,
  unavailable,
}: {
  onRequestPractice?: () => void
  loading: boolean
  unavailable: boolean
}) {
  if (!onRequestPractice) return null
  if (unavailable) {
    return (
      <p className="text-sm text-gray-500">
        繰り上げて練習できるカードはありません。今日はよく頑張りました！
      </p>
    )
  }
  return (
    <button
      onClick={onRequestPractice}
      disabled={loading}
      className="w-full max-w-xs bg-white border-2 border-sora text-sora rounded-2xl px-8 py-3 font-extrabold hover:bg-sora-soft transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
    >
      {loading ? '読み込み中…' : 'もう少しだけ練習する'}
      <span className="block text-[11px] font-semibold text-gray-400 mt-0.5">
        スケジュールには記録されません
      </span>
    </button>
  )
}

/** 学習完了時の成長演出（段階が上がった株を庭の姿で見せる・Phase 10.2 残） */
function GrowthCelebration({
  events,
  imprintMap,
  deckId,
}: {
  events: GrowthEvent[]
  imprintMap: Map<string, CreatureImprint>
  deckId?: string
}) {
  const MAX = 12
  const shown = events.slice(0, MAX)
  const extra = events.length - shown.length

  return (
    <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-6 text-left">
      <p className="text-center text-sm font-medium text-green-800 mb-3">
        🌱 {events.length}株が育ちました！
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {shown.map((e) => {
          const variety = getVariety(imprintMap.get(e.noteId)?.variety)
          return (
            <div key={e.noteId} className="flex flex-col items-center w-20">
              <svg viewBox="-44 -62 88 92" width="48" height="50" aria-hidden>
                <IsoTile
                  plant={{
                    growth: e.to,
                    care: 'healthy',
                    isDead: false,
                    needsWater: false,
                    overdueDays: 0,
                    effectiveStability: 0,
                    struggled: false,
                  }}
                  variety={variety}
                  animate={false}
                />
              </svg>
              <span className="text-xs text-gray-700 truncate w-full text-center" title={e.label}>
                {e.label || '（名札なし）'}
              </span>
              <span className="text-[10px] text-green-700">
                {GROWTH_LABEL_SHORT[e.from]}→{GROWTH_LABEL_SHORT[e.to]}
              </span>
            </div>
          )
        })}
      </div>
      {extra > 0 && (
        <p className="text-center text-xs text-gray-500 mt-2">ほか {extra} 株</p>
      )}
      <div className="flex justify-center mt-4">
        <Link
          href={deckId ? `/garden?deck=${deckId}` : '/garden'}
          className="px-4 py-2 text-sm text-green-700 bg-white border border-green-300 rounded-lg hover:bg-green-50"
        >
          庭で見る
        </Link>
      </div>
    </div>
  )
}

/** Undo banner shown after answering a card */
function UndoBanner({ onUndo }: { onUndo: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm">
      <span className="text-gray-600">回答を記録しました</span>
      <button
        onClick={onUndo}
        className="flex items-center gap-1 px-3 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
        </svg>
        取り消し
      </button>
    </div>
  )
}

/** Countdown display while waiting for learning cards */
function WaitingCountdown({ seconds, learningCount }: { seconds: number; learningCount: number }) {
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    setRemaining(seconds)
  }, [seconds])

  useEffect(() => {
    if (remaining <= 0) return
    const timer = setInterval(() => {
      setRemaining(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [remaining])

  const minutes = Math.floor(remaining / 60)
  const secs = remaining % 60
  const display = minutes > 0
    ? `${minutes}:${secs.toString().padStart(2, '0')}`
    : `${secs}秒`

  return (
    <div className="text-center">
      <p className="text-lg font-medium text-gray-700 mb-2">
        学習中のカードを待っています...
      </p>
      <p className="text-3xl font-bold text-blue-600 mb-2">{display}</p>
      <p className="text-sm text-gray-500">
        残り {learningCount} 枚のカードが再提示されます
      </p>
    </div>
  )
}

/** Countdown timer bar for answer time limit */
function CountdownTimer({
  totalSeconds,
  onTimeUp,
  isPaused,
}: {
  totalSeconds: number
  onTimeUp: () => void
  isPaused: boolean
}) {
  const [remaining, setRemaining] = useState(totalSeconds * 1000) // ms
  const [fired, setFired] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastTickRef = useRef(Date.now())

  useEffect(() => {
    if (isPaused || fired) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    lastTickRef.current = Date.now()
    intervalRef.current = setInterval(() => {
      const now = Date.now()
      const elapsed = now - lastTickRef.current
      lastTickRef.current = now
      setRemaining(prev => {
        const next = prev - elapsed
        if (next <= 0) {
          return 0
        }
        return next
      })
    }, 100)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isPaused, fired])

  // Fire onTimeUp when remaining hits 0
  useEffect(() => {
    if (remaining <= 0 && !fired) {
      setFired(true)
      onTimeUp()
    }
  }, [remaining, fired, onTimeUp])

  const fraction = remaining / (totalSeconds * 1000)
  const secondsLeft = Math.ceil(remaining / 1000)

  // Color based on remaining fraction
  let barColor = 'bg-green-500'
  let textColor = 'text-green-600'
  if (fraction <= 0.25) {
    barColor = 'bg-red-500'
    textColor = 'text-red-600'
  } else if (fraction <= 0.5) {
    barColor = 'bg-yellow-500'
    textColor = 'text-yellow-600'
  }

  return (
    <div className="max-w-2xl mx-auto mb-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-100`}
            style={{ width: `${Math.min(100, (1 - fraction) * 100)}%` }}
          />
        </div>
        <span className={`text-xs font-medium ${textColor} w-8 text-right tabular-nums`}>
          {secondsLeft}s
        </span>
      </div>
    </div>
  )
}
