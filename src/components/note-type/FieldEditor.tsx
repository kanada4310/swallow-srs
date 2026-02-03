'use client'

import { useState } from 'react'
import type { FieldDefinition, FieldSettings } from '@/types/database'

interface FieldEditorProps {
  fields: FieldDefinition[]
  onChange: (fields: FieldDefinition[]) => void
}

export function FieldEditor({ fields, onChange }: FieldEditorProps) {
  const [expandedField, setExpandedField] = useState<number | null>(null)

  const addField = () => {
    const newField: FieldDefinition = {
      name: `Field ${fields.length + 1}`,
      ord: fields.length,
      settings: {
        required: true,
      },
    }
    onChange([...fields, newField])
  }

  const removeField = (index: number) => {
    if (fields.length <= 1) return
    const newFields = fields.filter((_, i) => i !== index)
    // Reorder ordinals
    const reorderedFields = newFields.map((f, i) => ({ ...f, ord: i }))
    onChange(reorderedFields)
    if (expandedField === index) setExpandedField(null)
  }

  const moveField = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === fields.length - 1) return

    const newFields = [...fields]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    ;[newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]]

    // Reorder ordinals
    const reorderedFields = newFields.map((f, i) => ({ ...f, ord: i }))
    onChange(reorderedFields)

    // Update expanded field index if needed
    if (expandedField === index) {
      setExpandedField(targetIndex)
    } else if (expandedField === targetIndex) {
      setExpandedField(index)
    }
  }

  const updateFieldName = (index: number, name: string) => {
    const newFields = [...fields]
    newFields[index] = { ...newFields[index], name }
    onChange(newFields)
  }

  const updateFieldSettings = (index: number, settings: Partial<FieldSettings>) => {
    const newFields = [...fields]
    newFields[index] = {
      ...newFields[index],
      settings: { ...newFields[index].settings, ...settings },
    }
    onChange(newFields)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">フィールド</h3>
        <button
          type="button"
          onClick={addField}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          フィールド追加
        </button>
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={index}
            className="border border-gray-200 rounded-lg overflow-hidden"
          >
            {/* Field Header */}
            <div className="flex items-center gap-2 p-3 bg-gray-50">
              {/* Move Buttons */}
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => moveField(index, 'up')}
                  disabled={index === 0}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="上に移動"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => moveField(index, 'down')}
                  disabled={index === fields.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="下に移動"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Field Name Input */}
              <input
                type="text"
                value={field.name}
                onChange={(e) => updateFieldName(index, e.target.value)}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                placeholder="フィールド名"
              />

              {/* Settings Toggle */}
              <button
                type="button"
                onClick={() => setExpandedField(expandedField === index ? null : index)}
                className={`p-2 rounded-lg transition-colors ${
                  expandedField === index
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
                title="設定"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {/* Delete Button */}
              <button
                type="button"
                onClick={() => removeField(index)}
                disabled={fields.length <= 1}
                className="p-2 text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                title="削除"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>

            {/* Field Settings (Expanded) */}
            {expandedField === index && (
              <div className="p-4 border-t border-gray-200 space-y-4">
                {/* Placeholder */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    プレースホルダー
                  </label>
                  <input
                    type="text"
                    value={field.settings?.placeholder || ''}
                    onChange={(e) => updateFieldSettings(index, { placeholder: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                    placeholder="例: 単語を入力..."
                  />
                </div>

                {/* Checkboxes */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.settings?.required !== false}
                      onChange={(e) => updateFieldSettings(index, { required: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">必須フィールド</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.settings?.tts_enabled || false}
                      onChange={(e) => updateFieldSettings(index, { tts_enabled: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">TTS音声生成対象</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.settings?.example_source || false}
                      onChange={(e) => updateFieldSettings(index, { example_source: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">例文生成のソース（単語）</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.settings?.example_context || false}
                      onChange={(e) => updateFieldSettings(index, { example_context: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">例文生成のコンテキスト（意味）</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {fields.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          フィールドがありません。「フィールド追加」をクリックしてください。
        </div>
      )}
    </div>
  )
}
