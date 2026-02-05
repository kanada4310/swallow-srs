import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import Anthropic from '@anthropic-ai/sdk'
import { MAX_IMAGE_SIZE, SUPPORTED_IMAGE_TYPES } from '@/lib/constants'
import type { FieldDefinition } from '@/types/database'

// Lazy initialization of Anthropic client
let anthropicClient: Anthropic | null = null

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropicClient
}

// Field-based OCR entry
interface OCREntryFields {
  fields: Record<string, string>
  confidence: 'high' | 'medium' | 'low'
}

// Legacy OCR entry (for backward compatibility)
interface OCREntryLegacy {
  word: string
  meaning: string
  extra?: string
  confidence: 'high' | 'medium' | 'low'
}

// Build system prompt dynamically based on fields
function buildSystemPrompt(fields?: FieldDefinition[]): string {
  if (!fields || fields.length === 0) {
    // Legacy prompt for Basic note type
    return `あなたは日本の学習者向け英単語帳のOCRアシスタントです。

タスク:
1. 画像内のすべての単語/意味のペアを特定
2. 構造化されたJSONフォーマットで抽出
3. 各抽出の信頼度を評価

ガイドライン:
- 単語エントリは「word - meaning」や番号付きリストの形式が多い
- 日本語の読み（ひらがな/カタカナ）は括弧内にある場合がある
- ヘッダー、ページ番号、装飾要素はスキップ
- 画像がぼやけている、または読みにくい部分があれば、confidenceをlow/mediumに設定
- JSONのみを返す（マークダウンや余分なテキストなし）

JSON形式:
{
  "entries": [
    {"word": "example", "meaning": "例", "extra": "発音やメモ", "confidence": "high"},
    ...
  ],
  "warnings": ["検出された問題（あれば）"]
}`
  }

  // Dynamic prompt based on field definitions
  const sortedFields = [...fields].sort((a, b) => a.ord - b.ord)
  const fieldList = sortedFields.map(f => `- ${f.name}`).join('\n')
  const exampleFields: Record<string, string> = {}
  for (const f of sortedFields) {
    exampleFields[f.name] = `(${f.name}の値)`
  }

  return `あなたは日本の学習者向け単語帳・教材のOCRアシスタントです。

タスク:
1. 画像内のすべてのエントリを特定
2. 各エントリのデータを、指定されたフィールドに分けて抽出
3. 各抽出の信頼度を評価

フィールド構成:
${fieldList}

ガイドライン:
- エントリは番号付きリスト、表形式、箇条書き等の形式が多い
- ヘッダー、ページ番号、装飾要素はスキップ
- 画像がぼやけている、または読みにくい部分があれば、confidenceをlow/mediumに設定
- 該当する情報がないフィールドは空文字""にする
- フィールド名から抽出すべき内容を推測する
- JSONのみを返す（マークダウンや余分なテキストなし）

JSON形式:
{
  "entries": [
    {"fields": ${JSON.stringify(exampleFields)}, "confidence": "high"},
    ...
  ],
  "warnings": ["検出された問題（あれば）"]
}`
}

// Build user prompt based on format hint and fields
function buildUserPrompt(formatHint?: string, fields?: FieldDefinition[]): string {
  if (!fields || fields.length === 0) {
    // Legacy prompt
    let prompt = `この画像から英単語と意味のペアを抽出してください。`

    if (formatHint) {
      prompt += `\n\nフォーマットヒント: この画像は「${formatHint}」の形式に似ています。`
    }

    prompt += `

以下のJSON形式で返してください（マークダウンやコードブロックなし）:
{
  "entries": [
    {"word": "英単語", "meaning": "日本語の意味", "extra": "発音記号やメモ（あれば）", "confidence": "high/medium/low"}
  ],
  "warnings": ["問題があれば記載"]
}

注意:
- すべての単語/意味ペアを抽出
- 番号、ページ番号、ヘッダーは除外
- 読み取れない部分はスキップしてwarningsに記載
- 各エントリのconfidenceを適切に設定`

    return prompt
  }

  // Dynamic prompt with fields
  const sortedFields = [...fields].sort((a, b) => a.ord - b.ord)
  const fieldNames = sortedFields.map(f => f.name)
  const exampleFields: Record<string, string> = {}
  for (const f of sortedFields) {
    exampleFields[f.name] = `(${f.name}の値)`
  }

  let prompt = `この画像からデータを抽出してください。各エントリは以下のフィールドを持ちます: ${fieldNames.join('、')}`

  if (formatHint) {
    prompt += `\n\nフォーマットヒント: この画像は「${formatHint}」の形式に似ています。`
  }

  prompt += `

以下のJSON形式で返してください（マークダウンやコードブロックなし）:
{
  "entries": [
    {"fields": ${JSON.stringify(exampleFields)}, "confidence": "high/medium/low"}
  ],
  "warnings": ["問題があれば記載"]
}

注意:
- すべてのエントリを抽出
- 番号、ページ番号、ヘッダーは除外
- 読み取れない部分はスキップしてwarningsに記載
- 該当する情報がないフィールドは空文字""にする
- 各エントリのconfidenceを適切に設定`

  return prompt
}

// Parse JSON response for field-based format
function parseOCRResponseFields(response: string, fields: FieldDefinition[]): { entries: OCREntryFields[], warnings?: string[] } | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.entries || !Array.isArray(parsed.entries)) return null

    const firstFieldName = [...fields].sort((a, b) => a.ord - b.ord)[0]?.name

    const entries: OCREntryFields[] = parsed.entries
      .filter((e: { fields?: Record<string, string> }) => {
        if (!e || !e.fields || typeof e.fields !== 'object') return false
        // Require first field (ord=0) to be non-empty
        if (firstFieldName && (!e.fields[firstFieldName] || e.fields[firstFieldName].trim() === '')) return false
        return true
      })
      .map((e: { fields: Record<string, string>; confidence?: string }) => {
        const cleanedFields: Record<string, string> = {}
        for (const f of fields) {
          cleanedFields[f.name] = (e.fields[f.name] || '').trim()
        }
        return {
          fields: cleanedFields,
          confidence: (['high', 'medium', 'low'].includes(e.confidence || '')
            ? e.confidence
            : 'medium') as 'high' | 'medium' | 'low',
        }
      })

    const result: { entries: OCREntryFields[], warnings?: string[] } = { entries }
    if (parsed.warnings && Array.isArray(parsed.warnings)) {
      result.warnings = parsed.warnings.filter((w: unknown) => typeof w === 'string')
    }
    return result
  } catch {
    return null
  }
}

// Parse JSON response for legacy format (word/meaning/extra)
function parseOCRResponseLegacy(response: string): { entries: OCREntryLegacy[], warnings?: string[] } | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.entries || !Array.isArray(parsed.entries)) return null

    const entries: OCREntryLegacy[] = parsed.entries
      .filter((e: { word?: string; meaning?: string }) =>
        e && typeof e.word === 'string' && typeof e.meaning === 'string' &&
        e.word.trim() !== '' && e.meaning.trim() !== ''
      )
      .map((e: { word: string; meaning: string; extra?: string; confidence?: string }) => ({
        word: e.word.trim(),
        meaning: e.meaning.trim(),
        extra: e.extra?.trim() || undefined,
        confidence: (['high', 'medium', 'low'].includes(e.confidence || '')
          ? e.confidence
          : 'medium') as 'high' | 'medium' | 'low',
      }))

    const result: { entries: OCREntryLegacy[], warnings?: string[] } = { entries }
    if (parsed.warnings && Array.isArray(parsed.warnings)) {
      result.warnings = parsed.warnings.filter((w: unknown) => typeof w === 'string')
    }
    return result
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check for Anthropic API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
        { status: 500 }
      )
    }

    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { image, imageType, deckId, formatHint, fields } = body as {
      image: string
      imageType: string
      deckId: string
      formatHint?: string
      fields?: FieldDefinition[]
    }

    // Validate required fields
    if (!image || !imageType || !deckId) {
      return NextResponse.json(
        { error: 'Missing required fields: image, imageType, deckId' },
        { status: 400 }
      )
    }

    // Validate image type
    if (!SUPPORTED_IMAGE_TYPES.includes(imageType)) {
      return NextResponse.json(
        { error: `Unsupported image type. Supported: ${SUPPORTED_IMAGE_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // Check image size (base64 is ~1.33x larger than binary)
    const estimatedSize = (image.length * 3) / 4
    if (estimatedSize > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: 'Image size exceeds 10MB limit' },
        { status: 400 }
      )
    }

    // Verify deck access (user owns it or it's assigned to them)
    const { data: deck } = await supabase
      .from('decks')
      .select('id, owner_id')
      .eq('id', deckId)
      .single()

    if (!deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    // Check access - owner or assigned
    let hasAccess = deck.owner_id === user.id

    if (!hasAccess) {
      // Check deck assignments
      const { data: assignment } = await supabase
        .from('deck_assignments')
        .select('id')
        .eq('deck_id', deck.id)
        .or(`user_id.eq.${user.id}`)
        .limit(1)
        .single()

      if (assignment) {
        hasAccess = true
      } else {
        // Check class-based assignment
        const { data: classMembership } = await supabase
          .from('class_members')
          .select('class_id')
          .eq('user_id', user.id)

        if (classMembership && classMembership.length > 0) {
          const classIds = classMembership.map(cm => cm.class_id)
          const { data: classAssignment } = await supabase
            .from('deck_assignments')
            .select('id')
            .eq('deck_id', deck.id)
            .in('class_id', classIds)
            .limit(1)
            .single()

          if (classAssignment) {
            hasAccess = true
          }
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const useFieldMode = fields && fields.length > 0

    // Call Claude Vision API
    const anthropic = getAnthropic()
    const systemPrompt = buildSystemPrompt(useFieldMode ? fields : undefined)
    const userPrompt = buildUserPrompt(formatHint, useFieldMode ? fields : undefined)

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                data: image,
              },
            },
            {
              type: 'text',
              text: userPrompt,
            },
          ],
        },
      ],
      system: systemPrompt,
    })

    // Extract text content
    const textContent = message.content.find(c => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { error: 'Failed to process image: empty response' },
        { status: 500 }
      )
    }

    // Parse response based on mode
    if (useFieldMode) {
      const ocrResult = parseOCRResponseFields(textContent.text, fields!)
      if (!ocrResult) {
        console.error('Failed to parse Claude OCR response:', textContent.text)
        return NextResponse.json(
          { error: 'Failed to parse OCR results' },
          { status: 500 }
        )
      }

      if (ocrResult.entries.length === 0) {
        return NextResponse.json({
          success: true,
          entries: [],
          warnings: ['画像からテキストを検出できませんでした。別の画像をお試しください。'],
          mode: 'fields',
        })
      }

      return NextResponse.json({
        success: true,
        entries: ocrResult.entries,
        warnings: ocrResult.warnings,
        mode: 'fields',
      })
    } else {
      // Legacy mode
      const ocrResult = parseOCRResponseLegacy(textContent.text)
      if (!ocrResult) {
        console.error('Failed to parse Claude OCR response:', textContent.text)
        return NextResponse.json(
          { error: 'Failed to parse OCR results' },
          { status: 500 }
        )
      }

      if (ocrResult.entries.length === 0) {
        return NextResponse.json({
          success: true,
          entries: [],
          warnings: ['画像からテキストを検出できませんでした。別の画像をお試しください。'],
          mode: 'legacy',
        })
      }

      return NextResponse.json({
        success: true,
        entries: ocrResult.entries,
        warnings: ocrResult.warnings,
        mode: 'legacy',
      })
    }
  } catch (error) {
    console.error('Error in OCR API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
