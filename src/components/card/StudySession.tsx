'use client'

import { useState, useEffect, useRef } from 'react'
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
import { saveAnswerLocally, pushToServer, getSyncStatus } from '@/lib/db/sync'
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

interface StudySessionProps {
  deckName: string
  initialCards: CardData[]
  userId: string
  deckSettings?: Partial<DeckSettings>
}

export function StudySession({ deckName, initialCards, userId, deckSettings }: StudySessionProps) {
  const [cards, setCards] = useState<CardData[]>(initialCards)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stats, setStats] = useState({ reviewed: 0, correct: 0 })
  const [isOnline, setIsOnline] = useState(true)
  const [leechNotification, setLeechNotification] = useState<string | null>(null)
  const cardStartTime = useRef<number>(Date.now())

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

  // Reset timer when moving to new card
  useEffect(() => {
    cardStartTime.current = Date.now()
  }, [currentIndex])

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

  const currentCard = cards[currentIndex]
  const settings = resolveDeckSettings(deckSettings)

  const handleAnswer = async (ease: Ease) => {
    if (!currentCard || isSubmitting) return

    setIsSubmitting(true)
    const timeMs = Date.now() - cardStartTime.current
    const now = new Date()
    const cardId = currentCard.id
    const lastInterval = currentCard.schedule.interval

    try {
      // Calculate new schedule locally (synchronous, <1ms)
      const newSchedule = calculateNextReview(currentCard.schedule, ease, now, deckSettings)

      // Check for leech
      if (ease === Ease.Again && newSchedule.lapses > (currentCard.schedule.lapses || 0)) {
        const isLeech = checkLeech(newSchedule, settings)
        if (isLeech) {
          setLeechNotification(`このカードはリーチです（失念回数: ${newSchedule.lapses}回）`)
          // If suspend action, mark as suspended locally
          if (settings.leech_action === 'suspend') {
            newSchedule.state = 'suspended'
          }
        }
      }

      // Update UI immediately - don't wait for any I/O
      setCards(prevCards => {
        const updated = [...prevCards]
        updated[currentIndex] = {
          ...updated[currentIndex],
          schedule: newSchedule,
        }
        return updated
      })
      setStats(prev => ({
        reviewed: prev.reviewed + 1,
        correct: ease >= Ease.Good ? prev.correct + 1 : prev.correct,
      }))
      setCurrentIndex(prev => prev + 1)
      setIsSubmitting(false)

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
        },
        lastInterval,
        timeMs
      ).then(() => {
        // After local save, try server sync (fire-and-forget)
        if (isOnline) {
          fetch('/api/study/answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardId, ease, timeMs }),
          }).catch(syncError => {
            console.warn('Server sync failed, will retry later:', syncError)
          })
        }
      }).catch(error => {
        console.error('Error saving answer locally:', error)
      })
    } catch (error) {
      console.error('Error processing answer:', error)
      setIsSubmitting(false)
    }
  }

  // Session complete
  if (currentIndex >= cards.length) {
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

  // No cards to study
  if (cards.length === 0) {
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
            <span>{currentIndex + 1} / {cards.length}</span>
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
            style={{ width: `${((currentIndex) / cards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <StudyCard
        noteId={currentCard.noteId}
        fieldValues={currentCard.fieldValues}
        audioUrls={currentCard.audioUrls}
        generatedContent={currentCard.generatedContent}
        template={currentCard.template}
        fields={currentCard.fields}
        clozeNumber={currentCard.clozeNumber}
        intervalPreviews={intervalPreviews}
        onAnswer={handleAnswer}
      />
    </div>
  )
}
