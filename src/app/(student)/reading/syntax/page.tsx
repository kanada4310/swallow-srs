'use client'

/**
 * 構文の練習 — 1文の品詞（上）と働き（下）を書き込んで採点する練習。
 *
 * 入力は2方式:
 * - ペン方式（既定）: 英文の上にペンで括弧・下線・○・文字を直接書く（実現可能性検証の試作）
 * - タップ方式: 従来のボタン→単語タップ。ペンの無い端末・認識に困ったときの逃げ道
 * 採点は従来どおり（正解◯・許容解△・誤り×・見落とし/余分）。加えて
 * ルールブックの言い切りによる「矛盾検査」（正解表なしで指摘できる項目）を表示する。
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { SyntaxAnnotator } from '@/components/reading/SyntaxAnnotator'
import { PenSyntaxAnnotator } from '@/components/pen-syntax/PenSyntaxAnnotator'
import { PenOnboarding } from '@/components/pen-syntax/PenOnboarding'
import { PenInputLogPanel } from '@/components/pen-syntax/PenInputLogPanel'
import { createPenInputLog, type PenInputLog } from '@/lib/pen-syntax/input-log'
import { initialPalmState, type InputPolicy, type PalmState } from '@/lib/pen-syntax/palm'
import type { UserTemplateStore } from '@/lib/pen-syntax/letters'
import { loadUserTemplates } from '@/lib/pen-syntax/user-templates'
import {
  isEnrollmentComplete,
  loadOnboardingDone,
  saveOnboardingDone,
} from '@/lib/pen-syntax/onboarding'
import {
  emptyAnswer,
  gradeSyntax,
  modelAnswer,
  POS_LETTER_LEGEND,
  POS_LETTER_OPTIONS,
  posLetter,
  ROLE_LETTER_OPTIONS,
  SYNTAX_PROBLEMS,
  type SyntaxAnswer,
  type SyntaxGrade,
} from '@/lib/reading/syntax'
import { checkContradictions } from '@/lib/reading/syntax-check'

export default function SyntaxDrillPage() {
  const { userId, isLoading: authLoading } = useAuth()
  const [problemIdx, setProblemIdx] = useState(0)
  const problem = SYNTAX_PROBLEMS[problemIdx]
  const [answer, setAnswer] = useState<SyntaxAnswer>(() => emptyAnswer(SYNTAX_PROBLEMS[0]))
  const [grade, setGrade] = useState<SyntaxGrade | null>(null)
  const [inputMode, setInputMode] = useState<'pen' | 'tap'>('pen')
  // 既定は「ペンのみ」（手のひら対策）。ペンが反応しない端末向けの逃げ道として切り替え可
  const [penPolicy, setPenPolicy] = useState<InputPolicy>('pen-only')
  // 入力の記録（実機不具合の報告用）と、無効化した接触の件数表示
  const inputLogRef = useRef<PenInputLog | null>(null)
  if (!inputLogRef.current) inputLogRef.current = createPenInputLog()
  const [palm, setPalm] = useState<PalmState>(initialPalmState())

  // 初回お手本登録（義務化）: 利用者ごとに1回だけ必ず通す。登録済みの字は判別に使う
  const [templateStore, setTemplateStore] = useState<UserTemplateStore>({})
  const [needOnboarding, setNeedOnboarding] = useState<boolean | null>(null)
  const [redoOnboarding, setRedoOnboarding] = useState(false)
  useEffect(() => {
    if (authLoading) return
    const s = loadUserTemplates()
    setTemplateStore(s)
    if (loadOnboardingDone(userId)) {
      setNeedOnboarding(false)
    } else if (isEnrollmentComplete(s)) {
      // 計測ページなどで既に全種登録済みなら、案内は出さず完了扱いにする
      saveOnboardingDone(userId)
      setNeedOnboarding(false)
    } else {
      setNeedOnboarding(true)
    }
  }, [authLoading, userId])
  const showOnboarding = inputMode === 'pen' && (needOnboarding === true || redoOnboarding)

  const load = (idx: number) => {
    setProblemIdx(idx)
    setAnswer(emptyAnswer(SYNTAX_PROBLEMS[idx]))
    setGrade(null)
  }

  const contradictions = grade ? checkContradictions(problem.tokens, answer) : []

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <Link href="/reading" className="text-xs font-semibold text-sora-dark">
          ← 読解の一覧
        </Link>
        <h1 className="mb-1 mt-1 text-2xl font-extrabold text-ai">構文の練習</h1>
        <p className="mb-3 text-sm leading-relaxed text-ink-2">
          {inputMode === 'pen' ? (
            <>
              ペンで英文に直接書き込みます。<b>括弧・下線は本文に</b>、<b>品詞は単語の上に英字</b>、
              <b>働き（S・V・O など）は単語の下</b>に書くと、その場で判別して単語に付きます。
              マスをタップして一覧から選ぶこともできます。
            </>
          ) : (
            <>
              単語の<b>上をタップ→品詞（英字）</b>、<b>下をタップ→働き</b>（S・V・O・C・P・Po・▷）。
              まとまりは下のボタンを押してから、最初の単語→最後の単語の順にタップします。
            </>
          )}
        </p>
        <p className="mb-1.5 rounded-xl bg-paper p-2.5 text-xs leading-relaxed text-ink-2">
          品詞の書き方:{' '}
          {POS_LETTER_OPTIONS.map((o, i) => (
            <span key={o}>
              {i > 0 && ' ／ '}
              <b>{o}</b>={POS_LETTER_LEGEND[o]}
            </span>
          ))}
        </p>
        <p className="mb-3 rounded-xl bg-paper p-2.5 text-xs leading-relaxed text-ink-2">
          働きの書き方: <b>S</b>・<b>V</b>・<b>O</b>・<b>C</b> ／ <b>P</b>=前置詞 ／{' '}
          <b>Po</b>=前置詞の目的語 ／ <b>▷</b>=従位接続詞 ／ <b>＋</b>=等位接続詞
          （記号はこの表記のまま使います。節・句の深さは括弧から自動で色分けされます）
        </p>

        <div className="mb-3 flex gap-1.5">
          <button
            type="button"
            onClick={() => setInputMode('pen')}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              inputMode === 'pen' ? 'bg-sora text-white' : 'border border-gray-300 bg-white text-ai'
            }`}
          >
            ✍️ ペンで書く
          </button>
          <button
            type="button"
            onClick={() => setInputMode('tap')}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              inputMode === 'tap' ? 'bg-sora text-white' : 'border border-gray-300 bg-white text-ai'
            }`}
          >
            👆 タップで入力
          </button>
          <Link
            href="/reading/syntax/pen-lab"
            className="ml-auto self-center text-xs font-semibold text-sora-dark"
          >
            ペン判別の計測 →
          </Link>
        </div>

        {inputMode === 'pen' && (
          <label className="mb-3 flex items-center gap-1.5 text-xs text-ink-3">
            <input
              type="checkbox"
              checked={penPolicy === 'any'}
              onChange={(e) => setPenPolicy(e.target.checked ? 'any' : 'pen-only')}
            />
            ペンが反応しない端末: 指・マウスでも書く（手のひらの誤反応は防げなくなります）
          </label>
        )}

        <div className="mb-3 rounded-card border border-gray-200 bg-white p-3 shadow-card">
          <label className="mb-1 block text-xs font-bold text-ink-3">問題</label>
          <select
            value={problemIdx}
            onChange={(e) => load(Number(e.target.value))}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
          >
            {SYNTAX_PROBLEMS.map((p, i) => (
              <option key={p.id} value={i}>
                {p.title}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-3">{problem.source}</p>
        </div>

        {showOnboarding && (
          <PenOnboarding
            userId={userId}
            store={templateStore}
            onStoreChange={setTemplateStore}
            policy={penPolicy}
            mode={redoOnboarding ? 'redo' : 'first'}
            onFinish={() => {
              setNeedOnboarding(false)
              setRedoOnboarding(false)
            }}
            onExit={() => {
              // 途中でやめたら登録済み分は残し、次回ペン方式を開いたとき続きから。
              // それまでの練習はタップ方式で行える
              setRedoOnboarding(false)
              if (needOnboarding) setInputMode('tap')
            }}
          />
        )}
        {inputMode === 'pen' && needOnboarding === null ? null : inputMode === 'pen' ? (
          !showOnboarding && (
            <PenSyntaxAnnotator
              tokens={problem.tokens}
              answer={answer}
              onChange={(next) => {
                setAnswer(next)
                setGrade(null)
              }}
              posMarks={grade?.posMark}
              roleMarks={grade?.roleMark}
              spanMarks={grade?.spanMark}
              policy={penPolicy}
              templateStore={templateStore}
              inputLog={inputLogRef.current}
              onPalm={setPalm}
            />
          )
        ) : (
          <SyntaxAnnotator
            tokens={problem.tokens}
            answer={answer}
            onChange={(next) => {
              setAnswer(next)
              setGrade(null)
            }}
            posMarks={grade?.posMark}
            roleMarks={grade?.roleMark}
            spanMarks={grade?.spanMark}
            posOptions={POS_LETTER_OPTIONS}
            roleOptions={ROLE_LETTER_OPTIONS}
          />
        )}

        {inputMode === 'pen' && palm.rejectedTouches > 0 && (
          <p className="mb-3 text-xs text-ink-3">
            🖐 手のひら・指とみなした接触を {palm.rejectedTouches} 件、線にせず無効化しました（ペン専用）。
            ペンで書いた線まで反応しない場合は、ページ下部の「入力の記録」をコピーして報告に貼ってください。
          </p>
        )}

        {!showOnboarding && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGrade(gradeSyntax(problem, answer))}
            className="flex-1 rounded-xl bg-nodo px-4 py-3 text-base font-bold text-white"
          >
            採点する
          </button>
          <button
            type="button"
            onClick={() => load(problemIdx)}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-ai"
          >
            リセット
          </button>
          <button
            type="button"
            onClick={() => {
              const raw = modelAnswer(problem)
              // 正解表は漢字の品詞名なので、表示用に英字略記へそろえる
              const m = { ...raw, pos: raw.pos.map((v) => (v == null ? null : posLetter(v))) }
              setAnswer(m)
              setGrade(gradeSyntax(problem, m))
            }}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-ai"
          >
            正解を表示
          </button>
        </div>
        )}

        {grade && (
          <div className="mt-4 space-y-2 border-t border-gray-200 pt-4">
            <p className="text-lg font-extrabold text-ai">
              得点: <span className="text-sora-dark">{grade.got} / {grade.total}（{grade.percent}%）</span>
            </p>
            {grade.feedback.length === 0 ? (
              <p className="rounded-xl bg-good-bg p-2.5 text-sm text-good">全項目正解です。</p>
            ) : (
              grade.feedback.map((f, i) => (
                <p
                  key={i}
                  className={`rounded-xl p-2.5 text-sm ${
                    f.tone === 'ok'
                      ? 'bg-good-bg text-good'
                      : f.tone === 'alt'
                        ? 'bg-hard-bg text-hard'
                        : 'bg-again-bg text-again'
                  }`}
                >
                  {f.text}
                </p>
              ))
            )}

            {contradictions.length > 0 && (
              <div className="rounded-xl border border-again/40 bg-white p-3">
                <p className="mb-1 text-sm font-bold text-ai">
                  ⚖️ 矛盾検査
                  <span className="ml-1 text-xs font-normal text-ink-3">
                    — ルールブックの言い切りから機械的に見つかった矛盾（正解を知らなくても指摘できるもの）
                  </span>
                </p>
                <div className="space-y-1.5">
                  {contradictions.map((c, i) => (
                    <p
                      key={i}
                      className={`rounded-lg p-2 text-sm ${
                        c.severity === 'error' ? 'bg-again-bg text-again' : 'bg-hard-bg text-hard'
                      }`}
                    >
                      {c.severity === 'error' ? '✕ ' : '△ '}
                      {c.text}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {problem.key.notes.length > 0 && (
              <div className="rounded-xl bg-sora-soft p-3 text-sm text-ai">
                <p className="mb-1 font-bold">この文の分析ポイント・曖昧箇所</p>
                {problem.key.notes.map((n, i) => (
                  <p key={i}>・{n}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {inputMode === 'pen' && (
          <details className="mt-6">
            <summary className="cursor-pointer text-xs font-semibold text-ink-3">
              入力の記録（ペンの不具合の報告用）
            </summary>
            <div className="mt-2">
              <PenInputLogPanel log={inputLogRef.current} />
            </div>
          </details>
        )}

        {inputMode === 'pen' && needOnboarding === false && !redoOnboarding && (
          <p className="mt-3 text-xs text-ink-3">
            記号の判別が合いにくいときは、
            <button
              type="button"
              onClick={() => setRedoOnboarding(true)}
              className="font-semibold text-sora-dark underline"
            >
              お手本を登録し直す
            </button>
            か、<Link href="/reading/syntax/pen-lab" className="font-semibold text-sora-dark underline">ペン判別の計測</Link>
            ページ下部の「お手本登録」で字を追加できます。
          </p>
        )}
      </div>
    </AppLayout>
  )
}
