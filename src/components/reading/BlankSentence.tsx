'use client'

/**
 * 【構文に降りる】困った1文の作業台。
 *
 * 構文の練習と同じタップ入力（SyntaxAnnotator）で品詞・働き・まとまりを書き込める。
 * 書き込みは講の途中保存（reading_progress の syntax 欄）に入る。
 *
 * 構文AI試行（ADR syntax-ai-trial）:
 * - 「分からない」マーク（波線＋?）= 復習カード行きの自己申告
 * - AI判定（許可された生徒だけに入口を表示。1往復・文順・全件）
 * - 添削問答（正解を言わず、辞書・文法書の引き先を指す）
 * - 指摘ゼロで確定 → 分からない/誤りが出た文は復習カードへ自動保存（英文と分析のみ）
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReadingParagraph, SentenceSyntaxWork, SyntaxJudgeResult } from '@/lib/reading/types'
import type { SyntaxAnswer } from '@/lib/reading/syntax'
import { SyntaxAnnotator } from './SyntaxAnnotator'

interface AiStatus {
  allowed: boolean
  message: string | null
}

/** 入口の可否は数分だけ覚えておく（モーダルを開くたびに問い合わせない） */
let aiStatusCache: { value: AiStatus; at: number } | null = null

async function fetchAiStatus(): Promise<AiStatus> {
  if (aiStatusCache && Date.now() - aiStatusCache.at < 2 * 60_000) return aiStatusCache.value
  try {
    const res = await fetch('/api/reading/syntax-ai/status')
    if (!res.ok) throw new Error()
    const body = await res.json()
    const value = { allowed: !!body.allowed, message: body.message ?? null }
    aiStatusCache = { value, at: Date.now() }
    return value
  } catch {
    return { allowed: false, message: null }
  }
}

interface BlankSentenceProps {
  para: ReadingParagraph
  /** 段落の並び順（0始まり。保存の鍵とAPIの sentenceKey に使う） */
  paraIdx: number
  sentenceIndex: number
  lessonId: string
  /** カードの出典表示（例: 英語長文最前線 第2講 第1段落 第3文） */
  sourceLabel: string
  work: SentenceSyntaxWork
  onWorkChange: (updater: (prev: SentenceSyntaxWork) => SentenceSyntaxWork) => void
  onClose: () => void
}

const KIND_BADGE: Record<string, { label: string; cls: string }> = {
  notation: { label: 'ルール', cls: 'bg-again-bg text-again' },
  question: { label: '問い', cls: 'bg-sora-soft text-ai' },
  confirm: { label: '根拠', cls: 'bg-good-bg text-good' },
}

export function BlankSentence({
  para,
  paraIdx,
  sentenceIndex,
  lessonId,
  sourceLabel,
  work,
  onWorkChange,
  onClose,
}: BlankSentenceProps) {
  const [showGist, setShowGist] = useState(false)
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [judging, setJudging] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [cardNotice, setCardNotice] = useState<string | null>(null)
  const [dialogueBusy, setDialogueBusy] = useState(false)
  const [draft, setDraft] = useState('')

  const sent = para.sentences[sentenceIndex]

  useEffect(() => {
    let cancelled = false
    fetchAiStatus().then((s) => {
      if (!cancelled) setAiStatus(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const saveCard = useCallback(
    async (answer: SentenceSyntaxWork['answer'], key: string) => {
      try {
        const res = await fetch('/api/reading/syntax-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lessonId,
            sentenceKey: key,
            tokens: sent?.tokens ?? [],
            answer,
            source: sourceLabel,
          }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || '保存に失敗しました')
        onWorkChange((prev) => ({ ...prev, cardNoteId: body.noteId ?? prev.cardNoteId }))
        setCardNotice(
          body.updated
            ? '復習カードを新しい分析で更新しました（デッキ「構文分析カード」）'
            : '復習カードに保存しました（デッキ「構文分析カード」）'
        )
      } catch (err) {
        setCardNotice(null)
        setAiError(err instanceof Error ? err.message : 'カードの保存に失敗しました')
      }
    },
    [lessonId, sent, sourceLabel, onWorkChange]
  )

  if (!sent) return null

  const key = `${paraIdx}:${sentenceIndex}`
  const kotos = para.kotos.filter((k) => k.sentence === sentenceIndex && k.no)

  const handleAnswerChange = (next: SyntaxAnswer) => {
    setAiError(null)
    onWorkChange((prev) => ({ ...prev, answer: next, confirmed: false }))
  }

  const handleJudge = async () => {
    setJudging(true)
    setAiError(null)
    setCardNotice(null)
    try {
      const res = await fetch('/api/reading/syntax-ai/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId,
          sentenceKey: key,
          tokens: sent.tokens,
          answer: work.answer,
          unknown: work.unknown,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // 期間終了・上限到達などは入口の表示も更新する
        if (res.status === 403) {
          aiStatusCache = null
          fetchAiStatus().then(setAiStatus)
        }
        throw new Error(body.error || '判定に失敗しました')
      }
      const result = body.result as SyntaxJudgeResult
      const shouldCard = result.clean && (work.unknown || work.hadErrors)
      onWorkChange((prev) => ({
        ...prev,
        judge: { result, at: new Date().toISOString() },
        hadErrors: prev.hadErrors || !result.clean,
        confirmed: result.clean,
      }))
      if (shouldCard) {
        await saveCard(work.answer, key)
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '判定に失敗しました')
    } finally {
      setJudging(false)
    }
  }

  const callDialogue = async (turns: SentenceSyntaxWork['dialogue']) => {
    const res = await fetch('/api/reading/syntax-ai/dialogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lessonId,
        sentenceKey: key,
        tokens: sent.tokens,
        answer: work.answer,
        unknown: work.unknown,
        judgeResult: work.judge?.result ?? null,
        turns: turns.map((t) => ({ role: t.role, text: t.text })),
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || '問答に失敗しました')
    return body.reply as string
  }

  const startDialogue = async () => {
    setDialogueBusy(true)
    setAiError(null)
    try {
      const reply = await callDialogue(work.dialogue)
      onWorkChange((prev) => ({
        ...prev,
        dialogue: [...prev.dialogue, { role: 'coach', text: reply, at: new Date().toISOString() }],
      }))
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '問答に失敗しました')
    } finally {
      setDialogueBusy(false)
    }
  }

  const sendReply = async () => {
    const text = draft.trim()
    if (!text || dialogueBusy) return
    setDialogueBusy(true)
    setAiError(null)
    const newTurns: SentenceSyntaxWork['dialogue'] = [
      ...work.dialogue,
      { role: 'student', text, at: new Date().toISOString() },
    ]
    onWorkChange((prev) => ({ ...prev, dialogue: newTurns }))
    setDraft('')
    try {
      const reply = await callDialogue(newTurns)
      onWorkChange((prev) => ({
        ...prev,
        dialogue: [...prev.dialogue, { role: 'coach', text: reply, at: new Date().toISOString() }],
      }))
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '問答に失敗しました')
    } finally {
      setDialogueBusy(false)
    }
  }

  const judgeResult = work.judge?.result ?? null
  const dialogueStarted = work.dialogue.length > 0
  const cardEligible = work.unknown || work.hadErrors

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-card bg-white p-4 shadow-card sm:max-w-2xl sm:rounded-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-ai">構文に降りる（第{sentenceIndex + 1}文）</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-bold text-ink-2 hover:bg-gray-100"
          >
            閉じる
          </button>
        </div>

        <p className="mb-3 rounded-xl bg-sora-soft p-3 text-sm leading-relaxed text-ai">
          単語の<b>上をタップ→品詞</b>、<b>下をタップ→働き</b>。まとまりはボタンを押してから
          最初と最後の単語をタップ。書き込みは自動で保存されます。訳は口頭でかまいません。
        </p>

        {/* 保存形の spans.type は将来の型追加に備えて string。表示は既知の5種だけを扱う */}
        <SyntaxAnnotator
          tokens={sent.tokens}
          answer={work.answer as SyntaxAnswer}
          onChange={handleAnswerChange}
        />

        {/* 分からないマーク */}
        <button
          type="button"
          onClick={() => onWorkChange((prev) => ({ ...prev, unknown: !prev.unknown }))}
          className={`mb-2 w-full rounded-xl border px-4 py-2.5 text-sm font-bold ${
            work.unknown
              ? 'border-hard bg-hard-bg text-hard'
              : 'border-gray-300 bg-white text-ink-2'
          }`}
        >
          {work.unknown
            ? '〰？ 「分からない」マークを付けています（復習カード行き）'
            : '〰？ この文に「分からない」マークを付ける'}
        </button>

        {/* AI判定（許可生徒のみ入口を表示） */}
        {aiStatus?.allowed && (
          <div className="mb-2 space-y-2">
            <button
              type="button"
              onClick={handleJudge}
              disabled={judging}
              className="w-full rounded-xl bg-sora px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {judging ? 'AIが判定しています…' : 'AI判定を受ける（書き込みを検査）'}
            </button>

            {judgeResult && (
              <div className="space-y-1.5 rounded-xl border border-gray-200 bg-paper p-3">
                {judgeResult.clean ? (
                  <p className="text-sm font-bold text-good">
                    ✅ 誤りの指摘はありません。この分析で確定しました。
                    {work.cardNoteId && '（復習カード保存済み）'}
                  </p>
                ) : (
                  <p className="text-sm font-bold text-ai">
                    指摘 {judgeResult.issues.filter((i) => i.kind !== 'confirm').length} 件（文頭から順に）:
                  </p>
                )}
                {judgeResult.issues.map((issue, i) => {
                  const badge = KIND_BADGE[issue.kind] ?? KIND_BADGE.question
                  return (
                    <div key={i} className="rounded-lg bg-white p-2.5 text-sm text-ink">
                      <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {issue.target && <b className="mr-1 font-serif">{issue.target}</b>}
                      {issue.point}
                      {issue.lookup && (
                        <p className="mt-1 text-xs text-ink-2">📖 引き先: {issue.lookup}</p>
                      )}
                    </div>
                  )
                })}
                {judgeResult.comment && (
                  <p className="text-xs text-ink-2">{judgeResult.comment}</p>
                )}
              </div>
            )}

            {/* 添削問答（判定で指摘が出た文・分からない文） */}
            {(dialogueStarted || (judgeResult && !judgeResult.clean) || work.unknown) && (
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <p className="mb-2 text-xs font-bold text-ink-3">
                  添削問答 — 正解は言いません。問いに答えながら、辞書・文法書を引いて確かめます
                </p>
                {work.dialogue.map((t, i) => (
                  <div
                    key={i}
                    className={`mb-1.5 max-w-[85%] rounded-xl p-2.5 text-sm leading-relaxed ${
                      t.role === 'coach'
                        ? 'bg-sora-soft text-ai'
                        : 'ml-auto bg-paper text-ink'
                    }`}
                  >
                    {t.text}
                  </div>
                ))}
                {dialogueBusy && (
                  <p className="mb-1.5 text-xs text-ink-3">コーチが考えています…</p>
                )}
                {!dialogueStarted ? (
                  <button
                    type="button"
                    onClick={startDialogue}
                    disabled={dialogueBusy}
                    className="w-full rounded-xl border border-sora bg-white px-4 py-2.5 text-sm font-bold text-sora-dark disabled:opacity-50"
                  >
                    問答を始める
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) sendReply()
                      }}
                      placeholder="答えを書く（例: 前置詞だと思います）"
                      className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={dialogueBusy || !draft.trim()}
                      className="rounded-xl bg-sora px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      送る
                    </button>
                  </div>
                )}
                {dialogueStarted && (
                  <p className="mt-2 text-xs text-ink-3">
                    問答で分かったら書き込みを直して、もう一度「AI判定」を押すと確定できます。
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* AI対象外の生徒には入口を出さない（試行の枠）。エラーだけは共通で表示 */}
        {aiError && (
          <p className="mb-2 rounded-xl bg-again-bg p-2.5 text-sm text-again">{aiError}</p>
        )}
        {cardNotice && (
          <p className="mb-2 rounded-xl bg-good-bg p-2.5 text-sm text-good">{cardNotice}</p>
        )}

        {/* 確定済みだがカード未保存（例: 判定時は誤りゼロ→あとから分からないマーク） */}
        {work.confirmed && cardEligible && !work.cardNoteId && (
          <button
            type="button"
            onClick={() => saveCard(work.answer, key)}
            className="mb-2 w-full rounded-xl border border-good bg-white px-4 py-2.5 text-sm font-bold text-good"
          >
            確定した分析を復習カードに保存する
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowGist((v) => !v)}
          className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-ai"
        >
          {showGist ? 'この文の大意を隠す' : 'どうしても分からないとき: この文の大意を見る'}
        </button>
        {showGist && (
          <ul className="mt-2 space-y-1 rounded-xl bg-paper p-3 text-sm text-ink-2">
            {kotos.length === 0 ? (
              <li>（この文に対応する模範の大意はありません）</li>
            ) : (
              kotos.map((k) => <li key={k.no}>・{k.t}</li>)
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
