export const meta = {
  name: 'chu-eitango-gen',
  description: '中学英単語の暗誦例文を生成（1語×3コロケーション例文、Sonnet並列）',
  phases: [{ title: 'Generate', detail: '品詞横断のバッチごとに例文を生成' }],
}

// args: [{ id, pos, word, meaning }, ...]
const GEN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          word: { type: 'string' },
          sentences: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                collocation: { type: 'string', description: '文中に実際に現れる、対象語を含むフレーズ部分の文字列' },
                en: { type: 'string', description: '英文（5〜12語、中学レベル）' },
                ja: { type: 'string', description: '自然な和訳' },
              },
              required: ['collocation', 'en', 'ja'],
            },
          },
        },
        required: ['id', 'word', 'sentences'],
      },
    },
  },
  required: ['items'],
}

function buildPrompt(chunk) {
  return `あなたは日本の中学生向けの「英単語 暗誦カード」の例文を作成する専門家です。レベルは新学習指導要領・CEFR A1〜A2（中学英語）。

以下の各「対象語」について、ちょうど3つの例文を作ってください。

【厳守ルール】
1. 各例文には、対象語そのものを含む「よく使われるコロケーション／定型フレーズ」を必ず1つ、自然な形で含める。
   例: able→"be able to" / take→"take care of","take a picture","take part in" / interested→"interested in"
2. 同じ対象語の3文は、必ず3つの【異なる】コロケーション／フレーズを使う(重複禁止)。
3. 文は短く自然で中学生が暗誦しやすいこと（およそ5〜12語）。1文1アイデア。
4. 各文に、こなれた自然な和訳を付ける（直訳すぎない）。
5. "collocation" には、その英文中に実際に現れるフレーズ部分の文字列をそのまま（大文字小文字も一致させて）入れる。これは下線強調に使う。
6. 与えた品詞(pos)と意味(meaning)に合った語義で使うこと。
7. 数字・冠詞・代名詞・間投詞・固有名詞など、定型コロケーションが乏しい語は、3つの【異なる】自然な定番フレーズ／使い方で代用してよい。
   例: three→"three times","for three days","three of us" / the→"the same","the best","all the way" / wow→"Wow, ...","say wow"。
   固有名詞(国名など)はその対象に関する自然な中学レベルの文で可。
8. 出力は英文・和訳・コロケーションのみ。説明や注釈は不要。

【対象語(JSON)】
${JSON.stringify(chunk, null, 0)}

各対象語の "id" は入力のものをそのまま返すこと。`
}

const words = Array.isArray(args) ? args : []
if (words.length === 0) {
  log('⚠️ args が空です。単語配列を args で渡してください。')
  return { count: 0, items: [] }
}

const CHUNK = 20
const chunks = []
for (let i = 0; i < words.length; i += CHUNK) chunks.push(words.slice(i, i + CHUNK))
log(`対象 ${words.length} 語 / ${chunks.length} バッチ（各最大 ${CHUNK} 語、1語×3例文）`)

phase('Generate')
const results = await parallel(
  chunks.map((chunk, ci) => () =>
    agent(buildPrompt(chunk), {
      label: `gen:${ci + 1}/${chunks.length} (${chunk[0].word}…)`,
      phase: 'Generate',
      schema: GEN_SCHEMA,
      model: 'sonnet',
    })
  )
)

const items = []
let failed = 0
results.forEach((r, i) => {
  if (r && Array.isArray(r.items)) items.push(...r.items)
  else { failed++; log(`バッチ ${i + 1} が結果を返しませんでした`) }
})

log(`生成完了: ${items.length} 語分（失敗バッチ ${failed}）`)
return { count: items.length, failedBatches: failed, items }
