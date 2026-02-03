'use client'

import { useState, useRef, useCallback } from 'react'
import { Volume2, VolumeX, Loader2 } from 'lucide-react'
import { getCachedAudio, saveAudioCache } from '@/lib/db/schema'

type AudioState = 'idle' | 'loading' | 'playing' | 'error'

interface AudioButtonProps {
  noteId: string
  fieldName: string
  text: string
  audioUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function AudioButton({
  noteId,
  fieldName,
  text,
  audioUrl,
  size = 'md',
  className = '',
}: AudioButtonProps) {
  const [state, setState] = useState<AudioState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  }

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24,
  }

  const playAudio = useCallback(async (url: string) => {
    try {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => {
        setState('idle')
        audioRef.current = null
      }

      audio.onerror = () => {
        setState('error')
        setErrorMessage('音声の再生に失敗しました')
        audioRef.current = null
      }

      setState('playing')
      await audio.play()
    } catch (error) {
      console.error('Error playing audio:', error)
      setState('error')
      setErrorMessage('音声の再生に失敗しました')
    }
  }, [])

  const handleClick = useCallback(async () => {
    if (state === 'loading') return

    // If currently playing, stop
    if (state === 'playing') {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setState('idle')
      return
    }

    setErrorMessage(null)
    setState('loading')

    try {
      // First, check local cache
      const cached = await getCachedAudio(noteId, fieldName)
      if (cached) {
        const blobUrl = URL.createObjectURL(cached.audioBlob)
        await playAudio(blobUrl)
        return
      }

      // If we have a pre-existing audio URL, use it
      if (audioUrl) {
        await playAudio(audioUrl)
        // Cache the audio for offline use
        try {
          const response = await fetch(audioUrl)
          if (response.ok) {
            const blob = await response.blob()
            await saveAudioCache(noteId, fieldName, blob, audioUrl)
          }
        } catch {
          // Caching failed, but playback succeeded - that's ok
        }
        return
      }

      // No cache or existing URL - generate new audio via API
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId,
          fieldName,
          text,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '音声生成に失敗しました')
      }

      const data = await response.json()
      if (!data.success || !data.audioUrl) {
        throw new Error('音声URLが返されませんでした')
      }

      // Play the generated audio
      await playAudio(data.audioUrl)

      // Cache the audio for offline use
      try {
        const audioResponse = await fetch(data.audioUrl)
        if (audioResponse.ok) {
          const blob = await audioResponse.blob()
          await saveAudioCache(noteId, fieldName, blob, data.audioUrl)
        }
      } catch {
        // Caching failed, but playback succeeded - that's ok
      }
    } catch (error) {
      console.error('TTS error:', error)
      setState('error')
      setErrorMessage(error instanceof Error ? error.message : '音声生成に失敗しました')
    }
  }, [noteId, fieldName, text, audioUrl, state, playAudio])

  const getIcon = () => {
    const iconSize = iconSizes[size]

    switch (state) {
      case 'loading':
        return <Loader2 size={iconSize} className="animate-spin" />
      case 'playing':
        return <Volume2 size={iconSize} className="animate-pulse" />
      case 'error':
        return <VolumeX size={iconSize} />
      default:
        return <Volume2 size={iconSize} />
    }
  }

  const getButtonClasses = () => {
    const base = `${sizeClasses[size]} rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${className}`

    switch (state) {
      case 'loading':
        return `${base} bg-gray-100 text-gray-400 cursor-wait`
      case 'playing':
        return `${base} bg-blue-100 text-blue-600 hover:bg-blue-200 focus:ring-blue-500`
      case 'error':
        return `${base} bg-red-100 text-red-600 hover:bg-red-200 focus:ring-red-500`
      default:
        return `${base} bg-gray-100 text-gray-600 hover:bg-gray-200 focus:ring-gray-500`
    }
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'loading'}
        className={getButtonClasses()}
        title={
          state === 'loading'
            ? '読み込み中...'
            : state === 'playing'
            ? 'クリックで停止'
            : state === 'error'
            ? errorMessage || 'エラー'
            : '音声を再生'
        }
        aria-label={
          state === 'loading'
            ? '音声読み込み中'
            : state === 'playing'
            ? '音声再生中、クリックで停止'
            : '音声を再生'
        }
      >
        {getIcon()}
      </button>
      {state === 'error' && errorMessage && (
        <span className="ml-2 text-xs text-red-600">{errorMessage}</span>
      )}
    </div>
  )
}
