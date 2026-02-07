'use client'

import { useState, useMemo, useEffect } from 'react'
import { renderTemplate, type FieldValues } from '@/lib/template'
import { CardIframe } from '@/components/card/CardIframe'
import type { FieldDefinition } from '@/types/database'

interface TemplatePreviewProps {
  frontTemplate: string
  backTemplate: string
  css: string
  fields: FieldDefinition[]
}

export function TemplatePreview({ frontTemplate, backTemplate, css, fields }: TemplatePreviewProps) {
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [sampleData, setSampleData] = useState<FieldValues>({})
  const [debouncedFront, setDebouncedFront] = useState(frontTemplate)
  const [debouncedBack, setDebouncedBack] = useState(backTemplate)
  const [debouncedCss, setDebouncedCss] = useState(css)

  // Initialize sample data with field placeholders
  useEffect(() => {
    setSampleData(prev => {
      const initialData: FieldValues = {}
      fields.forEach((field) => {
        if (!prev[field.name]) {
          initialData[field.name] = field.settings?.placeholder || `Sample ${field.name}`
        }
      })
      if (Object.keys(initialData).length > 0) {
        return { ...initialData, ...prev }
      }
      return prev
    })
  }, [fields])

  // Debounce template changes (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFront(frontTemplate)
      setDebouncedBack(backTemplate)
      setDebouncedCss(css)
    }, 300)
    return () => clearTimeout(timer)
  }, [frontTemplate, backTemplate, css])

  const renderedContent = useMemo(() => {
    try {
      const template = side === 'front' ? debouncedFront : debouncedBack
      return renderTemplate(template, sampleData, {
        side,
        clozeNumber: 1,
      })
    } catch {
      return '<p style="color: #ef4444;">テンプレートエラー</p>'
    }
  }, [debouncedFront, debouncedBack, debouncedCss, sampleData, side])

  const updateSampleData = (fieldName: string, value: string) => {
    setSampleData(prev => ({ ...prev, [fieldName]: value }))
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900">プレビュー</h3>

      {/* Sample Data Input */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">サンプルデータ</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fields.map((field) => (
            <div key={field.name}>
              <label className="block text-xs text-gray-500 mb-1">{field.name}</label>
              <input
                type="text"
                value={sampleData[field.name] || ''}
                onChange={(e) => updateSampleData(field.name, e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder={field.settings?.placeholder || `${field.name}を入力...`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Side Toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSide('front')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            side === 'front'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          表面
        </button>
        <button
          type="button"
          onClick={() => setSide('back')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            side === 'back'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          裏面
        </button>
      </div>

      {/* Preview Card */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-100 px-3 py-2 text-xs text-gray-500 border-b border-gray-200">
          {side === 'front' ? '表面プレビュー' : '裏面プレビュー'}
        </div>
        <div className="bg-white min-h-[200px] p-6 flex items-center justify-center">
          <CardIframe html={renderedContent} css={debouncedCss} minHeight={100} className="w-full" />
        </div>
      </div>

      {/* Raw HTML (Collapsed) */}
      <details className="text-sm">
        <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
          生成されたHTML
        </summary>
        <pre className="mt-2 p-3 bg-gray-100 rounded-lg overflow-x-auto text-xs">
          {renderedContent}
        </pre>
      </details>
    </div>
  )
}
