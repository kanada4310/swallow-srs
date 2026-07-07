'use client'

import { useState, useRef } from 'react'
import type { FieldDefinition } from '@/types/database'

export interface TemplateData {
  id?: string
  name: string
  ordinal: number
  front_template: string
  back_template: string
  css: string
}

interface TemplateEditorProps {
  templates: TemplateData[]
  fields: FieldDefinition[]
  onChange: (templates: TemplateData[]) => void
}

type Side = 'front' | 'back' | 'css'

export function TemplateEditor({ templates, fields, onChange }: TemplateEditorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState(0)
  const [selectedSide, setSelectedSide] = useState<Side>('front')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const currentTemplate = templates[selectedTemplate]

  const addTemplate = () => {
    const newTemplate: TemplateData = {
      name: `Card ${templates.length + 1}`,
      ordinal: templates.length,
      front_template: '{{' + (fields[0]?.name || 'Field') + '}}',
      back_template: '{{FrontSide}}\n<hr>\n{{' + (fields[1]?.name || fields[0]?.name || 'Field') + '}}',
      css: '',
    }
    onChange([...templates, newTemplate])
    setSelectedTemplate(templates.length)
  }

  const removeTemplate = (index: number) => {
    if (templates.length <= 1) return
    const newTemplates = templates.filter((_, i) => i !== index)
    // Reorder ordinals
    const reorderedTemplates = newTemplates.map((t, i) => ({ ...t, ordinal: i }))
    onChange(reorderedTemplates)
    if (selectedTemplate >= newTemplates.length) {
      setSelectedTemplate(newTemplates.length - 1)
    }
  }

  const updateTemplateName = (index: number, name: string) => {
    const newTemplates = [...templates]
    newTemplates[index] = { ...newTemplates[index], name }
    onChange(newTemplates)
  }

  const updateTemplateContent = (content: string) => {
    const newTemplates = [...templates]
    if (selectedSide === 'front') {
      newTemplates[selectedTemplate] = { ...currentTemplate, front_template: content }
    } else if (selectedSide === 'back') {
      newTemplates[selectedTemplate] = { ...currentTemplate, back_template: content }
    } else {
      newTemplates[selectedTemplate] = { ...currentTemplate, css: content }
    }
    onChange(newTemplates)
  }

  const insertPlaceholder = (placeholder: string) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentContent =
      selectedSide === 'front'
        ? currentTemplate.front_template
        : selectedSide === 'back'
        ? currentTemplate.back_template
        : currentTemplate.css

    const newContent =
      currentContent.substring(0, start) + placeholder + currentContent.substring(end)

    updateTemplateContent(newContent)

    // Set cursor position after placeholder
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + placeholder.length, start + placeholder.length)
    }, 0)
  }

  const getCurrentContent = () => {
    if (selectedSide === 'front') return currentTemplate.front_template
    if (selectedSide === 'back') return currentTemplate.back_template
    return currentTemplate.css
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-ai">カードテンプレート</h3>
        <button
          type="button"
          onClick={addTemplate}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border-2 border-sora text-sora font-bold rounded-2xl hover:bg-sora-soft transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          テンプレート追加
        </button>
      </div>

      {/* Template Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {templates.map((template, index) => (
          <div key={index} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedTemplate(index)}
              className={`px-4 py-2 rounded-2xl text-sm font-bold transition-colors whitespace-nowrap ${
                selectedTemplate === index
                  ? 'bg-sora text-white'
                  : 'bg-gray-100 text-ink-2 hover:bg-gray-200'
              }`}
            >
              {template.name}
            </button>
            {templates.length > 1 && (
              <button
                type="button"
                onClick={() => removeTemplate(index)}
                className="p-1 text-ink-3 hover:text-again"
                title="削除"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {currentTemplate && (
        <>
          {/* Template Name */}
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">
              テンプレート名
            </label>
            <input
              type="text"
              value={currentTemplate.name}
              onChange={(e) => updateTemplateName(selectedTemplate, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sora focus:border-sora outline-none"
            />
          </div>

          {/* Side Tabs */}
          <div className="flex border-b border-gray-200">
            {(['front', 'back', 'css'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setSelectedSide(side)}
                className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
                  selectedSide === side
                    ? 'border-sora text-sora'
                    : 'border-transparent text-ink-3 hover:text-ink-2 hover:border-gray-300'
                }`}
              >
                {side === 'front' ? '表面' : side === 'back' ? '裏面' : 'CSS'}
              </button>
            ))}
          </div>

          {/* Field Placeholders */}
          {selectedSide !== 'css' && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-ink-3 py-1">挿入:</span>
              {fields.map((field) => (
                <button
                  key={field.name}
                  type="button"
                  onClick={() => insertPlaceholder(`{{${field.name}}}`)}
                  className="px-2 py-1 text-xs bg-gray-100 text-ink-2 rounded-full hover:bg-gray-200 transition-colors font-mono"
                >
                  {`{{${field.name}}}`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => insertPlaceholder('{{FrontSide}}')}
                className="px-2 py-1 text-xs bg-sora-soft text-sora rounded-full hover:bg-gray-200 transition-colors font-mono"
              >
                {'{{FrontSide}}'}
              </button>
              <div className="w-full flex flex-wrap gap-2 mt-1">
                <span className="text-sm text-ink-3 py-1">条件:</span>
                {fields.map((field) => (
                  <button
                    key={`cond-${field.name}`}
                    type="button"
                    onClick={() => insertPlaceholder(`{{#${field.name}}}...{{/${field.name}}}`)}
                    className="px-2 py-1 text-xs bg-good-bg text-good rounded-full hover:bg-gray-200 transition-colors font-mono"
                  >
                    {`{{#${field.name}}}`}
                  </button>
                ))}
                {fields.map((field) => (
                  <button
                    key={`notcond-${field.name}`}
                    type="button"
                    onClick={() => insertPlaceholder(`{{^${field.name}}}...{{/${field.name}}}`)}
                    className="px-2 py-1 text-xs bg-hard-bg text-hard rounded-full hover:bg-gray-200 transition-colors font-mono"
                  >
                    {`{{^${field.name}}}`}
                  </button>
                ))}
              </div>
              <div className="w-full flex flex-wrap gap-2 mt-1">
                <span className="text-sm text-ink-3 py-1">Cloze:</span>
                {fields.map((field) => (
                  <button
                    key={`cloze-${field.name}`}
                    type="button"
                    onClick={() => insertPlaceholder(`{{cloze:${field.name}}}`)}
                    className="px-2 py-1 text-xs bg-easy-bg text-easy rounded-full hover:bg-gray-200 transition-colors font-mono"
                  >
                    {`{{cloze:${field.name}}}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Editor */}
          <textarea
            ref={textareaRef}
            value={getCurrentContent()}
            onChange={(e) => updateTemplateContent(e.target.value)}
            rows={10}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sora focus:border-sora outline-none font-mono text-sm resize-none"
            placeholder={
              selectedSide === 'css'
                ? '.card { font-size: 1.2rem; }'
                : selectedSide === 'front'
                ? '{{Front}}'
                : '{{FrontSide}}\n<hr>\n{{Back}}'
            }
          />
        </>
      )}

      {templates.length === 0 && (
        <div className="text-center py-8 text-ink-3">
          テンプレートがありません。「テンプレート追加」をクリックしてください。
        </div>
      )}
    </div>
  )
}
