/**
 * AI判定・添削問答のプロンプト組み立て（純ロジック）。
 *
 * - 外部のAIへ送るのは「教材の文」と「生徒の書き込み・問答の文面」だけ。
 *   この層の関数は氏名・LINE識別子・内部IDを引数に取らない（絶対規程3の担保）。
 * - system の先頭ブロック（ルールブック全文＝採点基準）は判定・問答で同一バイト列にし、
 *   プロンプトキャッシュ（1時間TTL）の読み直し割引を効かせる。
 *   キャッシュは前方一致なので、変わる内容は必ずこのブロックより後に置く。
 */

import { RULEBOOK_TEXT } from './rulebook-text'
import { serializeAnswer } from './serialize'
import type { SentenceSyntaxWork, SyntaxJudgeResult } from '@/lib/reading/types'

type AnswerLike = SentenceSyntaxWork['answer']

/** 判定・問答で共通の前提（キャッシュ対象ブロックの一部） */
const SHARED_PREFACE = `あなたは「つばめ学習舎」の英語構文分析の添削者です。
以下の採点基準（構文分析ルールブック 正本＋増補＋構文添削の共通見解）だけを根拠に判定・問答します。
一般的な文法用語の流儀ではなく、必ずこのルールブックの記法・言い切りに従ってください。

生徒の入力手段は画面のタップ選択で、次の制約があります。判定の際に必ず踏まえること:
- 品詞は「名詞/代名詞/動詞/助動詞/形容詞/副詞/前置詞/接続詞/冠詞/分詞/不定詞」の11種から選ぶ
- 働きは「S/V/O/C/M/前O/接」の7種から選ぶ
- まとまりは「下線（前置修飾）/（ ）副詞句・節/[ ]名詞句・節/〈 〉後置修飾/｛ ｝補語」の5種
- ○囲み・免許マーク（〇仮 など）・波線は画面から書き込めない。これらが無いこと自体は誤りとしない
- 品詞・働きの未記入（—）は書き込みの省略段階（増補 Rule 38）とみなし、誤りとして指摘しない。
  ただし書いてある内容が間違っていれば指摘する`

const JUDGE_INSTRUCTION = `# 今回の仕事: 1文の通し分析への判定（1往復）

生徒の書き込みを採点基準に照らして検査し、指摘を文頭から語順に全件返します。

指摘の出し方（共通見解の原則3を守る）:
- 記法の運用ミス（kind="notation"）: 「ルールではこうする」と直接示す。ただし正しい分析内容（正解の品詞・働き・カッコ）そのものは明かさない
- 分析の判断ミス（kind="question"）: 正解を言わず、問いの型①〜⑤でブレイクダウンした問いを1つ出す。辞書・文法書で確認できるものは引き先（lookup）を必ず添える
- 正答の根拠確認（kind="confirm"）: 合っているが偶然の可能性がある重要箇所に、根拠を言語化させる問いを最大1件。誤りが多いときは出さない

出力は次のJSONだけを返す（前後に文章を付けない）:
{
  "issues": [
    {
      "no": 語番号（1始まり。文全体に関わる指摘は0）,
      "kind": "notation" | "question" | "confirm",
      "target": "対象の語句",
      "point": "指摘または問い（2文以内・生徒に直接語りかける日本語）",
      "questionType": 1〜5（kindがquestionのとき。①品詞を辞書で確認②候補を列挙して当てはめ③働き・用法を答えさせる④修飾先を明言させる⑤根拠の言語化）,
      "lookup": "辞書・文法書の引き先（例: 辞書で until を引き、前置詞と接続詞の両方の項を見る）"
    }
  ],
  "clean": 誤りの指摘（notation/question）がゼロなら true,
  "comment": "ひとこと（任意・1文）"
}
指摘は正確さを最優先し、確信が持てない箇所を無理に指摘しない。曖昧文（増補 Rule 41）は
選んだ分析として筋が通っていれば誤りとしない。`

const DIALOGUE_INSTRUCTION = `# 今回の仕事: 添削問答（復習カード行きの文についての対話）

判定で出た指摘について、生徒と1問ずつ対話します。守ること:
- 正解を言わない。辞書・文法書の引き先を指す（共通見解の原則1）
- 1回の返答に問いは1つ。文頭に近い論点から順に扱う
- 慣用の疑いは消去法の手続き（品詞候補を全部試す→どれも当てはまらない→辞書で立項を確認）で降ろす
- 生徒が正しく答えたら短く認めて次の論点へ。答えに窮したら問いをさらに小さく割る
- すべての論点が解消したら「書き込みを直して、もう一度AI判定を押しましょう」と伝えて締める
- 返答は日本語で3文以内。記号や絵文字の飾りは使わない`

export interface SystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral'; ttl: '1h' }
}

/**
 * system ブロックを組む。先頭（採点基準＋共通前提）が判定・問答で共通のキャッシュ対象。
 */
export function buildSystemBlocks(kind: 'judge' | 'dialogue'): SystemBlock[] {
  return [
    {
      type: 'text',
      text: `${SHARED_PREFACE}\n\n${RULEBOOK_TEXT}`,
      cache_control: { type: 'ephemeral', ttl: '1h' },
    },
    { type: 'text', text: kind === 'judge' ? JUDGE_INSTRUCTION : DIALOGUE_INSTRUCTION },
  ]
}

/** 判定のユーザーメッセージ（教材の文と書き込みだけを含む） */
export function buildJudgeUserMessage(
  tokens: string[],
  answer: AnswerLike,
  unknown: boolean
): string {
  return `${serializeAnswer(tokens, answer, unknown)}\n\n上記を判定し、指定のJSONだけを返してください。`
}

export interface DialogueMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 判定結果を問答の前提として文字列化する（指摘の文面だけ。ID類は含めない） */
export function describeIssuesForDialogue(result: SyntaxJudgeResult): string {
  if (result.issues.length === 0) return '（判定での指摘はありません）'
  return result.issues
    .map((i, n) => `${n + 1}. [${i.kind}] ${i.target ? `「${i.target}」: ` : ''}${i.point}`)
    .join('\n')
}

/**
 * 問答のメッセージ列を組む。先頭に文・書き込み・判定の指摘を置き、
 * 以降は生徒（user）とコーチ（assistant）の往復をそのまま並べる。
 */
export function buildDialogueMessages(
  tokens: string[],
  answer: AnswerLike,
  unknown: boolean,
  judgeResult: SyntaxJudgeResult | null,
  turns: Array<{ role: 'coach' | 'student'; text: string }>
): DialogueMessage[] {
  const opening = [
    serializeAnswer(tokens, answer, unknown),
    '',
    '直近のAI判定の指摘:',
    judgeResult ? describeIssuesForDialogue(judgeResult) : '（まだ判定していません）',
    '',
    '最初の論点から問答を始めてください。',
  ].join('\n')

  const messages: DialogueMessage[] = [{ role: 'user', content: opening }]
  for (const t of turns) {
    messages.push({ role: t.role === 'coach' ? 'assistant' : 'user', content: t.text })
  }
  return messages
}
