'use client'

import { useState, useRef, useEffect } from 'react'
import type { GenerationRule, FieldDefinition } from '@/types/database'
import { TAGGING_PRESETS } from '@/lib/tagging/presets'

interface GenerationRuleEditorProps {
  rules: GenerationRule[]
  fields: FieldDefinition[]
  onChange: (rules: GenerationRule[]) => void
}

function generateId(): string {
  return crypto.randomUUID()
}

export function GenerationRuleEditor({ rules, fields, onChange }: GenerationRuleEditorProps) {
  const [expandedRule, setExpandedRule] = useState<number | null>(null)
  const [showPresetMenu, setShowPresetMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const fieldNames = fields.map(f => f.name)

  // Close preset menu when clicking outside
  useEffect(() => {
    if (!showPresetMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowPresetMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPresetMenu])

  const addEmptyRule = () => {
    const newRule: GenerationRule = {
      id: generateId(),
      name: `生成ルール ${rules.length + 1}`,
      source_fields: fieldNames.length > 0 ? [fieldNames[0]] : [],
      instruction: '',
      target_field: '',
    }
    onChange([...rules, newRule])
    setExpandedRule(rules.length)
    setShowPresetMenu(false)
  }

  const addPresetRule = (presetId: string) => {
    const preset = TAGGING_PRESETS.find(p => p.id === presetId)
    if (!preset) return

    // Auto-select source fields based on preset roles (pick first N fields matching roles)
    const sourceFields: string[] = []
    const minFields = Math.min(preset.sourceRoles.length, fieldNames.length)
    for (let i = 0; i < minFields; i++) {
      sourceFields.push(fieldNames[i])
    }

    // Find or suggest target field
    let targetField = ''
    // Look for an existing field that ends with the suffix
    const suffixField = fieldNames.find(n => n.endsWith(preset.suggestedTargetSuffix))
    if (suffixField) {
      targetField = suffixField
    }

    const newRule: GenerationRule = {
      id: generateId(),
      name: preset.suggestedRuleName,
      source_fields: sourceFields,
      instruction: preset.buildInstruction(fieldNames),
      target_field: targetField,
    }
    onChange([...rules, newRule])
    setExpandedRule(rules.length)
    setShowPresetMenu(false)
  }

  const removeRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index))
    if (expandedRule === index) setExpandedRule(null)
  }

  const updateRule = (index: number, updates: Partial<GenerationRule>) => {
    const newRules = [...rules]
    newRules[index] = { ...newRules[index], ...updates }
    onChange(newRules)
  }

  const toggleSourceField = (ruleIndex: number, fieldName: string) => {
    const rule = rules[ruleIndex]
    const current = rule.source_fields
    const updated = current.includes(fieldName)
      ? current.filter(f => f !== fieldName)
      : [...current, fieldName]
    updateRule(ruleIndex, { source_fields: updated })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-ai">AI生成ルール</h3>
          <p className="text-sm text-ink-3 mt-1">
            フィールドの内容を参照してAIで自動生成するルールを定義します
          </p>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowPresetMenu(!showPresetMenu)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border-2 border-sora text-sora font-bold rounded-2xl hover:bg-sora-soft transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            ルール追加
            <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showPresetMenu && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-2xl shadow-lg z-10">
              <div className="py-1">
                <button
                  type="button"
                  onClick={addEmptyRule}
                  className="w-full text-left px-4 py-2 text-sm text-ink-2 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium">空のルール</span>
                  <p className="text-xs text-ink-3 mt-0.5">ゼロからルールを作成</p>
                </button>
                <div className="border-t border-gray-100 my-1" />
                <div className="px-4 py-1.5">
                  <span className="text-xs font-medium text-ink-3 uppercase">プリセット</span>
                </div>
                {TAGGING_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => addPresetRule(preset.id)}
                    className="w-full text-left px-4 py-2 text-sm text-ink-2 hover:bg-sora-soft transition-colors"
                  >
                    <span className="font-medium text-sora">{preset.name}</span>
                    <p className="text-xs text-ink-3 mt-0.5">{preset.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-8 text-ink-3 border-2 border-dashed border-gray-200 rounded-2xl">
          <svg className="w-8 h-8 mx-auto mb-2 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="text-sm">AI生成ルールがありません</p>
          <p className="text-xs text-ink-3 mt-1">
            「ルール追加」をクリックして例文やコロケーションの生成ルールを作成できます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, index) => (
            <div
              key={rule.id}
              className="border border-gray-200 rounded-2xl overflow-hidden"
            >
              {/* Rule Header */}
              <div className="flex items-center gap-2 p-3 bg-sora-soft">
                <svg className="w-4 h-4 text-sora flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>

                <input
                  type="text"
                  value={rule.name}
                  onChange={(e) => updateRule(index, { name: e.target.value })}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sora focus:border-sora outline-none text-sm"
                  placeholder="ルール名"
                />

                <button
                  type="button"
                  onClick={() => setExpandedRule(expandedRule === index ? null : index)}
                  className={`p-2 rounded-xl transition-colors ${
                    expandedRule === index
                      ? 'bg-sora text-white'
                      : 'text-ink-3 hover:text-ink-2 hover:bg-gray-100'
                  }`}
                  title="設定"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => removeRule(index)}
                  className="p-2 text-ink-3 hover:text-again"
                  title="削除"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Rule Details (Expanded) */}
              {expandedRule === index && (
                <div className="p-4 border-t border-gray-200 space-y-4">
                  {/* Source Fields */}
                  <div>
                    <label className="block text-sm font-medium text-ink-2 mb-2">
                      参照フィールド（複数選択可）
                    </label>
                    <p className="text-xs text-ink-3 mb-2">
                      AIが参照するフィールドを選択してください。選択したフィールドの内容がプロンプトに含まれます。
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {fieldNames.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggleSourceField(index, name)}
                          className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                            rule.source_fields.includes(name)
                              ? 'bg-sora-soft border-sora text-sora font-bold'
                              : 'bg-white border-gray-300 text-ink-2 hover:border-sora'
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                    {rule.source_fields.length === 0 && (
                      <p className="text-xs text-again mt-1">少なくとも1つのフィールドを選択してください</p>
                    )}
                  </div>

                  {/* Instruction */}
                  <div>
                    <label className="block text-sm font-medium text-ink-2 mb-2">
                      生成指示
                    </label>
                    <p className="text-xs text-ink-3 mb-2">
                      AIへの指示を記述してください。どのような内容を生成するかを具体的に書くと精度が上がります。
                    </p>
                    <textarea
                      value={rule.instruction}
                      onChange={(e) => updateRule(index, { instruction: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sora focus:border-sora outline-none text-sm"
                      rows={3}
                      placeholder="例: この英単語を使った自然な例文を2つ生成してください。中級レベルの英語で、実用的な文脈を含めてください。"
                    />
                    {!rule.instruction.trim() && (
                      <p className="text-xs text-again mt-1">生成指示を入力してください</p>
                    )}
                  </div>

                  {/* Target Field */}
                  <div>
                    <label className="block text-sm font-medium text-ink-2 mb-2">
                      出力先フィールド
                    </label>
                    <p className="text-xs text-ink-3 mb-2">
                      生成結果を保存するフィールドを選択してください。フィールドが存在しない場合は新しく作成できます。
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={rule.target_field}
                        onChange={(e) => updateRule(index, { target_field: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sora focus:border-sora outline-none text-sm"
                      >
                        <option value="">フィールドを選択...</option>
                        {fieldNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    {!rule.target_field && (
                      <p className="text-xs text-again mt-1">出力先フィールドを選択してください</p>
                    )}
                    {rule.target_field && rule.source_fields.includes(rule.target_field) && (
                      <p className="text-xs text-hard mt-1">
                        参照フィールドと出力先が同じです。生成結果で上書きされます。
                      </p>
                    )}
                  </div>

                  {/* Summary */}
                  {rule.source_fields.length > 0 && rule.target_field && rule.instruction.trim() && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs font-medium text-ink-3 mb-1">ルールのまとめ:</p>
                      <p className="text-sm text-ink-2">
                        <span className="font-medium">{rule.source_fields.join(', ')}</span>
                        {' '}を参照して → {' '}
                        <span className="font-medium">{rule.target_field}</span>
                        {' '}に生成
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
