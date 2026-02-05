'use client'

import { useState } from 'react'
import type { GenerationRule, FieldDefinition } from '@/types/database'

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

  const fieldNames = fields.map(f => f.name)

  const addRule = () => {
    const newRule: GenerationRule = {
      id: generateId(),
      name: `生成ルール ${rules.length + 1}`,
      source_fields: fieldNames.length > 0 ? [fieldNames[0]] : [],
      instruction: '',
      target_field: '',
    }
    onChange([...rules, newRule])
    setExpandedRule(rules.length)
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
          <h3 className="text-lg font-medium text-gray-900">AI生成ルール</h3>
          <p className="text-sm text-gray-500 mt-1">
            フィールドの内容を参照してAIで自動生成するルールを定義します
          </p>
        </div>
        <button
          type="button"
          onClick={addRule}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-purple-600 hover:text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          ルール追加
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
          <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="text-sm">AI生成ルールがありません</p>
          <p className="text-xs text-gray-400 mt-1">
            「ルール追加」をクリックして例文やコロケーションの生成ルールを作成できます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, index) => (
            <div
              key={rule.id}
              className="border border-purple-200 rounded-lg overflow-hidden"
            >
              {/* Rule Header */}
              <div className="flex items-center gap-2 p-3 bg-purple-50">
                <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>

                <input
                  type="text"
                  value={rule.name}
                  onChange={(e) => updateRule(index, { name: e.target.value })}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                  placeholder="ルール名"
                />

                <button
                  type="button"
                  onClick={() => setExpandedRule(expandedRule === index ? null : index)}
                  className={`p-2 rounded-lg transition-colors ${
                    expandedRule === index
                      ? 'bg-purple-200 text-purple-700'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
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
                  className="p-2 text-red-400 hover:text-red-600"
                  title="削除"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Rule Details (Expanded) */}
              {expandedRule === index && (
                <div className="p-4 border-t border-purple-200 space-y-4">
                  {/* Source Fields */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      参照フィールド（複数選択可）
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      AIが参照するフィールドを選択してください。選択したフィールドの内容がプロンプトに含まれます。
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {fieldNames.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggleSourceField(index, name)}
                          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                            rule.source_fields.includes(name)
                              ? 'bg-purple-100 border-purple-400 text-purple-700'
                              : 'bg-white border-gray-300 text-gray-600 hover:border-purple-300'
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                    {rule.source_fields.length === 0 && (
                      <p className="text-xs text-red-500 mt-1">少なくとも1つのフィールドを選択してください</p>
                    )}
                  </div>

                  {/* Instruction */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      生成指示
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      AIへの指示を記述してください。どのような内容を生成するかを具体的に書くと精度が上がります。
                    </p>
                    <textarea
                      value={rule.instruction}
                      onChange={(e) => updateRule(index, { instruction: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                      rows={3}
                      placeholder="例: この英単語を使った自然な例文を2つ生成してください。中級レベルの英語で、実用的な文脈を含めてください。"
                    />
                    {!rule.instruction.trim() && (
                      <p className="text-xs text-red-500 mt-1">生成指示を入力してください</p>
                    )}
                  </div>

                  {/* Target Field */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      出力先フィールド
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      生成結果を保存するフィールドを選択してください。フィールドが存在しない場合は新しく作成できます。
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={rule.target_field}
                        onChange={(e) => updateRule(index, { target_field: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
                      >
                        <option value="">フィールドを選択...</option>
                        {fieldNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    {!rule.target_field && (
                      <p className="text-xs text-red-500 mt-1">出力先フィールドを選択してください</p>
                    )}
                    {rule.target_field && rule.source_fields.includes(rule.target_field) && (
                      <p className="text-xs text-amber-600 mt-1">
                        参照フィールドと出力先が同じです。生成結果で上書きされます。
                      </p>
                    )}
                  </div>

                  {/* Summary */}
                  {rule.source_fields.length > 0 && rule.target_field && rule.instruction.trim() && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">ルールのまとめ:</p>
                      <p className="text-sm text-gray-700">
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
