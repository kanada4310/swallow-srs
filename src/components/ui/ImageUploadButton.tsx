'use client'

import { useRef, useState } from 'react'
import { SUPPORTED_IMAGE_TYPES, MAX_IMAGE_SIZE } from '@/lib/constants'

interface ImageUploadButtonProps {
  /** アップロード成功時に公開URLを受け取る */
  onUploaded: (imageUrl: string) => void
  label?: string
  className?: string
  disabled?: boolean
}

// 画像を Supabase Storage にアップロードして公開URLを返すボタン（Phase 13.4）
export function ImageUploadButton({
  onUploaded,
  label = '画像を追加',
  className,
  disabled,
}: ImageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

  const handleFile = async (file: File) => {
    setError(null)
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      setError('対応形式: JPEG / PNG / WebP / GIF')
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('画像サイズは10MBまでです')
      return
    }

    setUploading(true)
    try {
      const dataUrl = await readAsDataUrl(file)
      const resp = await fetch('/api/images/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, imageType: file.type }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.imageUrl) {
        throw new Error(data.error || 'アップロードに失敗しました')
      }
      onUploaded(data.imageUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <span className={`inline-flex flex-col ${className || ''}`}>
      <input
        ref={inputRef}
        type="file"
        accept={SUPPORTED_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? (
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500" />
            アップロード中
          </span>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {label}
          </>
        )}
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  )
}
