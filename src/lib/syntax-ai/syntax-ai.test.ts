import { describe, expect, it } from 'vitest'
import { estimateCostYen, DEFAULT_MODEL, MODEL_PRICES } from './pricing'
import { evaluateGate, jstMonthStartIso, MAX_ALLOWED_STUDENTS, type SyntaxAiConfig } from './gate'
import { parseJudgeResponse, serializeAnswer } from './serialize'
import {
  buildDialogueMessages,
  buildJudgeUserMessage,
  buildSystemBlocks,
  describeIssuesForDialogue,
} from './prompt'
import { buildCardFields, renderAnalysisHtml } from './card'
import { reconcileProgress, emptyProgress } from '@/lib/reading/progress'
import type { ReadingLessonData, SentenceSyntaxWork } from '@/lib/reading/types'

const TOKENS = ['My', 'brother', 'plays', 'tennis', 'very', 'well', '.']
const ANSWER: SentenceSyntaxWork['answer'] = {
  pos: ['代名詞', '名詞', '動詞', null, '副詞', '副詞', null],
  role: ['M', 'S', 'V', 'O', null, 'M', null],
  spans: [
    { from: 0, to: 1, type: 'ul' },
    { from: 4, to: 5, type: 'adv' },
  ],
}

/* ===================== 費用計算 ===================== */

describe('estimateCostYen', () => {
  it('Sonnet 4.6 の単価×為替で円換算する', () => {
    // 入力1M=3$ → 150円レートで 450円
    expect(estimateCostYen('claude-sonnet-4-6', { input: 1_000_000, output: 0, cacheWrite: 0, cacheRead: 0 })).toBe(450)
    // 出力1000tok = 15$/M × 1000 = 0.015$ = 2.25円
    expect(estimateCostYen('claude-sonnet-4-6', { input: 0, output: 1000, cacheWrite: 0, cacheRead: 0 })).toBe(2.25)
  })

  it('キャッシュ書込（1h=入力の2倍）と読取（1割）を計上する', () => {
    const yen = estimateCostYen('claude-sonnet-4-6', {
      input: 0,
      output: 0,
      cacheWrite: 40_000,
      cacheRead: 40_000,
    })
    // 書込 40k×6$/M=0.24$、読取 40k×0.3$/M=0.012$ → 合計 0.252$ = 37.8円
    expect(yen).toBeCloseTo(37.8, 4)
  })

  it('未知のモデルは Sonnet の単価で高めに見積もる', () => {
    const usage = { input: 100_000, output: 10_000, cacheWrite: 0, cacheRead: 0 }
    expect(estimateCostYen('claude-unknown-model', usage)).toBe(
      estimateCostYen('claude-sonnet-4-6', usage)
    )
  })

  it('既定モデルの単価表が存在する', () => {
    expect(MODEL_PRICES[DEFAULT_MODEL]).toBeDefined()
  })
})

/* ===================== 受付判定（ゲート） ===================== */

const CONFIG: SyntaxAiConfig = {
  enabled: true,
  allowedUserIds: ['stu-1', 'stu-2'],
  startsAt: '2026-08-01T00:00:00Z',
  endsAt: '2026-09-01T00:00:00Z',
  monthlyCapYen: 3000,
  model: 'claude-sonnet-4-6',
}
const NOW = new Date('2026-08-21T03:00:00Z')

describe('evaluateGate', () => {
  it('許可生徒・期間内・上限未満なら通す', () => {
    expect(evaluateGate(CONFIG, 'stu-1', 1200, NOW)).toMatchObject({ allowed: true, reason: null })
  })

  it('停止中は通さない', () => {
    expect(evaluateGate({ ...CONFIG, enabled: false }, 'stu-1', 0, NOW).reason).toBe('disabled')
  })

  it('許可一覧にいない生徒は通さない', () => {
    expect(evaluateGate(CONFIG, 'stu-9', 0, NOW).reason).toBe('not-allowed')
  })

  it('期間の前後は通さない', () => {
    expect(evaluateGate(CONFIG, 'stu-1', 0, new Date('2026-07-31T00:00:00Z')).reason).toBe('before-start')
    expect(evaluateGate(CONFIG, 'stu-1', 0, new Date('2026-09-01T00:00:00Z')).reason).toBe('ended')
  })

  it('月の上限に達したら通さない（ちょうど到達も含む）', () => {
    expect(evaluateGate(CONFIG, 'stu-1', 3000, NOW).reason).toBe('cap-reached')
    expect(evaluateGate(CONFIG, 'stu-1', 3200, NOW).reason).toBe('cap-reached')
  })

  it('許可人数の上限は3人（試行の枠）', () => {
    expect(MAX_ALLOWED_STUDENTS).toBe(3)
  })
})

describe('jstMonthStartIso', () => {
  it('日本時間の暦月の始まりを返す（月末のUTC夜は翌月扱い）', () => {
    // UTC 8/31 20:00 = JST 9/1 05:00 → 9月の集計
    expect(jstMonthStartIso(new Date('2026-08-31T20:00:00Z'))).toBe('2026-08-31T15:00:00.000Z')
    // UTC 8/21 03:00 = JST 8/21 12:00 → 8月の集計（JST 8/1 00:00 = UTC 7/31 15:00）
    expect(jstMonthStartIso(new Date('2026-08-21T03:00:00Z'))).toBe('2026-07-31T15:00:00.000Z')
  })
})

/* ===================== 直列化と判定JSONの読み取り ===================== */

describe('serializeAnswer', () => {
  it('語番号つきで品詞・働き・まとまりを並べる', () => {
    const text = serializeAnswer(TOKENS, ANSWER, false)
    expect(text).toContain('英文: My brother plays tennis very well .')
    expect(text).toContain('1. My | 代名詞 | M')
    expect(text).toContain('4. tennis | — | O')
    expect(text).toContain('下線＝前置修飾のまとまり: 「My brother」（語1〜2）')
    expect(text).toContain('（ ）＝副詞句・副詞節: 「very well」（語5〜6）')
    expect(text).not.toContain('分からない')
  })

  it('「分からない」マークを明示する', () => {
    expect(serializeAnswer(TOKENS, ANSWER, true)).toContain('「分からない」マーク')
  })
})

describe('parseJudgeResponse', () => {
  it('JSONを取り出し、語順に並べ、cleanを計算し直す', () => {
    const res = parseJudgeResponse(`前置きの文章
\`\`\`json
{"issues":[
  {"no":5,"kind":"question","target":"very","point":"何を修飾していますか。","questionType":4},
  {"no":1,"kind":"notation","target":"My","point":"前置修飾には下線を引きます。"}
],"clean":true,"comment":"おしい"}
\`\`\``)
    expect(res).not.toBeNull()
    expect(res!.issues.map((i) => i.no)).toEqual([1, 5])
    // AIが clean:true と言っても誤りの指摘があれば false に直す
    expect(res!.clean).toBe(false)
    expect(res!.comment).toBe('おしい')
  })

  it('confirm（根拠確認）だけなら clean=true', () => {
    const res = parseJudgeResponse(
      '{"issues":[{"no":3,"kind":"confirm","target":"plays","point":"なぜVだと分かりますか。"}],"clean":false}'
    )
    expect(res!.clean).toBe(true)
  })

  it('壊れた返答は null（呼び出し側で再試行や案内に回す）', () => {
    expect(parseJudgeResponse('すみません、判定できません。')).toBeNull()
    expect(parseJudgeResponse('{"issues": [{}]}')).toEqual({ issues: [], clean: true })
  })
})

/* ===================== プロンプト組み立て ===================== */

describe('プロンプト組み立て', () => {
  it('採点基準ブロックは判定・問答で同一（キャッシュの前方一致が効く）', () => {
    const judge = buildSystemBlocks('judge')
    const dialogue = buildSystemBlocks('dialogue')
    expect(judge[0].text).toBe(dialogue[0].text)
    expect(judge[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
    expect(judge[1].text).not.toBe(dialogue[1].text)
    // 採点基準（ルールブック）が入っている
    expect(judge[0].text).toContain('構文分析ルールブック')
  })

  it('ユーザーメッセージは教材の文と書き込みだけ（氏名・IDを取りようがない引数設計）', () => {
    const msg = buildJudgeUserMessage(TOKENS, ANSWER, false)
    expect(msg).toContain('My brother plays')
    expect(msg).toContain('JSONだけを返してください')
  })

  it('問答は 冒頭（文+書き込み+指摘）→ 往復の順に並ぶ', () => {
    const judgeResult = {
      issues: [{ no: 5, kind: 'question' as const, target: 'very', point: '何を修飾？' }],
      clean: false,
    }
    const msgs = buildDialogueMessages(TOKENS, ANSWER, true, judgeResult, [
      { role: 'coach', text: 'veryは何を修飾していますか。' },
      { role: 'student', text: 'wellだと思います。' },
    ])
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].content).toContain('直近のAI判定の指摘')
    expect(msgs[1]).toEqual({ role: 'assistant', content: 'veryは何を修飾していますか。' })
    expect(msgs[2]).toEqual({ role: 'user', content: 'wellだと思います。' })
    expect(describeIssuesForDialogue(judgeResult)).toContain('「very」')
  })
})

/* ===================== カード描画 ===================== */

describe('renderAnalysisHtml / buildCardFields', () => {
  it('品詞・働き・下線・カッコをHTMLに描く', () => {
    const html = renderAnalysisHtml(TOKENS, ANSWER)
    expect(html).toContain('syn-row')
    expect(html).toContain('<span class="syn-pos">代名詞</span>')
    expect(html).toContain('syn-word syn-ul')
    expect(html).toContain('<span class="syn-br">（</span>')
    expect(html).toContain('<span class="syn-br">）</span>')
    // 句読点には働きを出さない
    expect(html).not.toContain('>.</span><span class="syn-role">M')
  })

  it('HTMLの特殊文字を無害化する', () => {
    const html = renderAnalysisHtml(['<b>'], { pos: ['名詞'], role: ['S'], spans: [] })
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('<b>')
  })

  it('カードには英文と分析だけを入れる（訳文フィールドが無い）', () => {
    const fields = buildCardFields(TOKENS, ANSWER, '英語長文最前線 第2講 第1段落 第1文')
    expect(Object.keys(fields).sort()).toEqual(['分析表示', '出典', '構文データ', '英文'].sort())
    expect(fields['英文']).toBe('My brother plays tennis very well .')
    expect(JSON.parse(fields['構文データ']).tokens).toEqual(TOKENS)
  })
})

/* ===================== 途中保存の互換（syntax欄の引き継ぎ） ===================== */

function lessonData(): ReadingLessonData {
  return {
    meta: {},
    paragraphs: [
      {
        no: 1,
        sentences: [{ id: 's1', text: TOKENS.join(' '), tokens: TOKENS }],
        kotos: [],
        segments: [],
        foldBoundaries: [],
        requiredCuts: [],
        macro: '',
        macroSym: '',
      },
    ],
  }
}

describe('reconcileProgress と syntax 欄', () => {
  it('保存済みの構文の書き込みを引き継ぐ', () => {
    const data = lessonData()
    const saved = emptyProgress('lesson-1', data)
    const work: SentenceSyntaxWork = {
      answer: ANSWER,
      unknown: true,
      hadErrors: false,
      confirmed: false,
      judge: null,
      dialogue: [],
      cardNoteId: null,
    }
    saved.syntax = { '0:0': work }
    const next = reconcileProgress(saved, 'lesson-1', data)
    expect(next.syntax?.['0:0']).toEqual(work)
  })

  it('教材の作り直しで語数が変わった文の書き込みは捨てる（壊れた表示を残さない）', () => {
    const data = lessonData()
    const saved = emptyProgress('lesson-1', data)
    saved.syntax = {
      '0:0': {
        answer: { pos: ['名詞'], role: ['S'], spans: [] },
        unknown: false,
        hadErrors: false,
        confirmed: false,
        judge: null,
        dialogue: [],
        cardNoteId: null,
      },
      '0:9': {
        answer: ANSWER,
        unknown: false,
        hadErrors: false,
        confirmed: false,
        judge: null,
        dialogue: [],
        cardNoteId: null,
      },
    }
    const next = reconcileProgress(saved, 'lesson-1', data)
    expect(next.syntax).toBeUndefined()
  })
})
