'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FieldEditor, TemplateEditor, TemplatePreview, type TemplateData } from '@/components/note-type'
import type { FieldDefinition, NoteTypeWithTemplates } from '@/types/database'

interface NoteTypeEditorClientProps {
  mode: 'create' | 'edit'
  noteType?: NoteTypeWithTemplates
}

type Step = 'basic' | 'fields' | 'templates' | 'confirm'

const STEPS: Step[] = ['basic', 'fields', 'templates', 'confirm']
const STEP_LABELS: Record<Step, string> = {
  basic: '基本情報',
  fields: 'フィールド',
  templates: 'テンプレート',
  confirm: '確認',
}

export function NoteTypeEditorClient({ mode, noteType }: NoteTypeEditorClientProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<Step>('basic')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState(noteType?.name || '')
  const [fields, setFields] = useState<FieldDefinition[]>(
    noteType?.fields || [
      { name: 'Front', ord: 0, settings: { required: true, tts_enabled: true, example_source: true } },
      { name: 'Back', ord: 1, settings: { required: true, example_context: true } },
    ]
  )
  const [templates, setTemplates] = useState<TemplateData[]>(
    noteType?.card_templates?.map(t => ({
      id: t.id,
      name: t.name,
      ordinal: t.ordinal,
      front_template: t.front_template,
      back_template: t.back_template,
      css: t.css,
    })) || [
      {
        name: 'Card 1',
        ordinal: 0,
        front_template: '{{Front}}',
        back_template: '{{FrontSide}}\n<hr>\n{{Back}}',
        css: '.card {\n  font-size: 1.2rem;\n  text-align: center;\n}',
      },
    ]
  )

  const isReadOnly = mode === 'edit' && noteType?.is_system

  const currentStepIndex = STEPS.indexOf(currentStep)

  const canProceed = () => {
    switch (currentStep) {
      case 'basic':
        return name.trim().length > 0
      case 'fields':
        return fields.length > 0 && fields.every(f => f.name.trim().length > 0)
      case 'templates':
        return templates.length > 0 && templates.every(t =>
          t.name.trim().length > 0 &&
          t.front_template.trim().length > 0 &&
          t.back_template.trim().length > 0
        )
      case 'confirm':
        return true
      default:
        return false
    }
  }

  const goToNext = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentStepIndex + 1])
    }
  }

  const goToPrevious = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(STEPS[currentStepIndex - 1])
    }
  }

  const handleSubmit = async () => {
    if (isReadOnly) return

    setIsSubmitting(true)
    setError(null)

    try {
      const url = mode === 'create' ? '/api/note-types' : `/api/note-types/${noteType?.id}`
      const method = mode === 'create' ? 'POST' : 'PUT'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          fields,
          templates,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save note type')
      }

      router.push('/note-types')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!noteType?.id || isReadOnly) return

    setIsDeleting(true)
    setError(null)

    try {
      const response = await fetch(`/api/note-types/${noteType.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete note type')
      }

      router.push('/note-types')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setShowDeleteConfirm(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/note-types"
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isReadOnly ? noteType?.name : mode === 'create' ? '新規ノートタイプ' : 'ノートタイプを編集'}
            </h1>
            {isReadOnly && (
              <p className="text-sm text-amber-600 mt-1">
                システムノートタイプは編集できません（閲覧のみ）
              </p>
            )}
          </div>
        </div>

        {mode === 'edit' && !isReadOnly && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            削除
          </button>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">ノートタイプを削除</h3>
            <p className="text-gray-600 mb-4">
              「{noteType?.name}」を削除しますか？この操作は取り消せません。
            </p>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-300 transition-colors"
              >
                {isDeleting ? '削除中...' : '削除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => (
          <div key={step} className="flex items-center">
            <button
              type="button"
              onClick={() => setCurrentStep(step)}
              disabled={isReadOnly}
              className={`flex items-center gap-2 ${
                currentStep === step
                  ? 'text-blue-600'
                  : index < currentStepIndex
                  ? 'text-green-600'
                  : 'text-gray-400'
              } ${isReadOnly ? 'cursor-not-allowed' : ''}`}
            >
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                currentStep === step
                  ? 'bg-blue-600 text-white'
                  : index < currentStepIndex
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {index < currentStepIndex ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className="hidden sm:inline text-sm font-medium">{STEP_LABELS[step]}</span>
            </button>
            {index < STEPS.length - 1 && (
              <div className={`w-12 sm:w-24 h-1 mx-2 rounded ${
                index < currentStepIndex ? 'bg-green-600' : 'bg-gray-200'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && !showDeleteConfirm && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {currentStep === 'basic' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-gray-900 mb-4">基本情報</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ノートタイプ名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isReadOnly}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="例: Basic (英→日)"
              />
              <p className="mt-1 text-sm text-gray-500">
                ノートタイプを識別するための名前を入力してください
              </p>
            </div>
          </div>
        )}

        {currentStep === 'fields' && (
          <div className="pointer-events-auto">
            {isReadOnly ? (
              <div>
                <h2 className="text-lg font-medium text-gray-900 mb-4">フィールド</h2>
                <div className="space-y-2">
                  {fields.map((field, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium">{field.name}</span>
                      {field.settings && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {field.settings.tts_enabled && (
                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">TTS</span>
                          )}
                          {field.settings.example_source && (
                            <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">例文ソース</span>
                          )}
                          {field.settings.example_context && (
                            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">例文コンテキスト</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <FieldEditor fields={fields} onChange={setFields} />
            )}
          </div>
        )}

        {currentStep === 'templates' && (
          <div className="space-y-8">
            {isReadOnly ? (
              <div>
                <h2 className="text-lg font-medium text-gray-900 mb-4">テンプレート</h2>
                {templates.map((template, index) => (
                  <div key={index} className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-medium mb-2">{template.name}</h3>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">表面:</span>
                        <pre className="mt-1 p-2 bg-white rounded border text-xs overflow-x-auto">
                          {template.front_template}
                        </pre>
                      </div>
                      <div>
                        <span className="text-gray-500">裏面:</span>
                        <pre className="mt-1 p-2 bg-white rounded border text-xs overflow-x-auto">
                          {template.back_template}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <TemplateEditor
                  templates={templates}
                  fields={fields}
                  onChange={setTemplates}
                />
                <div className="border-t pt-8">
                  <TemplatePreview
                    frontTemplate={templates[0]?.front_template || ''}
                    backTemplate={templates[0]?.back_template || ''}
                    css={templates[0]?.css || ''}
                    fields={fields}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {currentStep === 'confirm' && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">確認</h2>

            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-500 mb-1">ノートタイプ名</h3>
                <p className="text-lg font-medium">{name}</p>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-500 mb-2">フィールド</h3>
                <div className="flex flex-wrap gap-2">
                  {fields.map((field, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm"
                    >
                      {field.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-500 mb-2">テンプレート</h3>
                <div className="flex flex-wrap gap-2">
                  {templates.map((template, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm"
                    >
                      {template.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {!isReadOnly && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  上記の内容で{mode === 'create' ? 'ノートタイプを作成' : '変更を保存'}します。
                  よろしければ「{mode === 'create' ? '作成' : '保存'}」ボタンをクリックしてください。
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={goToPrevious}
          disabled={currentStepIndex === 0}
          className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          前へ
        </button>

        <div className="flex gap-3">
          <Link
            href="/note-types"
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            キャンセル
          </Link>

          {currentStep === 'confirm' ? (
            !isReadOnly && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? '保存中...' : mode === 'create' ? '作成' : '保存'}
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={goToNext}
              disabled={!canProceed()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
            >
              次へ
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
