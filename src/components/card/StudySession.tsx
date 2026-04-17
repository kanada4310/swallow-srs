'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { StudyCard } from './StudyCard'
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
import { getCardState, type LocalCardState } from '@/lib/db/schema'
import { isOnline as checkOnline } from '@/lib/db/utils'
import { SyncStatusBadge } from '@/components/ui/SyncStatusBadge'
import Link from 'next/link'
import type { GeneratedContent, FieldDefinition, DeckSettings } from '@/types/database'

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
  deckName: string
  initialCards: CardData[]
  userId: string
  deckSettings?: Partial<DeckSettings>
}

export function StudySession({ deckId, deckName, initialCards, userId, deckSettings }: StudySessionProps) {
  // Queue-based state
  const [mainQueue] = useState<CardData[]>(initialCards)
  const [mainIndex, setMainIndex] = useState(0)
  const [learningQueue, setLearningQueue] = useState<LearningQueueItem[]>([])
  const [currentCard, setCurrentCard] = useState<CardData | null>(initialCards[0] ?? null)
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
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardStartTime = useRef<number>(Date.now())
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleAnswerRef = useRef<(ease: Ease) => void>(() => {})

  const settings = resolveDeckSettings(deckSettings)

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

  const handleAnswer = (ease: Ease) => {
    if (!currentCard || isSubmitting) return

    setIsSubmitting(true)
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
          deckId
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
              body: JSON.stringify({ cardId, ease, timeMs, deckId }),
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
          deckId
        ).then(() => {
          if (isOnline) {
            fetch('/api/study/answer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cardId, ease, timeMs, deckId }),
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
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="text-green-500 mb-4">
          <svg className="w-20 h-20 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">学習完了!</h2>
        <p className="text-gray-600 mb-6">
          {deckName}の今日の学習が終わりました。
        </p>
        <div className="bg-gray-100 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-3xl font-bold text-gray-900">{stats.reviewed}</div>
              <div className="text-sm text-gray-500">学習したカード</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600">
                {stats.reviewed > 0 ? Math.round((stats.correct / stats.reviewed) * 100) : 0}%
              </div>
              <div className="text-sm text-gray-500">正答率</div>
            </div>
          </div>
        </div>
        {undoSnapshot && <UndoBanner onUndo={handleUndo} />}
        <div className="flex flex-col items-center gap-3">
          <Link
            href="/decks"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg className="w-20 h-20 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">学習するカードがありません</h2>
        <p className="text-gray-600 mb-6">
          今日の学習は完了しています。また明日来てください!
        </p>
        <Link
          href="/decks"
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          デッキ一覧に戻る
        </Link>
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
              className="h-full bg-blue-600 transition-all duration-300"
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
          <span>{deckName}</span>
          <div className="flex items-center gap-4">
            <span>
              {graduatedCount} / {totalCards}
              {learningQueue.length > 0 && (
                <span className="text-orange-500 ml-1">(+{learningQueue.length})</span>
              )}
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

      {/* Countdown Timer */}
      {settings.answer_time_limit > 0 && (
        <CountdownTimer
          key={'timer-' + currentCard.id + '-' + stats.reviewed}
          totalSeconds={settings.answer_time_limit}
          onTimeUp={handleTimeUp}
          isPaused={isCardFlipped || isSubmitting}
        />
      )}

      {/* Card */}
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
