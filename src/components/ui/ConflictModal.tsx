'use client'

import { useState } from 'react'
import { useConflicts } from '@/lib/db/hooks'
import { formatConflictForDisplay } from '@/lib/db/conflict'
import { applyConflictResolution } from '@/lib/db/sync'

export function ConflictModal() {
  const { conflicts, hasConflicts } = useConflicts()
  const [isResolving, setIsResolving] = useState(false)

  if (!hasConflicts) {
    return null
  }

  const currentConflict = conflicts[0]
  const formatted = formatConflictForDisplay(currentConflict)

  const handleResolve = async (resolution: 'local' | 'server') => {
    setIsResolving(true)
    try {
      await applyConflictResolution(currentConflict, resolution)
    } finally {
      setIsResolving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg bg-white rounded-lg shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-yellow-500"
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
            <h2 className="text-lg font-semibold text-gray-900">
              同期の競合が発生しました
            </h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            別の端末でこのカードを学習した記録があります。どちらを使用しますか？
          </p>
          {conflicts.length > 1 && (
            <p className="mt-1 text-xs text-gray-400">
              残り{conflicts.length - 1}件の競合があります
            </p>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Local data */}
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <svg
                  className="w-4 h-4 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <span className="font-medium text-gray-700">この端末</span>
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">次回:</dt>
                  <dd className="text-gray-900">{formatted.local.due}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">間隔:</dt>
                  <dd className="text-gray-900">{formatted.local.interval}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">状態:</dt>
                  <dd className="text-gray-900">{formatted.local.state}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">復習回数:</dt>
                  <dd className="text-gray-900">{formatted.local.repetitions}</dd>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-100">
                  <dt className="text-gray-400 text-xs">更新:</dt>
                  <dd className="text-gray-500 text-xs">{formatted.local.updatedAt}</dd>
                </div>
              </dl>
            </div>

            {/* Server data */}
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <svg
                  className="w-4 h-4 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                  />
                </svg>
                <span className="font-medium text-gray-700">サーバー</span>
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">次回:</dt>
                  <dd className="text-gray-900">{formatted.server.due}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">間隔:</dt>
                  <dd className="text-gray-900">{formatted.server.interval}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">状態:</dt>
                  <dd className="text-gray-900">{formatted.server.state}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">復習回数:</dt>
                  <dd className="text-gray-900">{formatted.server.repetitions}</dd>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-100">
                  <dt className="text-gray-400 text-xs">更新:</dt>
                  <dd className="text-gray-500 text-xs">{formatted.server.updatedAt}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Differences */}
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
            <p className="text-sm text-yellow-800">
              <span className="font-medium">相違点:</span>{' '}
              {formatted.differences.map((d) => {
                const labels: Record<string, string> = {
                  due: '次回日時',
                  interval: '間隔',
                  state: '状態',
                  ease_factor: '難易度',
                  repetitions: '復習回数',
                  learning_step: '学習ステップ',
                }
                return labels[d] ?? d
              }).join(', ')}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex gap-3">
          <button
            onClick={() => handleResolve('local')}
            disabled={isResolving}
            className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            この端末を使用
          </button>
          <button
            onClick={() => handleResolve('server')}
            disabled={isResolving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            サーバーを使用
          </button>
        </div>
      </div>
    </div>
  )
}
