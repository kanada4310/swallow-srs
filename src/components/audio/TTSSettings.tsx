'use client'

import { useState, useEffect } from 'react'
import { Volume2, Loader2 } from 'lucide-react'
import type { TTSVoice } from '@/types/database'

interface TTSSettingsData {
  enabled_fields: string[]
  voice: TTSVoice
  speed: number
}

const AVAILABLE_FIELDS = ['Front', 'Back', 'Text', 'Extra']

const VOICES: { value: TTSVoice; label: string; description: string }[] = [
  { value: 'alloy', label: 'Alloy', description: 'ニュートラルで自然' },
  { value: 'echo', label: 'Echo', description: '男性的で落ち着いた' },
  { value: 'fable', label: 'Fable', description: '表現豊かでドラマチック' },
  { value: 'onyx', label: 'Onyx', description: '深みのある男性的' },
  { value: 'nova', label: 'Nova', description: '明るく女性的' },
  { value: 'shimmer', label: 'Shimmer', description: '柔らかく女性的' },
]

const SPEED_OPTIONS = [
  { value: 0.75, label: '0.75x (ゆっくり)' },
  { value: 1.0, label: '1.0x (標準)' },
  { value: 1.25, label: '1.25x (やや速い)' },
  { value: 1.5, label: '1.5x (速い)' },
]

export function TTSSettings() {
  const [settings, setSettings] = useState<TTSSettingsData>({
    enabled_fields: ['Front'],
    voice: 'alloy',
    speed: 1.0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isTestPlaying, setIsTestPlaying] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/tts/settings')
      if (!response.ok) throw new Error('設定の取得に失敗しました')
      const data = await response.json()
      if (data.success && data.settings) {
        setSettings({
          enabled_fields: data.settings.enabled_fields || ['Front'],
          voice: data.settings.voice || 'alloy',
          speed: data.settings.speed || 1.0,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch('/api/tts/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '設定の保存に失敗しました')
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の保存に失敗しました')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleField = (field: string) => {
    setSettings(prev => ({
      ...prev,
      enabled_fields: prev.enabled_fields.includes(field)
        ? prev.enabled_fields.filter(f => f !== field)
        : [...prev.enabled_fields, field],
    }))
  }

  const testVoice = async () => {
    setIsTestPlaying(true)
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId: 'test',
          fieldName: 'test',
          text: 'こんにちは。これはテスト音声です。Hello, this is a test voice.',
          voice: settings.voice,
          speed: settings.speed,
        }),
      })

      if (!response.ok) {
        throw new Error('音声生成に失敗しました')
      }

      const data = await response.json()
      if (data.audioUrl) {
        const audio = new Audio(data.audioUrl)
        audio.onended = () => setIsTestPlaying(false)
        audio.onerror = () => setIsTestPlaying(false)
        await audio.play()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'テスト再生に失敗しました')
      setIsTestPlaying(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-ink-3" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-card border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <Volume2 className="w-6 h-6 text-sora" />
        <h2 className="text-lg font-bold text-ai">音声読み上げ (TTS) 設定</h2>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-again-bg text-again rounded-2xl text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-good-bg text-good rounded-2xl text-sm">
          設定を保存しました
        </div>
      )}

      <div className="space-y-6">
        {/* Enabled Fields */}
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-2">
            音声ボタンを表示するフィールド
          </label>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_FIELDS.map(field => (
              <button
                key={field}
                type="button"
                onClick={() => toggleField(field)}
                className={`px-4 py-2 rounded-2xl border transition-colors ${
                  settings.enabled_fields.includes(field)
                    ? 'bg-sora-soft border-sora text-sora font-bold'
                    : 'bg-gray-50 border-gray-200 text-ink-2 hover:bg-gray-100'
                }`}
              >
                {field}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            選択したフィールドに音声再生ボタンが表示されます
          </p>
        </div>

        {/* Voice Selection */}
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-2">
            ボイス
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {VOICES.map(voice => (
              <button
                key={voice.value}
                type="button"
                onClick={() => setSettings(prev => ({ ...prev, voice: voice.value }))}
                className={`p-3 rounded-2xl border text-left transition-colors ${
                  settings.voice === voice.value
                    ? 'bg-sora-soft border-sora'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <div className={`font-medium ${settings.voice === voice.value ? 'text-sora' : 'text-ai'}`}>{voice.label}</div>
                <div className="text-xs text-ink-3">{voice.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Speed Selection */}
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-2">
            再生速度
          </label>
          <div className="flex flex-wrap gap-2">
            {SPEED_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSettings(prev => ({ ...prev, speed: option.value }))}
                className={`px-4 py-2 rounded-2xl border transition-colors ${
                  settings.speed === option.value
                    ? 'bg-sora-soft border-sora text-sora font-bold'
                    : 'bg-gray-50 border-gray-200 text-ink-2 hover:bg-gray-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Test Button */}
        <div className="pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={testVoice}
            disabled={isTestPlaying}
            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-sora text-sora font-bold rounded-2xl hover:bg-sora-soft disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isTestPlaying ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                再生中...
              </>
            ) : (
              <>
                <Volume2 className="w-5 h-5" />
                テスト再生
              </>
            )}
          </button>
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-3 bg-sora text-white rounded-2xl hover:bg-sora-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold"
          >
            {isSaving ? '保存中...' : '設定を保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
