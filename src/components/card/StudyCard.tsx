'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Ease } from '@/lib/srs/scheduler'
import { renderTemplate, hasTtsPlaceholders, extractTtsFieldNames, type FieldValues } from '@/lib/template'
import { CardIframe } from '@/components/card/CardIframe'
import { AudioButton } from '@/components/audio/AudioButton'
import { getCachedAudio, saveAudioCache } from '@/lib/db/schema'
import { SwipeOverlay } from '@/components/card/SwipeOverlay'
import { useSwipeGesture, type SwipeDirection } from '@/lib/swipe/useSwipeGesture'
import type { GeneratedContent, FieldDefinition } from '@/types/database'

interface StudyCardProps {
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
  intervalPreviews: Record<Ease, string>
  onAnswer: (ease: Ease) => void
  autoFlip?: boolean
  onFlipped?: () => void
  autoAgainCountdown?: number | null
  swipeEnabled?: boolean
  ttsVoice?: string
  ttsSpeed?: number
  ttsAutoplay?: boolean
  ttsAutoButton?: boolean
}

export function StudyCard({
  noteId,
  fieldValues,
  audioUrls,
  generatedContent,
  template,
  fields,
  clozeNumber,
  intervalPreviews,
  onAnswer,
  autoFlip,
  onFlipped,
  autoAgainCountdown,
  swipeEnabled = false,
  ttsVoice,
  ttsSpeed,
  ttsAutoplay = false,
  ttsAutoButton = true,
}: StudyCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)

  // Swipe gesture handling
  const handleSwipe = useCallback((direction: SwipeDirection) => {
    if (!isFlipped) {
      // Front side: up = flip
      if (direction === 'up') {
        setIsFlipped(true)
        onFlipped?.()
      }
    } else {
      // Back side: directional answer
      const directionToEase: Record<SwipeDirection, Ease> = {
        left: Ease.Again,
        down: Ease.Hard,
        right: Ease.Good,
        up: Ease.Easy,
      }
      const ease = directionToEase[direction]
      onAnswer(ease)
      setIsFlipped(false)
    }
  }, [isFlipped, onAnswer, onFlipped])

  const { ref: swipeRef, swipeState } = useSwipeGesture({
    enabled: swipeEnabled,
    onSwipe: handleSwipe,
  })

  // Render templates (pure template processing, no sanitization)
  const renderedFront = useMemo(() => {
    return renderTemplate(
      template.front,
      fieldValues,
      { side: 'front', clozeNumber }
    )
  }, [template.front, fieldValues, clozeNumber])

  const renderedBack = useMemo(() => {
    return renderTemplate(
      template.back,
      fieldValues,
      { side: 'back', clozeNumber, renderedFront }
    )
  }, [template.back, fieldValues, clozeNumber, renderedFront])

  // Check if templates use inline {{tts:...}} placeholders
  const templateHasTts = useMemo(() => {
    return hasTtsPlaceholders(template.front) || hasTtsPlaceholders(template.back)
  }, [template.front, template.back])

  // Inline TTS playback from iframe
  const inlineTtsAudioRef = useRef<HTMLAudioElement | null>(null)
  const handleIframeTtsPlay = useCallback(async (fieldName: string) => {
    // Stop any playing audio
    if (inlineTtsAudioRef.current) {
      inlineTtsAudioRef.current.pause()
      inlineTtsAudioRef.current = null
    }

    const text = fieldValues[fieldName]
    if (!text) return

    // Check local cache first
    const cached = await getCachedAudio(noteId, fieldName)
    if (cached) {
      const url = URL.createObjectURL(cached.audioBlob)
      const audio = new Audio(url)
      inlineTtsAudioRef.current = audio
      audio.onended = () => { inlineTtsAudioRef.current = null }
      await audio.play()
      return
    }

    // Check pre-existing audio URL
    if (audioUrls?.[fieldName]) {
      const audio = new Audio(audioUrls[fieldName])
      inlineTtsAudioRef.current = audio
      audio.onended = () => { inlineTtsAudioRef.current = null }
      await audio.play()
      return
    }

    // Generate via API
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId,
          fieldName,
          text,
          ...(ttsVoice && { voice: ttsVoice }),
          ...(ttsSpeed && { speed: ttsSpeed }),
        }),
      })
      if (!response.ok) return
      const data = await response.json()
      if (!data.audioUrl) return

      const audio = new Audio(data.audioUrl)
      inlineTtsAudioRef.current = audio
      audio.onended = () => { inlineTtsAudioRef.current = null }
      await audio.play()

      // Cache for offline
      try {
        const audioResponse = await fetch(data.audioUrl)
        if (audioResponse.ok) {
          const blob = await audioResponse.blob()
          await saveAudioCache(noteId, fieldName, blob, data.audioUrl)
        }
      } catch { /* caching failure is non-critical */ }
    } catch { /* TTS generation failure is non-critical */ }
  }, [fieldValues, noteId, audioUrls, ttsVoice, ttsSpeed])

  // Track which fields have been prefetched (for autoplay coordination)
  const prefetchedFieldsRef = useRef<Set<string>>(new Set())
  const autoplayPendingRef = useRef<string | null>(null)

  // Prefetch TTS audio in background when card appears
  useEffect(() => {
    prefetchedFieldsRef.current = new Set()
    autoplayPendingRef.current = null

    // Collect all fields needing TTS
    const fieldsToPreload = new Set<string>()

    // From template {{tts:...}} placeholders
    for (const name of extractTtsFieldNames(template.front)) {
      fieldsToPreload.add(name)
    }
    for (const name of extractTtsFieldNames(template.back)) {
      fieldsToPreload.add(name)
    }

    // From field settings (when no template placeholders)
    if (fieldsToPreload.size === 0 && fields) {
      for (const f of fields) {
        if (f.settings?.tts_enabled && fieldValues[f.name]) {
          fieldsToPreload.add(f.name)
        }
      }
    }

    if (fieldsToPreload.size === 0) return

    let cancelled = false

    const prefetchField = async (fieldName: string) => {
      if (cancelled) return
      const text = fieldValues[fieldName]
      if (!text) return

      // Already cached?
      try {
        const cached = await getCachedAudio(noteId, fieldName)
        if (cached) {
          prefetchedFieldsRef.current.add(fieldName)
          // If autoplay is waiting for this field, play it now
          if (autoplayPendingRef.current === fieldName) {
            autoplayPendingRef.current = null
            handleIframeTtsPlay(fieldName)
          }
          return
        }
        if (cancelled) return
      } catch { return }

      // Has existing audio URL? Pre-cache it
      if (audioUrls?.[fieldName]) {
        try {
          const resp = await fetch(audioUrls[fieldName])
          if (resp.ok && !cancelled) {
            const blob = await resp.blob()
            await saveAudioCache(noteId, fieldName, blob, audioUrls[fieldName])
            prefetchedFieldsRef.current.add(fieldName)
            if (autoplayPendingRef.current === fieldName) {
              autoplayPendingRef.current = null
              handleIframeTtsPlay(fieldName)
            }
          }
        } catch { /* non-critical */ }
        return
      }

      // Generate via API and cache
      try {
        const resp = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            noteId,
            fieldName,
            text,
            ...(ttsVoice && { voice: ttsVoice }),
            ...(ttsSpeed && { speed: ttsSpeed }),
          }),
        })
        if (!resp.ok || cancelled) return
        const data = await resp.json()
        if (!data.audioUrl || cancelled) return

        // Cache the audio blob
        const audioResp = await fetch(data.audioUrl)
        if (audioResp.ok && !cancelled) {
          const blob = await audioResp.blob()
          await saveAudioCache(noteId, fieldName, blob, data.audioUrl)
          prefetchedFieldsRef.current.add(fieldName)
          if (autoplayPendingRef.current === fieldName) {
            autoplayPendingRef.current = null
            handleIframeTtsPlay(fieldName)
          }
        }
      } catch { /* non-critical */ }
    }

    // Start prefetch for all fields simultaneously
    Array.from(fieldsToPreload).forEach(prefetchField)

    return () => { cancelled = true }
  }, [noteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Determine which fields to show audio buttons for based on field settings
  const ttsEnabledFields = useMemo(() => {
    if (fields) {
      return fields
        .filter(f => f.settings?.tts_enabled)
        .map(f => f.name)
    }
    // Fallback for legacy: Front/Text on front, Back/Extra on back
    return null
  }, [fields])

  // Get TTS fields for front side
  const frontTtsFields = useMemo(() => {
    if (ttsEnabledFields) {
      // Return first TTS-enabled field that has a value
      return ttsEnabledFields
        .filter(name => fieldValues[name])
        .slice(0, 1) // Show max 1 audio button on front
    }
    // Legacy fallback
    if (fieldValues['Front']) return ['Front']
    if (fieldValues['Text']) return ['Text']
    return []
  }, [ttsEnabledFields, fieldValues])

  // Get TTS fields for back side (all TTS-enabled fields except those shown on front)
  const backTtsFields = useMemo(() => {
    if (ttsEnabledFields) {
      return ttsEnabledFields
        .filter(name => fieldValues[name] && !frontTtsFields.includes(name))
    }
    // Legacy fallback
    if (fieldValues['Back']) return ['Back']
    if (fieldValues['Extra']) return ['Extra']
    return []
  }, [ttsEnabledFields, fieldValues, frontTtsFields])

  // Determine auto-play fields for each face
  const frontAutoplayFields = useMemo(() => {
    const fromTemplate = extractTtsFieldNames(template.front)
    if (fromTemplate.length > 0) return fromTemplate.filter(name => fieldValues[name])
    return frontTtsFields
  }, [template.front, fieldValues, frontTtsFields])

  const backAutoplayFields = useMemo(() => {
    const fromTemplate = extractTtsFieldNames(template.back)
    if (fromTemplate.length > 0) return fromTemplate.filter(name => fieldValues[name])
    return backTtsFields
  }, [template.back, fieldValues, backTtsFields])

  // Auto-play TTS when card face changes
  useEffect(() => {
    if (!ttsAutoplay) return
    const fieldsToPlay = isFlipped ? backAutoplayFields : frontAutoplayFields
    if (fieldsToPlay.length === 0) return
    const fieldName = fieldsToPlay[0]

    // If already prefetched/cached, play immediately
    if (prefetchedFieldsRef.current.has(fieldName)) {
      const timer = setTimeout(() => handleIframeTtsPlay(fieldName), 100)
      return () => clearTimeout(timer)
    }

    // Otherwise, register as pending — prefetch will play when ready
    autoplayPendingRef.current = fieldName
    return () => { autoplayPendingRef.current = null }
  }, [isFlipped, noteId, ttsAutoplay]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-flip when triggered by timer
  useEffect(() => {
    if (autoFlip && !isFlipped) {
      setIsFlipped(true)
      onFlipped?.()
    }
  }, [autoFlip]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFlip = () => {
    setIsFlipped(true)
    onFlipped?.()
  }

  const handleAnswer = (ease: Ease) => {
    onAnswer(ease)
    setIsFlipped(false)
  }

  // Card translation during swipe (subtle follow effect)
  const swipeTransform = swipeState.active
    ? `translate(${swipeState.dx * 0.15}px, ${swipeState.dy * 0.15}px)`
    : undefined

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Card */}
      <div
        ref={swipeRef}
        className="bg-white rounded-xl shadow-lg border border-gray-200 min-h-[300px] flex flex-col relative"
        style={{
          touchAction: swipeEnabled ? 'none' : undefined,
          transform: swipeTransform,
          transition: swipeState.active ? undefined : 'transform 0.2s ease-out',
        }}
      >
        {/* Swipe overlay */}
        <SwipeOverlay
          swipeState={swipeState}
          isFlipped={isFlipped}
          intervalPreviews={intervalPreviews}
        />

        {!isFlipped ? (
          /* Front only */
          <div className="flex-1 p-8 flex flex-col items-center justify-center relative">
            <CardIframe key="front" html={renderedFront} css={template.css} className="text-xl" onTtsPlay={handleIframeTtsPlay} />
            {!templateHasTts && ttsAutoButton && frontTtsFields.length > 0 && (
              <div className="mt-4 flex gap-2">
                {frontTtsFields.map(fieldName => (
                  <AudioButton
                    key={fieldName}
                    noteId={noteId}
                    fieldName={fieldName}
                    text={fieldValues[fieldName] || ''}
                    audioUrl={audioUrls?.[fieldName]}
                    voice={ttsVoice}
                    speed={ttsSpeed}
                    size="md"
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Back only (back template is self-contained, includes front content) */
          <div className="flex-1 p-8 flex flex-col items-center justify-center">
            <CardIframe key="back" html={renderedBack} css={template.css} className="text-xl" onTtsPlay={handleIframeTtsPlay} />
            {!templateHasTts && ttsAutoButton && backTtsFields.length > 0 && (
              <div className="mt-4 flex gap-2">
                {backTtsFields.map(fieldName => (
                  <AudioButton
                    key={fieldName}
                    noteId={noteId}
                    fieldName={fieldName}
                    text={fieldValues[fieldName] || ''}
                    audioUrl={audioUrls?.[fieldName]}
                    voice={ttsVoice}
                    speed={ttsSpeed}
                    size="md"
                  />
                ))}
              </div>
            )}

            {/* Generated Examples */}
            {generatedContent && generatedContent.examples && generatedContent.examples.length > 0 && (
              <div className="mt-6 w-full max-w-md">
                <p className="text-xs font-medium text-purple-600 mb-2 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  例文
                </p>
                <ul className="space-y-2">
                  {generatedContent.examples.map((example, idx) => (
                    <li key={idx} className="text-sm text-gray-600 pl-3 border-l-2 border-purple-300">
                      {example}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="mt-6">
        {!isFlipped ? (
          <button
            onClick={handleFlip}
            className="w-full py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-lg font-medium"
          >
            答えを見る
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            <AnswerButton
              label={autoAgainCountdown != null ? `もう一度 (${autoAgainCountdown})` : "もう一度"}
              interval={intervalPreviews[Ease.Again]}
              color="red"
              onClick={() => handleAnswer(Ease.Again)}
              highlight={autoAgainCountdown != null}
            />
            <AnswerButton
              label="難しい"
              interval={intervalPreviews[Ease.Hard]}
              color="orange"
              onClick={() => handleAnswer(Ease.Hard)}
            />
            <AnswerButton
              label="正解"
              interval={intervalPreviews[Ease.Good]}
              color="green"
              onClick={() => handleAnswer(Ease.Good)}
            />
            <AnswerButton
              label="簡単"
              interval={intervalPreviews[Ease.Easy]}
              color="blue"
              onClick={() => handleAnswer(Ease.Easy)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

interface AnswerButtonProps {
  label: string
  interval: string
  color: 'red' | 'orange' | 'green' | 'blue'
  onClick: () => void
  highlight?: boolean
}

function AnswerButton({ label, interval, color, onClick, highlight }: AnswerButtonProps) {
  const colorClasses = {
    red: 'bg-red-500 hover:bg-red-600',
    orange: 'bg-orange-500 hover:bg-orange-600',
    green: 'bg-green-500 hover:bg-green-600',
    blue: 'bg-blue-500 hover:bg-blue-600',
  }

  return (
    <button
      onClick={onClick}
      className={`py-3 px-2 ${colorClasses[color]} text-white rounded-lg transition-colors flex flex-col items-center ${highlight ? 'ring-2 ring-red-300 ring-offset-1 animate-pulse' : ''}`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs opacity-80">{interval}</span>
    </button>
  )
}
