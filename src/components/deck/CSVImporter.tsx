'use client'

import { useState, useCallback } from 'react'
import {
  parseCSV,
  detectDelimiter,
  readFileAsText,
  validateMapping,
  type CSVParseResult,
} from '@/lib/csv/parser'
import { BASIC_NOTE_TYPE_ID, CLOZE_NOTE_TYPE_ID } from '@/lib/constants'

interface NoteType {
  id: string
  name: string
  fields: Array<{ name: string; ord: number }>
}

interface CSVImporterProps {
  deckId: string
  noteTypes: NoteType[]
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

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'result'

export function CSVImporter({
  deckId,
  noteTypes,
  onImportComplete,
  onCancel,
}: CSVImporterProps) {
  const [step, setStep] = useState<ImportStep>('upload')
  const [selectedNoteType, setSelectedNoteType] = useState<NoteType>(
    noteTypes.find(nt => nt.id === BASIC_NOTE_TYPE_ID) || noteTypes[0]
  )
  const [csvData, setCsvData] = useState<CSVParseResult | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('ファイルサイズが大きすぎます（最大5MB）')
      return
    }

    try {
      const text = await readFileAsText(file)
      const delimiter = detectDelimiter(text)
      const result = parseCSV(text, { delimiter })

      if (result.headers.length === 0) {
        setError('CSVファイルを解析できませんでした')
        return
      }

      setCsvData(result)

      // Auto-map columns if possible
      const autoMapping: Record<string, string> = {}
      for (const header of result.headers) {
        const lowerHeader = header.toLowerCase()
        for (const field of selectedNoteType.fields) {
          const lowerField = field.name.toLowerCase()
          if (
            lowerHeader === lowerField ||
            lowerHeader.includes(lowerField) ||
            lowerField.includes(lowerHeader)
          ) {
            autoMapping[header] = field.name
            break
          }
        }
      }

      // For Basic type, try common patterns
      if (selectedNoteType.id === BASIC_NOTE_TYPE_ID) {
        const frontPatterns = ['front', 'english', 'word', '英語', '単語', '表']
        const backPatterns = ['back', 'japanese', 'meaning', '日本語', '意味', '裏']

        for (const header of result.headers) {
          const lowerHeader = header.toLowerCase()
          if (!autoMapping[header]) {
            if (frontPatterns.some(p => lowerHeader.includes(p))) {
              autoMapping[header] = 'Front'
            } else if (backPatterns.some(p => lowerHeader.includes(p))) {
              autoMapping[header] = 'Back'
            }
          }
        }
      }

      // For Cloze type
      if (selectedNoteType.id === CLOZE_NOTE_TYPE_ID) {
        const textPatterns = ['text', 'sentence', '文', 'テキスト', '本文']
        const extraPatterns = ['extra', 'note', '補足', 'メモ']

        for (const header of result.headers) {
          const lowerHeader = header.toLowerCase()
          if (!autoMapping[header]) {
            if (textPatterns.some(p => lowerHeader.includes(p))) {
              autoMapping[header] = 'Text'
            } else if (extraPatterns.some(p => lowerHeader.includes(p))) {
              autoMapping[header] = 'Extra'
            }
          }
        }
      }

      setColumnMapping(autoMapping)
      setStep('mapping')
    } catch (err) {
      console.error('Error reading file:', err)
      setError('ファイルの読み込みに失敗しました')
    }
  }, [selectedNoteType])

  const handleNoteTypeChange = (noteTypeId: string) => {
    const noteType = noteTypes.find(nt => nt.id === noteTypeId)
    if (noteType) {
      setSelectedNoteType(noteType)
      setColumnMapping({}) // Reset mapping
    }
  }

  const handleMappingChange = (csvColumn: string, noteField: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [csvColumn]: noteField,
    }))
  }

  const handleProceedToPreview = () => {
    if (!csvData) return

    const requiredFields = selectedNoteType.fields
      .filter(f => f.ord === 0)
      .map(f => f.name)

    const validation = validateMapping(csvData.headers, columnMapping, requiredFields)

    if (!validation.valid) {
      setError(validation.errors.join('\n'))
      return
    }

    setError(null)
    setStep('preview')
  }

  const handleImport = async () => {
    if (!csvData) return

    setError(null)
    setStep('importing')

    try {
      // Convert CSV rows to notes using mapping
      const notes = csvData.rows.map(row => {
        const fieldValues: Record<string, string> = {}
        for (const [csvColumn, noteField] of Object.entries(columnMapping)) {
          if (!noteField) continue
          const columnIndex = csvData.headers.indexOf(csvColumn)
          if (columnIndex >= 0) {
            fieldValues[noteField] = row[columnIndex] || ''
          }
        }
        return { fieldValues }
      })

      const response = await fetch('/api/notes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId,
          noteTypeId: selectedNoteType.id,
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
      setStep('preview')
    }
  }

  const getPreviewRows = () => {
    if (!csvData) return []
    return csvData.rows.slice(0, 5).map(row => {
      const preview: Record<string, string> = {}
      for (const [csvColumn, noteField] of Object.entries(columnMapping)) {
        if (!noteField) continue
        const columnIndex = csvData.headers.indexOf(csvColumn)
        if (columnIndex >= 0) {
          preview[noteField] = row[columnIndex] || ''
        }
      }
      return preview
    })
  }

  const isCloze = selectedNoteType.id === CLOZE_NOTE_TYPE_ID

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm whitespace-pre-wrap">
          {error}
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <>
          {/* Note Type Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ノートタイプ
            </label>
            <select
              value={selectedNoteType.id}
              onChange={e => handleNoteTypeChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              {noteTypes.map(nt => (
                <option key={nt.id} value={nt.id}>
                  {nt.name}
                </option>
              ))}
            </select>
          </div>

          {/* Cloze Help */}
          {isCloze && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <p className="font-medium mb-1">穴埋め記法（CSVデータ内で使用）:</p>
              <p className="font-mono">{'{{c1::答え}}'} または {'{{c1::答え::ヒント}}'}</p>
            </div>
          )}

          {/* File Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CSVファイル
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                className="hidden"
                id="csv-file-input"
              />
              <label
                htmlFor="csv-file-input"
                className="cursor-pointer flex flex-col items-center"
              >
                <svg
                  className="w-12 h-12 text-gray-400 mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <span className="text-gray-600 font-medium">
                  クリックしてファイルを選択
                </span>
                <span className="text-sm text-gray-400 mt-1">
                  CSV, TXT (最大5MB, 10,000行)
                </span>
              </label>
            </div>
          </div>

          {/* Format Guide */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            <p className="font-medium text-gray-700 mb-2">CSVフォーマット:</p>
            <ul className="text-gray-600 space-y-1 text-xs">
              <li>・1行目がヘッダー（列名）として扱われます</li>
              <li>・UTF-8またはShift-JISエンコーディングに対応</li>
              <li>・カンマ、タブ、セミコロン区切りを自動検出</li>
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

      {/* Step: Mapping */}
      {step === 'mapping' && csvData && (
        <>
          <div className="text-sm text-gray-600 mb-2">
            {csvData.rows.length}件のデータが見つかりました。CSVの列をノートのフィールドにマッピングしてください。
          </div>

          {/* Note Type (readonly) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ノートタイプ
            </label>
            <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
              {selectedNoteType.name}
            </div>
          </div>

          {/* Column Mapping */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              列のマッピング
            </label>
            <div className="space-y-2">
              {csvData.headers.map(header => (
                <div key={header} className="flex items-center gap-3">
                  <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm truncate">
                    {header}
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                  <select
                    value={columnMapping[header] || ''}
                    onChange={e => handleMappingChange(header, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">（使用しない）</option>
                    {selectedNoteType.fields.map(field => (
                      <option key={field.name} value={field.name}>
                        {field.name}
                        {field.ord === 0 && ' *'}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">* 必須フィールド</p>
          </div>

          {/* CSV Parse Errors */}
          {csvData.errors.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
              <p className="font-medium text-yellow-800 mb-1">
                解析時の警告 ({csvData.errors.length}件)
              </p>
              <ul className="text-yellow-700 text-xs space-y-1 max-h-24 overflow-y-auto">
                {csvData.errors.slice(0, 10).map((err, i) => (
                  <li key={i}>
                    行{err.row}: {err.message}
                  </li>
                ))}
                {csvData.errors.length > 10 && (
                  <li>...他{csvData.errors.length - 10}件</li>
                )}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setStep('upload')
                setCsvData(null)
                setColumnMapping({})
              }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={handleProceedToPreview}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              プレビュー
            </button>
          </div>
        </>
      )}

      {/* Step: Preview */}
      {step === 'preview' && csvData && (
        <>
          <div className="text-sm text-gray-600">
            以下の内容でインポートします（最初の5件を表示）
          </div>

          {/* Preview Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      #
                    </th>
                    {selectedNoteType.fields.map(field => (
                      <th
                        key={field.name}
                        className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                      >
                        {field.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {getPreviewRows().map((row, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-sm text-gray-500">{i + 1}</td>
                      {selectedNoteType.fields.map(field => (
                        <td
                          key={field.name}
                          className="px-4 py-2 text-sm text-gray-900 max-w-xs truncate"
                        >
                          {row[field.name] || (
                            <span className="text-gray-400">（空）</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <p>
              <strong>{csvData.rows.length}件</strong>のノートをインポートします。
              {selectedNoteType.id === CLOZE_NOTE_TYPE_ID
                ? '穴埋め数に応じてカードが作成されます。'
                : `各ノートから${noteTypes.find(nt => nt.id === selectedNoteType.id)?.id === BASIC_NOTE_TYPE_ID ? '2' : '1'}枚のカードが作成されます。`}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep('mapping')}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              インポート実行
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
            {csvData?.rows.length}件のデータを処理しています
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
              onClick={onImportComplete}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              閉じる
            </button>
          </div>
        </>
      )}
    </div>
  )
}
