---
name: llm-integration
description: LLM連携機能（OCR、TTS、例文生成）の仕様。AI機能実装時に参照。
---

# LLM連携仕様

## 概要

| 機能 | 用途 | 推奨API |
|------|------|---------|
| OCR | 単語帳写真→テキスト | Claude Vision / GPT-4 Vision |
| TTS | 音声生成 | OpenAI TTS / Google Cloud TTS |
| 例文生成 | 単語→例文 | Claude / GPT-4 |

## 環境変数

```bash
# .env.local
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLOUD_API_KEY=...  # optional
```

## 1. OCR（画像→テキスト抽出）

### ユースケース
講師が単語帳のページを撮影→自動でカード作成

### 実装方針
```typescript
// src/lib/llm/ocr.ts
import Anthropic from '@anthropic-ai/sdk'

export async function extractWordsFromImage(
  imageBase64: string
): Promise<ExtractedWord[]> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 }
        },
        {
          type: 'text',
          text: `この単語帳のページから単語を抽出してください。
JSON形式で出力:
[{"word": "apple", "meaning": "りんご", "example": "..."}]`
        }
      ]
    }]
  })

  return JSON.parse(response.content[0].text)
}
```

### 出力形式
```typescript
interface ExtractedWord {
  word: string
  meaning: string
  pronunciation?: string
  example?: string
  partOfSpeech?: string
}
```

## 2. TTS（音声生成）

### ユースケース
- 単語の正しい発音を生成
- 例文の読み上げを生成

### OpenAI TTS
```typescript
// src/lib/llm/tts.ts
import OpenAI from 'openai'

export async function generateSpeech(
  text: string,
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova'
): Promise<Buffer> {
  const client = new OpenAI()

  const response = await client.audio.speech.create({
    model: 'tts-1',
    voice,
    input: text,
  })

  return Buffer.from(await response.arrayBuffer())
}
```

### 音声ファイル保存
```typescript
// Supabase Storageに保存
const { data, error } = await supabase.storage
  .from('audio')
  .upload(`words/${wordId}.mp3`, audioBuffer, {
    contentType: 'audio/mpeg'
  })
```

### 料金目安（OpenAI TTS）
- tts-1: $15 / 1M characters
- 1単語（10文字）: $0.00015
- 1万単語: 約$1.5

## 3. 例文生成

### ユースケース
単語を入力→その単語を使った例文を自動生成

### 実装方針
```typescript
// src/lib/llm/example-generator.ts
import Anthropic from '@anthropic-ai/sdk'

export async function generateExamples(
  word: string,
  meaning: string,
  count: number = 3
): Promise<GeneratedExample[]> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `英単語「${word}」（意味: ${meaning}）を使った例文を${count}個作成してください。
高校生が理解できるレベルで、コロケーションも含めてください。

JSON形式で出力:
[{"english": "...", "japanese": "...", "collocation": "..."}]`
    }]
  })

  return JSON.parse(response.content[0].text)
}
```

### 出力形式
```typescript
interface GeneratedExample {
  english: string
  japanese: string
  collocation?: string  // e.g., "make a decision"
}
```

## バッチ処理

大量のカードを処理する場合:

```typescript
// src/lib/llm/batch.ts
export async function batchGenerateAudio(
  words: string[],
  onProgress: (current: number, total: number) => void
): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  for (let i = 0; i < words.length; i++) {
    const audio = await generateSpeech(words[i])
    const url = await uploadToStorage(audio)
    results.set(words[i], url)

    onProgress(i + 1, words.length)

    // Rate limiting
    await sleep(100)
  }

  return results
}
```

## コスト管理

```sql
-- 使用量トラッキングテーブル
CREATE TABLE llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  service TEXT NOT NULL,  -- 'openai_tts', 'claude_vision', etc.
  tokens_or_chars INTEGER NOT NULL,
  estimated_cost DECIMAL(10, 6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## UI フロー

### OCR
```
1. 画像アップロード
2. プレビュー表示
3. 「抽出開始」ボタン
4. 結果表示（編集可能なテーブル）
5. 確認して一括インポート
```

### TTS
```
1. デッキ選択
2. 「音声を生成」ボタン
3. プログレスバー表示
4. 完了通知
```

### 例文生成
```
1. 単語編集画面
2. 「例文を生成」ボタン
3. 候補表示（複数）
4. 選択して保存
```
