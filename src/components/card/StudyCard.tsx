'use client'

import { useState, useMemo } from 'react'
import { Ease } from '@/lib/srs/scheduler'
import { renderTemplate, type FieldValues } from '@/lib/template'

interface StudyCardProps {
  fieldValues: FieldValues
  template: {
    front: string
    back: string
    css: string
  }
  clozeNumber?: number
  intervalPreviews: Record<Ease, string>
  onAnswer: (ease: Ease) => void
}

export function StudyCard({
  fieldValues,
  template,
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
        <div className="flex-1 p-8 flex items-center justify-center">
          <div
            className="text-xl text-center w-full"
            dangerouslySetInnerHTML={{ __html: renderedFront }}
          />
        </div>

        {/* Divider and Back (when flipped) */}
        {isFlipped && (
          <>
            <hr className="border-gray-200" />
            <div className="flex-1 p-8 flex items-center justify-center bg-gray-50">
              <div
                className="text-xl text-center w-full"
                dangerouslySetInnerHTML={{ __html: renderedBack }}
              />
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
