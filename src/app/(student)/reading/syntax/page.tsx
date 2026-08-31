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
import { missingRequired, needsEnrollment, REQUIRED_SYMBOLS } from '@/lib/pen-syntax/onboarding'
import {
  appendOrderHistory,
  describeStep,
  loadModelOrders,
  reduceOrderEvents,
  saveModelOrder,
  type AnalysisStep,
  type ModelOrder,
  type OrderEvent,
} from '@/lib/pen-syntax/order'
import { nextOrderHint, type OrderHint } from '@/lib/pen-syntax/order-hints'
import { ModelOrderPanel } from '@/components/pen-syntax/ModelOrderPanel'
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
  type SyntaxProblem,
} from '@/lib/reading/syntax'
import { checkContradictions } from '@/lib/reading/syntax-check'
import {
  isInstructorProblem,
  syntaxProblemsFor,
  type InstructorSyntaxSet,
} from '@/lib/reading/syntax-instructor'
import { describeReadingError } from '@/lib/reading/lessons'

export default function SyntaxDrillPage() {
  const { userId, profile, isLoading: authLoading } = useAuth()
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'
  const [problemIdx, setProblemIdx] = useState(0)
  /**
   * 模範分析集（第7講）から取り込んだ講師用の問題（共有事項 C24）。
   * **生徒には出さない**（記号の一部が落ちており許容解も無いため）。
   * 語の並びは教材データから読み合わせる。正解表そのものは画面のコードに同梱せず、
   * 講師・管理者だけが読める入口（/api/reading/syntax-problems）から取りに行く。
   */
  const [instructorProblems, setInstructorProblems] = useState<SyntaxProblem[]>([])
  const [instructorSet, setInstructorSet] = useState<InstructorSyntaxSet | null>(null)
  const [instructorError, setInstructorError] = useState<string | null>(null)
  const problems = syntaxProblemsFor(SYNTAX_PROBLEMS, instructorProblems, isTeacher)
  const problem = problems[problemIdx] ?? problems[0]
  const [answer, setAnswer] = useState<SyntaxAnswer>(() => emptyAnswer(SYNTAX_PROBLEMS[0]))
  const [grade, setGrade] = useState<SyntaxGrade | null>(null)
  const [inputMode, setInputMode] = useState<'pen' | 'tap'>('pen')
  // 分析の順序の記録（ペン方式のみ）: 記入・取り消し・削除を時系列でため、採点時に並びへ畳む
  const orderEventsRef = useRef<OrderEvent[]>([])
  const [orderSteps, setOrderSteps] = useState<AnalysisStep[]>([])
  // 検討順ヒント「迷ったらまずこれ」（規則ベース・答えは言わない）
  const [hint, setHint] = useState<OrderHint | null>(null)
  // 模範の順序（講師用・この端末に保存）
  const [modelOrders, setModelOrders] = useState<ModelOrder[]>([])
  const [modelSaved, setModelSaved] = useState(false)
  useEffect(() => {
    if (isTeacher) setModelOrders(loadModelOrders())
  }, [isTeacher])
  useEffect(() => {
    if (!isTeacher) {
      setInstructorProblems([])
      setInstructorSet(null)
      setInstructorError(null)
      return
    }
    let alive = true
    // 講師用の正解表（35文ぶん）は、講師・管理者だけが読める入口から取りに行く。
    // 誰が読めるかを決めているのは入口（サーバー側で役割を確かめる）で、
    // ここの判定は見せ方だけの役割（2026-08-28）
    import('@/lib/reading/syntax-instructor-load')
      .then((m) => m.loadInstructorSyntax())
      .then(({ set, problems: list }) => {
        if (!alive) return
        setInstructorSet(set)
        setInstructorProblems(list)
      })
      .catch((err) => {
        if (alive) setInstructorError(describeReadingError(err).message)
      })
    return () => {
      alive = false
    }
  }, [isTeacher])
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
    // お手本は利用者ごとに読む。共有端末で他人の登録を「本人の登録済み」と
    // 取り違えないよう、判定は本人のお手本がそろっているかだけで行う（2026-08-27）
    const s = loadUserTemplates(userId)
    setTemplateStore(s)
    setNeedOnboarding(needsEnrollment(s))
  }, [authLoading, userId])
  const showOnboarding = inputMode === 'pen' && (needOnboarding === true || redoOnboarding)

  const load = (idx: number) => {
    setProblemIdx(idx)
    setAnswer(emptyAnswer(problems[idx]))
    setGrade(null)
    orderEventsRef.current = []
    setOrderSteps([])
    setHint(null)
    setModelSaved(false)
  }

  const gradeNow = () => {
    const g = gradeSyntax(problem, answer)
    setGrade(g)
    setModelSaved(false)
    // 確定した分析に「どの記号をどの順で書いたか」を付帯情報として持つ（ペン方式のみ）
    const steps = inputMode === 'pen' ? reduceOrderEvents(orderEventsRef.current) : []
    setOrderSteps(steps)
    if (steps.length > 0) {
      appendOrderHistory({
        problemId: problem.id,
        problemTitle: problem.title,
        steps,
        percent: g.percent,
        gradedAt: new Date().toISOString(),
      })
    }
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
          <br />
          例外の印（<b>仮</b>・<b>真</b>・<b>強</b>）は手書きせず、<b>働きのマスをタッチ</b>して
          付け外しします（仮・真は S・O を書いた単語に）。同格は働きの一覧の「<b>同</b>」を選びます。
          働きの欄に「仮S」のように出ます
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
            <optgroup label="練習">
              {SYNTAX_PROBLEMS.map((p, i) => (
                <option key={p.id} value={i}>
                  {p.title}
                </option>
              ))}
            </optgroup>
            {instructorSet && instructorProblems.length > 0 && (
              <optgroup
                label={`模範分析集 ${instructorSet.lesson}（講師用 ${instructorProblems.length}問・生徒には出しません）`}
              >
                {instructorProblems.map((p, i) => (
                  <option key={p.id} value={SYNTAX_PROBLEMS.length + i}>
                    {p.title}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <p className="mt-1.5 text-xs text-ink-3">{problem.source}</p>
          {instructorError && (
            <p className="mt-1.5 rounded-lg bg-again-bg p-2 text-xs text-again">
              模範分析集の問題を読み込めませんでした: {instructorError}
            </p>
          )}
        </div>

        {instructorSet && isInstructorProblem(problem, instructorSet) && (
          /* 講師用の問題は、開いた時点で「何が落ちているか」を読めるようにする。
             記号の一部に受け皿が無く、許容解も無いまま取り込んでいるため */
          <div className="mb-3 rounded-card border border-hard/40 bg-hard-bg p-3 text-sm text-ai">
            <p className="font-bold text-hard">
              ⚠ 講師用の問題です（生徒には出ません）
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">
              {instructorSet.notReadyNote}
            </p>
            <p className="mt-2 text-xs font-bold text-ai">この文の分析ポイント・落とした記号</p>
            <ul className="mt-0.5 space-y-0.5 text-xs leading-relaxed text-ink-2">
              {problem.key.notes.slice(1).map((n, i) => (
                <li key={i}>・{n}</li>
              ))}
            </ul>
          </div>
        )}

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
        {!showOnboarding && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setHint(nextOrderHint(problem.tokens, answer))}
              className="rounded-full border border-sora bg-white px-3 py-1.5 text-xs font-bold text-sora-dark"
            >
              💡 迷ったらまずこれ
            </button>
            {hint && (
              <div className="mt-2 rounded-xl border border-sora/40 bg-sora-soft p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-ai">{hint.title}</p>
                  <button
                    type="button"
                    onClick={() => setHint(null)}
                    aria-label="ヒントを閉じる"
                    className="shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold text-ink-3"
                  >
                    ✕
                  </button>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-2">{hint.guide}</p>
                <p className="mt-1 text-[10px] text-ink-3">
                  ※ 正解ではなく「次に調べる対象と調べ方」の案内です。書き込みが進んだら、もう一度押すと次の項目が出ます。
                </p>
              </div>
            )}
          </div>
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
              onOrderEvent={(ev) => orderEventsRef.current.push(ev)}
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
            onClick={gradeNow}
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
              // 表示した正解は自分で書いた並びではないので、順序の表示は消す
              setOrderSteps([])
              setModelSaved(false)
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

            {orderSteps.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <p className="mb-1 text-sm font-bold text-ai">
                  ✍️ 書いた順序
                  <span className="ml-1 text-xs font-normal text-ink-3">
                    — どの記号をどの順で書いたか（筆画の時刻から。順序も大切な作業）
                  </span>
                </p>
                <ol className="list-decimal space-y-0.5 pl-5 text-sm text-ink-2">
                  {orderSteps.map((s, i) => (
                    <li key={i}>{describeStep(s, problem.tokens)}</li>
                  ))}
                </ol>
                {isTeacher && (
                  <button
                    type="button"
                    disabled={modelSaved}
                    onClick={() => {
                      setModelOrders(
                        saveModelOrder({
                          problemId: problem.id,
                          problemTitle: problem.title,
                          steps: orderSteps,
                          summary: orderSteps.map((s) => describeStep(s, problem.tokens)),
                        }),
                      )
                      setModelSaved(true)
                    }}
                    className={`mt-2 rounded-xl px-3 py-2 text-xs font-bold ${
                      modelSaved ? 'bg-paper text-ink-3' : 'bg-sora text-white'
                    }`}
                  >
                    {modelSaved ? '模範の順序として保存しました' : 'この筆順を模範の順序として保存（講師）'}
                  </button>
                )}
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

        {isTeacher && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold text-ink-3">
              模範の順序（講師用・この端末に保存 {modelOrders.length} 件）
            </summary>
            <div className="mt-2">
              <ModelOrderPanel orders={modelOrders} onOrdersChange={setModelOrders} />
            </div>
          </details>
        )}

        {inputMode === 'pen' && needOnboarding === false && !redoOnboarding && (
          <p className="mt-3 text-xs text-ink-3">
            お手本の登録: {REQUIRED_SYMBOLS.length - missingRequired(templateStore).length} /{' '}
            {REQUIRED_SYMBOLS.length} 種（この端末に、いまログインしている人のぶんだけ保存されています）。
            <br />
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
