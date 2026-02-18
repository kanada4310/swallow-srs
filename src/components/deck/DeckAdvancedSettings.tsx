'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { DeckSettings, TTSVoice } from '@/types/database'
import { getDefaultDeckSettings } from '@/lib/srs/scheduler'

interface DeckAdvancedSettingsProps {
  settings: Partial<DeckSettings>
  onChange: (settings: Partial<DeckSettings>) => void
}

type TabKey = 'algorithm' | 'new' | 'review' | 'lapse' | 'order' | 'timer' | 'swipe' | 'tts'

// Number input component that allows free editing and validates on blur
function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  className,
  isFloat = false,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: string
  className?: string
  isFloat?: boolean
}) {
  const [localValue, setLocalValue] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync with external value changes (e.g., reset to defaults)
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setLocalValue(String(value))
    }
  }, [value])

  const handleBlur = () => {
    let parsed = isFloat ? parseFloat(localValue) : parseInt(localValue)
    if (isNaN(parsed)) {
      parsed = min ?? 0
    }
    if (min !== undefined) parsed = Math.max(min, parsed)
    if (max !== undefined) parsed = Math.min(max, parsed)
    setLocalValue(String(parsed))
    onChange(parsed)
  }

  return (
    <input
      ref={inputRef}
      type="number"
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      min={min}
      max={max}
      step={step}
      className={className}
    />
  )
}

export function DeckAdvancedSettings({ settings, onChange }: DeckAdvancedSettingsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('algorithm')
  const defaults = getDefaultDeckSettings()

  const resolved = { ...defaults, ...settings }

  const update = (key: keyof DeckSettings, value: DeckSettings[keyof DeckSettings]) => {
    onChange({ ...settings, [key]: value })
  }

  const resetToDefaults = () => {
    onChange({})
  }

  const parseSteps = (input: string): number[] => {
    return input
      .split(/[,\s]+/)
      .map(s => parseFloat(s.trim()))
      .filter(n => !isNaN(n) && n > 0)
  }

  const isFSRS = resolved.algorithm === 'fsrs'

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'algorithm', label: 'アルゴリズム' },
    { key: 'new', label: '新規カード' },
    { key: 'review', label: '復習' },
    { key: 'lapse', label: '失念' },
    { key: 'order', label: '表示順' },
    { key: 'timer', label: 'タイマー' },
    { key: 'swipe', label: 'スワイプ' },
    { key: 'tts', label: '音声' },
  ]

  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span>詳細設定（学習オプション）</span>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-gray-200 px-4 py-4">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-4">
            {tabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="space-y-4">
            {activeTab === 'algorithm' && (
              <>
                <SettingField label="スケジューリングアルゴリズム" description="FSRSはSM-2より効率的な復習スケジュールを生成します">
                  <select
                    value={resolved.algorithm}
                    onChange={e => update('algorithm', e.target.value as 'sm2' | 'fsrs')}
                    className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="sm2">SM-2（従来）</option>
                    <option value="fsrs">FSRS</option>
                  </select>
                </SettingField>

                {isFSRS && (
                  <>
                    <SettingField label="目標記憶率" description="高いほど復習頻度が上がります（0.70〜0.97）">
                      <NumberInput
                        value={resolved.fsrs_desired_retention}
                        onChange={v => update('fsrs_desired_retention', v)}
                        min={0.7}
                        max={0.97}
                        step="0.01"
                        isFloat
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </SettingField>

                    <SettingField label="最大間隔（日）" description="FSRSが設定する復習間隔の上限">
                      <NumberInput
                        value={resolved.fsrs_maximum_interval}
                        onChange={v => update('fsrs_maximum_interval', v)}
                        min={1}
                        max={36500}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </SettingField>

                    <SettingField label="ファジング" description="復習間隔にランダムな変動を追加して分散させます">
                      <button
                        type="button"
                        onClick={() => update('fsrs_enable_fuzz', !resolved.fsrs_enable_fuzz)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          resolved.fsrs_enable_fuzz ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            resolved.fsrs_enable_fuzz ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </SettingField>

                    <SettingField label="短期スケジュール" description="学習ステップを使用します。オフにすると新規カードも即座に長期復習に入ります">
                      <button
                        type="button"
                        onClick={() => update('fsrs_enable_short_term', !resolved.fsrs_enable_short_term)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          resolved.fsrs_enable_short_term ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            resolved.fsrs_enable_short_term ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </SettingField>

                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-xs text-blue-700">
                        FSRSは機械学習ベースのアルゴリズムで、SM-2に比べて復習回数を20〜30%削減しながら同等以上の記憶定着を実現します。
                      </p>
                    </div>
                  </>
                )}
              </>
            )}

            {activeTab === 'new' && (
              <>
                <SettingField label="1日の新規カード数" description="0にすると新規カードは出題されません">
                  <NumberInput
                    value={resolved.new_cards_per_day}
                    onChange={v => update('new_cards_per_day', v)}
                    min={0}
                    max={9999}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </SettingField>

                <SettingField label="学習ステップ（分）" description="カンマ区切り。例: 1, 10">
                  <input
                    type="text"
                    defaultValue={resolved.learning_steps.join(', ')}
                    onBlur={e => {
                      const steps = parseSteps(e.target.value)
                      if (steps.length > 0) update('learning_steps', steps)
                    }}
                    className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="1, 10"
                  />
                </SettingField>

                <SettingField label="卒業間隔（日）" description="学習ステップ完了後の初回復習間隔">
                  <NumberInput
                    value={resolved.graduating_interval}
                    onChange={v => update('graduating_interval', v)}
                    min={1}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </SettingField>

                <SettingField label="Easy間隔（日）" description="学習中にEasyを押した時の復習間隔">
                  <NumberInput
                    value={resolved.easy_interval}
                    onChange={v => update('easy_interval', v)}
                    min={1}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </SettingField>

                <SettingField label="新規カードの順序">
                  <select
                    value={resolved.new_card_order}
                    onChange={e => update('new_card_order', e.target.value as 'sequential' | 'random')}
                    className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="sequential">登録順</option>
                    <option value="random">ランダム</option>
                  </select>
                </SettingField>
              </>
            )}

            {activeTab === 'review' && (
              <>
                <SettingField label="1日の最大復習数" description="0にすると無制限">
                  <NumberInput
                    value={resolved.max_reviews_per_day}
                    onChange={v => update('max_reviews_per_day', v)}
                    min={0}
                    max={9999}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </SettingField>

                {!isFSRS && (
                  <>
                    <SettingField label="Easyボーナス" description="Easyで追加される倍率">
                      <NumberInput
                        value={resolved.easy_bonus}
                        onChange={v => update('easy_bonus', v)}
                        min={1.0}
                        max={5.0}
                        step="0.1"
                        isFloat
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </SettingField>

                    <SettingField label="間隔倍率" description="全ての間隔に適用される倍率。1.0が標準">
                      <NumberInput
                        value={resolved.interval_modifier}
                        onChange={v => update('interval_modifier', v)}
                        min={0.1}
                        max={5.0}
                        step="0.05"
                        isFloat
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </SettingField>

                    <SettingField label="最大間隔（日）" description="復習間隔の上限">
                      <NumberInput
                        value={resolved.max_interval}
                        onChange={v => update('max_interval', v)}
                        min={1}
                        max={36500}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </SettingField>

                    <SettingField label="Hard倍率" description="Hardで適用される間隔倍率">
                      <NumberInput
                        value={resolved.hard_interval_modifier}
                        onChange={v => update('hard_interval_modifier', v)}
                        min={0.5}
                        max={3.0}
                        step="0.1"
                        isFloat
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </SettingField>
                  </>
                )}

                {isFSRS && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">
                      FSRSモードでは、間隔計算はアルゴリズムタブの設定（目標記憶率等）で制御されます。
                    </p>
                  </div>
                )}
              </>
            )}

            {activeTab === 'lapse' && (
              <>
                <SettingField label="再学習ステップ（分）" description="カンマ区切り。例: 10">
                  <input
                    type="text"
                    defaultValue={resolved.relearning_steps.join(', ')}
                    onBlur={e => {
                      const steps = parseSteps(e.target.value)
                      if (steps.length > 0) update('relearning_steps', steps)
                    }}
                    className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="10"
                  />
                </SettingField>

                {!isFSRS && (
                  <>
                    <SettingField label="新しい間隔（倍率）" description="失念時に現在の間隔にかける倍率（0.0〜1.0）">
                      <NumberInput
                        value={resolved.lapse_new_interval}
                        onChange={v => update('lapse_new_interval', v)}
                        min={0}
                        max={1}
                        step="0.05"
                        isFloat
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </SettingField>

                    <SettingField label="最小間隔（日）" description="失念後の最小復習間隔">
                      <NumberInput
                        value={resolved.lapse_min_interval}
                        onChange={v => update('lapse_min_interval', v)}
                        min={1}
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </SettingField>
                  </>
                )}

                <SettingField label="リーチしきい値" description="この回数失念するとリーチ判定。0で無効">
                  <NumberInput
                    value={resolved.leech_threshold}
                    onChange={v => update('leech_threshold', v)}
                    min={0}
                    max={99}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </SettingField>

                <SettingField label="リーチ時のアクション">
                  <select
                    value={resolved.leech_action}
                    onChange={e => update('leech_action', e.target.value as 'suspend' | 'tag')}
                    className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="tag">タグを付ける</option>
                    <option value="suspend">一時停止する</option>
                  </select>
                </SettingField>
              </>
            )}

            {activeTab === 'order' && (
              <>
                <SettingField label="新規/復習の混合方式">
                  <select
                    value={resolved.new_review_mix}
                    onChange={e => update('new_review_mix', e.target.value as 'mix' | 'new_first' | 'review_first')}
                    className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="review_first">復習カードを先に</option>
                    <option value="new_first">新規カードを先に</option>
                    <option value="mix">混合</option>
                  </select>
                </SettingField>

                <SettingField label="復習カードの並び順">
                  <select
                    value={resolved.review_sort}
                    onChange={e => update('review_sort', e.target.value as 'due_date' | 'due_date_random' | 'random')}
                    className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="due_date">期日順</option>
                    <option value="due_date_random">期日順（同日ランダム）</option>
                    <option value="random">ランダム</option>
                  </select>
                </SettingField>
              </>
            )}

            {activeTab === 'timer' && (
              <>
                <SettingField label="回答制限時間（秒）" description="0でタイマー無効。カード表示からのカウントダウン秒数を設定">
                  <NumberInput
                    value={resolved.answer_time_limit}
                    onChange={v => update('answer_time_limit', v)}
                    min={0}
                    max={999}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </SettingField>

                <SettingField label="時間切れ時のアクション" description="表示のみ: カウントダウンのみ / 自動めくり: カードを自動でめくる / 自動「もう一度」: めくって自動回答">
                  <select
                    value={resolved.timer_action}
                    onChange={e => update('timer_action', e.target.value as 'flip' | 'auto_again' | 'none')}
                    disabled={resolved.answer_time_limit === 0}
                    className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
                  >
                    <option value="none">表示のみ</option>
                    <option value="flip">自動めくり</option>
                    <option value="auto_again">自動「もう一度」</option>
                  </select>
                </SettingField>
              </>
            )}

            {activeTab === 'swipe' && (
              <>
                <SettingField label="スワイプジェスチャー" description="タッチ操作でカードをスワイプして回答できます">
                  <button
                    type="button"
                    onClick={() => update('swipe_enabled', !resolved.swipe_enabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      resolved.swipe_enabled ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        resolved.swipe_enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </SettingField>

                {resolved.swipe_enabled && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">操作ガイド</p>
                    <div className="space-y-2 text-sm text-gray-600">
                      <p className="font-medium text-gray-700 mb-1">表面（問題）:</p>
                      <div className="flex items-center gap-2 pl-2">
                        <span className="text-blue-600">↑ 上スワイプ</span>
                        <span className="text-gray-400">=</span>
                        <span>答えを見る</span>
                      </div>
                      <p className="font-medium text-gray-700 mt-3 mb-1">裏面（回答）:</p>
                      <div className="flex items-center gap-2 pl-2">
                        <span className="text-red-500">← 左スワイプ</span>
                        <span className="text-gray-400">=</span>
                        <span>もう一度</span>
                      </div>
                      <div className="flex items-center gap-2 pl-2">
                        <span className="text-orange-500">↓ 下スワイプ</span>
                        <span className="text-gray-400">=</span>
                        <span>難しい</span>
                      </div>
                      <div className="flex items-center gap-2 pl-2">
                        <span className="text-green-500">→ 右スワイプ</span>
                        <span className="text-gray-400">=</span>
                        <span>正解</span>
                      </div>
                      <div className="flex items-center gap-2 pl-2">
                        <span className="text-blue-500">↑ 上スワイプ</span>
                        <span className="text-gray-400">=</span>
                        <span>簡単</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'tts' && (
              <TTSTab resolved={resolved} update={update} />
            )}
          </div>

          {/* Reset button */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={resetToDefaults}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              デフォルトに戻す
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const VOICES: { value: TTSVoice; label: string; description: string }[] = [
  { value: 'alloy', label: 'Alloy', description: 'ニュートラルで自然' },
  { value: 'echo', label: 'Echo', description: '男性的で落ち着いた' },
  { value: 'fable', label: 'Fable', description: '表現豊かでドラマチック' },
  { value: 'onyx', label: 'Onyx', description: '深みのある男性的' },
  { value: 'nova', label: 'Nova', description: '明るく女性的' },
  { value: 'shimmer', label: 'Shimmer', description: '柔らかく女性的' },
]

const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1.0, label: '1.0x' },
  { value: 1.25, label: '1.25x' },
]

function TTSTab({
  resolved,
  update,
}: {
  resolved: DeckSettings
  update: (key: keyof DeckSettings, value: DeckSettings[keyof DeckSettings]) => void
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handleTestPlay = useCallback(async () => {
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setIsPlaying(false)
      return
    }

    setIsPlaying(true)
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'This is a test of the text to speech voice.',
          voice: resolved.tts_voice,
          speed: resolved.tts_speed,
          skipSave: true,
        }),
      })

      if (!response.ok) throw new Error('TTS error')
      const data = await response.json()
      if (!data.audioUrl) throw new Error('No audio URL')

      const audio = new Audio(data.audioUrl)
      audioRef.current = audio
      audio.onended = () => {
        setIsPlaying(false)
        audioRef.current = null
      }
      audio.onerror = () => {
        setIsPlaying(false)
        audioRef.current = null
      }
      await audio.play()
    } catch {
      setIsPlaying(false)
    }
  }, [isPlaying, resolved.tts_voice, resolved.tts_speed])

  return (
    <>
      <SettingField label="ボイス" description="TTS音声のボイスを選択">
        <div className="grid grid-cols-2 gap-2">
          {VOICES.map(v => (
            <button
              key={v.value}
              type="button"
              onClick={() => update('tts_voice', v.value)}
              className={`px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                resolved.tts_voice === v.value
                  ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="font-medium">{v.label}</span>
              <span className="block text-xs text-gray-500">{v.description}</span>
            </button>
          ))}
        </div>
      </SettingField>

      <SettingField label="速度" description="TTS音声の再生速度">
        <div className="flex gap-2">
          {SPEED_OPTIONS.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => update('tts_speed', s.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                resolved.tts_speed === s.value
                  ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </SettingField>

      <button
        type="button"
        onClick={handleTestPlay}
        className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
          isPlaying
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        {isPlaying ? '再生中...' : 'テスト再生'}
      </button>
    </>
  )
}

function SettingField({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}
