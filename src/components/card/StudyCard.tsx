'use client'

import { useState, useMemo } from 'react'
import { Ease } from '@/lib/srs/scheduler'
import { renderTemplate, type FieldValues } from '@/lib/template'
import { AudioButton } from '@/components/audio/AudioButton'
import type { GeneratedContent, FieldDefinition } from '@/types/database'

interface StudyCardProps {
  noteId: string
  fieldValues: FieldValues
  audioUrls: Record<string, string> | null
  generatedContent: GeneratedContent | null
  template: {
    front: string
    back: string
    css: string
  }
  fields?: FieldDefinition[]
  clozeNumber?: number
  intervalPreviews: Record<Ease, string>
  onAnswer: (ease: Ease) => void
}

export function StudyCard({
  noteId,
  fieldValues,
  audioUrls,
  generatedContent,
  template,
  fields,
  clozeNumber,
  intervalPreviews,
  onAnswer,
}: StudyCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)

  // Render templates with sanitization
  const renderedFront = useMemo(() => {
    return renderTemplate(
      template.front,
      fieldValues,
      template.css,
      { side: 'front', clozeNumber }
    )
  }, [template.front, template.css, fieldValues, clozeNumber])

  const renderedBack = useMemo(() => {
    return renderTemplate(
      template.back,
      fieldValues,
      template.css,
      { side: 'back', clozeNumber }
    )
  }, [template.back, template.css, fieldValues, clozeNumber])

  // Determine which fields to show audio buttons for based on field settings
  const ttsEnabledFields = useMemo(() => {
    if (fields) {
      return fields
        .filter(f => f.settings?.tts_enabled)
        .map(f => f.name)
    }
    // Fallback for legacy: Front/Text on front, Back/Extra on back
    return null
  }, [fields])

  // Get TTS fields for front side
  const frontTtsFields = useMemo(() => {
    if (ttsEnabledFields) {
      // Return first TTS-enabled field that has a value
      return ttsEnabledFields
        .filter(name => fieldValues[name])
        .slice(0, 1) // Show max 1 audio button on front
    }
    // Legacy fallback
    if (fieldValues['Front']) return ['Front']
    if (fieldValues['Text']) return ['Text']
    return []
  }, [ttsEnabledFields, fieldValues])

  // Get TTS fields for back side (all TTS-enabled fields except those shown on front)
  const backTtsFields = useMemo(() => {
    if (ttsEnabledFields) {
      return ttsEnabledFields
        .filter(name => fieldValues[name] && !frontTtsFields.includes(name))
    }
    // Legacy fallback
    if (fieldValues['Back']) return ['Back']
    if (fieldValues['Extra']) return ['Extra']
    return []
  }, [ttsEnabledFields, fieldValues, frontTtsFields])

  const handleFlip = () => {
    setIsFlipped(true)
  }

  const handleAnswer = (ease: Ease) => {
    onAnswer(ease)
    setIsFlipped(false)
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Card */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 min-h-[300px] flex flex-col">
        {/* Front */}
        <div className="flex-1 p-8 flex flex-col items-center justify-center relative">
          <div
            className="text-xl text-center w-full"
            dangerouslySetInnerHTML={{ __html: renderedFront }}
          />
          {frontTtsFields.length > 0 && (
            <div className="mt-4 flex gap-2">
              {frontTtsFields.map(fieldName => (
                <AudioButton
                  key={fieldName}
                  noteId={noteId}
                  fieldName={fieldName}
                  text={fieldValues[fieldName] || ''}
                  audioUrl={audioUrls?.[fieldName]}
                  size="md"
                />
              ))}
            </div>
          )}
        </div>

        {/* Divider and Back (when flipped) */}
        {isFlipped && (
          <>
            <hr className="border-gray-200" />
            <div className="flex-1 p-8 flex flex-col items-center justify-center bg-gray-50">
              <div
                className="text-xl text-center w-full"
                dangerouslySetInnerHTML={{ __html: renderedBack }}
              />
              {backTtsFields.length > 0 && (
                <div className="mt-4 flex gap-2">
                  {backTtsFields.map(fieldName => (
                    <AudioButton
                      key={fieldName}
                      noteId={noteId}
                      fieldName={fieldName}
                      text={fieldValues[fieldName] || ''}
                      audioUrl={audioUrls?.[fieldName]}
                      size="md"
                    />
                  ))}
                </div>
              )}

              {/* Generated Examples */}
              {generatedContent && generatedContent.examples && generatedContent.examples.length > 0 && (
                <div className="mt-6 w-full max-w-md">
                  <p className="text-xs font-medium text-purple-600 mb-2 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    例文
                  </p>
                  <ul className="space-y-2">
                    {generatedContent.examples.map((example, idx) => (
                      <li key={idx} className="text-sm text-gray-600 pl-3 border-l-2 border-purple-300">
                        {example}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Buttons */}
      <div className="mt-6">
        {!isFlipped ? (
          <button
            onClick={handleFlip}
            className="w-full py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-lg font-medium"
          >
            答えを見る
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            <AnswerButton
              label="もう一度"
              interval={intervalPreviews[Ease.Again]}
              color="red"
              onClick={() => handleAnswer(Ease.Again)}
            />
            <AnswerButton
              label="難しい"
              interval={intervalPreviews[Ease.Hard]}
              color="orange"
              onClick={() => handleAnswer(Ease.Hard)}
            />
            <AnswerButton
              label="正解"
              interval={intervalPreviews[Ease.Good]}
              color="green"
              onClick={() => handleAnswer(Ease.Good)}
            />
            <AnswerButton
              label="簡単"
              interval={intervalPreviews[Ease.Easy]}
              color="blue"
              onClick={() => handleAnswer(Ease.Easy)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

interface AnswerButtonProps {
  label: string
  interval: string
  color: 'red' | 'orange' | 'green' | 'blue'
  onClick: () => void
}

function AnswerButton({ label, interval, color, onClick }: AnswerButtonProps) {
  const colorClasses = {
    red: 'bg-red-500 hover:bg-red-600',
    orange: 'bg-orange-500 hover:bg-orange-600',
    green: 'bg-green-500 hover:bg-green-600',
    blue: 'bg-blue-500 hover:bg-blue-600',
  }

  return (
    <button
      onClick={onClick}
      className={`py-3 px-2 ${colorClasses[color]} text-white rounded-lg transition-colors flex flex-col items-center`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs opacity-80">{interval}</span>
    </button>
  )
}
