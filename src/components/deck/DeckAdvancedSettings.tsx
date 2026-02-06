'use client'

import { useState, useEffect, useRef } from 'react'
import type { DeckSettings } from '@/types/database'
import { getDefaultDeckSettings } from '@/lib/srs/scheduler'

interface DeckAdvancedSettingsProps {
  settings: Partial<DeckSettings>
  onChange: (settings: Partial<DeckSettings>) => void
}

type TabKey = 'new' | 'review' | 'lapse' | 'order'

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
  const [activeTab, setActiveTab] = useState<TabKey>('new')
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

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'new', label: '新規カード' },
    { key: 'review', label: '復習' },
    { key: 'lapse', label: '失念' },
    { key: 'order', label: '表示順' },
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
