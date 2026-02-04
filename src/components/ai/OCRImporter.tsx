'use client'

import { useState, useCallback, useRef } from 'react'
import { BASIC_NOTE_TYPE_ID, SUPPORTED_IMAGE_TYPES, MAX_IMAGE_SIZE } from '@/lib/constants'

// Format hints for common vocabulary books
const FORMAT_HINTS = [
  { value: '', label: '自動検出' },
  { value: 'ターゲット1900', label: 'ターゲット1900' },
  { value: 'システム英単語', label: 'システム英単語' },
  { value: 'DUO 3.0', label: 'DUO 3.0' },
  { value: '速読英単語', label: '速読英単語' },
  { value: 'その他の単語帳', label: 'その他の単語帳' },
]


interface OCREntry {
  word: string
  meaning: string
  extra?: string
  confidence: 'high' | 'medium' | 'low'
  selected: boolean
}

interface OCRImporterProps {
  deckId: string
  onImportComplete: () => void
  onCancel: () => void
}

interface ImportResult {
  success: boolean
  totalNotes: number
  createdNotes: number
  createdCards: number
  errors: Array<{ row: number; message: string }>
}

type ImportStep = 'upload' | 'processing' | 'review' | 'importing' | 'result'

export function OCRImporter({
  deckId,
  onImportComplete,
  onCancel,
}: OCRImporterProps) {
  const [step, setStep] = useState<ImportStep>('upload')
  const [formatHint, setFormatHint] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [entries, setEntries] = useState<OCREntry[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    // Check file type
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      setError(`対応していない画像形式です。対応形式: JPEG, PNG, WebP, GIF`)
      return
    }

    // Check file size
    if (file.size > MAX_IMAGE_SIZE) {
      setError('画像サイズが大きすぎます（最大10MB）')
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onload = async (event) => {
      const base64 = event.target?.result as string
      setImagePreview(base64)

      // Start OCR processing
      setStep('processing')

      try {
        // Extract base64 data (remove data URL prefix)
        const base64Data = base64.split(',')[1]

        const response = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64Data,
            imageType: file.type,
            deckId,
            formatHint: formatHint || undefined,
          }),
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'OCR処理に失敗しました')
        }

        if (result.entries.length === 0) {
          setWarnings(result.warnings || ['テキストを検出できませんでした'])
          setStep('upload')
          setError('画像からテキストを検出できませんでした。別の画像をお試しください。')
          return
        }

        // Add selected flag to entries
        const entriesWithSelection = result.entries.map((entry: Omit<OCREntry, 'selected'>) => ({
          ...entry,
          selected: true,
        }))

        setEntries(entriesWithSelection)
        setWarnings(result.warnings || [])
        setStep('review')
      } catch (err) {
        console.error('OCR error:', err)
        setError(err instanceof Error ? err.message : 'OCR処理に失敗しました')
        setStep('upload')
      }
    }

    reader.readAsDataURL(file)
  }, [deckId, formatHint])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const file = e.dataTransfer.files[0]
    if (file && fileInputRef.current) {
      // Create a new FileList with the dropped file
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      fileInputRef.current.files = dataTransfer.files

      // Trigger change event
      const event = new Event('change', { bubbles: true })
      fileInputRef.current.dispatchEvent(event)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const toggleEntry = (index: number) => {
    setEntries(prev => prev.map((entry, i) =>
      i === index ? { ...entry, selected: !entry.selected } : entry
    ))
  }

  const toggleAll = (selected: boolean) => {
    setEntries(prev => prev.map(entry => ({ ...entry, selected })))
  }

  const updateEntry = (index: number, field: 'word' | 'meaning' | 'extra', value: string) => {
    setEntries(prev => prev.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry
    ))
  }

  const deleteEntry = (index: number) => {
    setEntries(prev => prev.filter((_, i) => i !== index))
  }

  const addEntry = () => {
    setEntries(prev => [...prev, {
      word: '',
      meaning: '',
      extra: undefined,
      confidence: 'high' as const,
      selected: true,
    }])
    setEditingIndex(entries.length)
  }

  const selectedCount = entries.filter(e => e.selected).length

  const handleImport = async () => {
    const selectedEntries = entries.filter(e => e.selected && e.word && e.meaning)

    if (selectedEntries.length === 0) {
      setError('インポートする項目を選択してください')
      return
    }

    setError(null)
    setStep('importing')

    try {
      // Convert OCR entries to notes format
      const notes = selectedEntries.map(entry => ({
        fieldValues: {
          Front: entry.word,
          Back: entry.meaning + (entry.extra ? ` (${entry.extra})` : ''),
        },
      }))

      const response = await fetch('/api/notes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId,
          noteTypeId: BASIC_NOTE_TYPE_ID,
          notes,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Import failed')
      }

      setImportResult(result)
      setStep('result')
    } catch (err) {
      console.error('Import error:', err)
      setError(err instanceof Error ? err.message : 'インポートに失敗しました')
      setStep('review')
    }
  }

  const getConfidenceColor = (confidence: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high':
        return 'bg-green-100 text-green-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-red-100 text-red-800'
    }
  }

  const resetToUpload = () => {
    setStep('upload')
    setImagePreview(null)
    setEntries([])
    setWarnings([])
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <>
          {/* Format Hint Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              単語帳の種類（任意）
            </label>
            <select
              value={formatHint}
              onChange={e => setFormatHint(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {FORMAT_HINTS.map(hint => (
                <option key={hint.value} value={hint.value}>
                  {hint.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              単語帳の種類を指定すると、より正確に読み取れる場合があります
            </p>
          </div>

          {/* Image Upload Area */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileChange}
              className="hidden"
            />
            <svg
              className="w-12 h-12 text-gray-400 mx-auto mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="text-gray-600 font-medium block">
              クリックまたはドラッグ＆ドロップで画像を選択
            </span>
            <span className="text-sm text-gray-400 mt-1 block">
              JPEG, PNG, WebP, GIF（最大10MB）
            </span>
          </div>

          {/* Preview if image exists */}
          {imagePreview && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="プレビュー"
                className="max-h-48 mx-auto rounded-lg border border-gray-200"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  resetToUpload()
                }}
                className="absolute top-2 right-2 p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Tips */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <p className="font-medium mb-1">きれいに読み取るコツ:</p>
            <ul className="text-xs space-y-1">
              <li>・明るい場所で撮影する</li>
              <li>・文字がはっきり見えるようにピントを合わせる</li>
              <li>・ページ全体ではなく、読み取りたい部分だけを撮影する</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              キャンセル
            </button>
          </div>
        </>
      )}

      {/* Step: Processing */}
      {step === 'processing' && (
        <div className="py-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">画像を解析中...</p>
          <p className="text-sm text-gray-400 mt-2">
            単語と意味を抽出しています
          </p>
          {imagePreview && (
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="解析中"
              className="max-h-32 mx-auto mt-4 rounded-lg border border-gray-200 opacity-50"
            />
          )}
        </div>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {entries.length}件のデータを検出しました（{selectedCount}件選択中）
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toggleAll(true)}
                className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
              >
                すべて選択
              </button>
              <button
                type="button"
                onClick={() => toggleAll(false)}
                className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-50 rounded"
              >
                選択解除
              </button>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
              <p className="font-medium text-yellow-800 mb-1">注意事項</p>
              <ul className="text-yellow-700 text-xs space-y-1">
                {warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Entries Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-10">
                    <span className="sr-only">選択</span>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    単語
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    意味
                  </th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 w-16">
                    確度
                  </th>
                  <th className="px-2 py-2 w-10">
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {entries.map((entry, index) => (
                  <tr
                    key={index}
                    className={`${entry.selected ? '' : 'bg-gray-50 opacity-60'}`}
                  >
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={entry.selected}
                        onChange={() => toggleEntry(index)}
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {editingIndex === index ? (
                        <input
                          type="text"
                          value={entry.word}
                          onChange={e => updateEntry(index, 'word', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          autoFocus
                        />
                      ) : (
                        <span
                          className="text-sm cursor-pointer hover:bg-gray-100 px-1 rounded"
                          onClick={() => setEditingIndex(index)}
                        >
                          {entry.word || <span className="text-gray-400">（空）</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingIndex === index ? (
                        <input
                          type="text"
                          value={entry.meaning}
                          onChange={e => updateEntry(index, 'meaning', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      ) : (
                        <span
                          className="text-sm cursor-pointer hover:bg-gray-100 px-1 rounded"
                          onClick={() => setEditingIndex(index)}
                        >
                          {entry.meaning || <span className="text-gray-400">（空）</span>}
                          {entry.extra && (
                            <span className="text-gray-500 text-xs ml-1">({entry.extra})</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${getConfidenceColor(entry.confidence)}`}>
                        {entry.confidence === 'high' ? '高' : entry.confidence === 'medium' ? '中' : '低'}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => deleteEntry(index)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="削除"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Entry Button */}
          <button
            type="button"
            onClick={addEntry}
            className="w-full px-4 py-2 border border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors text-sm"
          >
            + 手動で追加
          </button>

          {/* Editing note */}
          {editingIndex !== null && (
            <div className="text-xs text-gray-500 text-center">
              編集中... 他の場所をクリックして終了
              <button
                onClick={() => setEditingIndex(null)}
                className="ml-2 text-blue-600 hover:underline"
              >
                完了
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={resetToUpload}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              別の画像を選ぶ
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selectedCount}件をインポート
            </button>
          </div>
        </>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <div className="py-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">インポート中...</p>
          <p className="text-sm text-gray-400 mt-2">
            {selectedCount}件のデータを登録しています
          </p>
        </div>
      )}

      {/* Step: Result */}
      {step === 'result' && importResult && (
        <>
          <div
            className={`p-4 rounded-lg ${
              importResult.errors.length === 0
                ? 'bg-green-50 border border-green-200'
                : 'bg-yellow-50 border border-yellow-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {importResult.errors.length === 0 ? (
                <svg
                  className="w-6 h-6 text-green-600 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-6 h-6 text-yellow-600 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              )}
              <div>
                <h3
                  className={`font-medium ${
                    importResult.errors.length === 0
                      ? 'text-green-800'
                      : 'text-yellow-800'
                  }`}
                >
                  {importResult.errors.length === 0
                    ? 'インポート完了'
                    : 'インポート完了（一部エラー）'}
                </h3>
                <div className="mt-2 text-sm space-y-1">
                  <p>
                    ノート: {importResult.createdNotes} / {importResult.totalNotes}件
                  </p>
                  <p>カード: {importResult.createdCards}枚</p>
                </div>
              </div>
            </div>
          </div>

          {/* Errors */}
          {importResult.errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
              <p className="font-medium text-red-800 mb-2">
                エラー ({importResult.errors.length}件)
              </p>
              <ul className="text-red-700 text-xs space-y-1 max-h-32 overflow-y-auto">
                {importResult.errors.slice(0, 20).map((err, i) => (
                  <li key={i}>
                    行{err.row}: {err.message}
                  </li>
                ))}
                {importResult.errors.length > 20 && (
                  <li>...他{importResult.errors.length - 20}件</li>
                )}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={resetToUpload}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              別の画像を追加
            </button>
            <button
              type="button"
              onClick={onImportComplete}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              閉じる
            </button>
          </div>
        </>
      )}
    </div>
  )
}
