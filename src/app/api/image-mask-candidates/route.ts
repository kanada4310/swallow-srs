import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import Anthropic from '@anthropic-ai/sdk'
import { MAX_IMAGE_SIZE, SUPPORTED_IMAGE_TYPES } from '@/lib/constants'

// 画像マスキング候補検出API（Phase 13.4 増分B）
// Claude Vision で画像内のテキスト用語/ラベルを検出し、画像に対する相対位置（%）で返す。
// 座標は近似（ピクセル精度ではない）ため、UI 側でユーザーが微調整・追加できる前提。

let anthropicClient: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

interface Candidate {
  text: string
  x: number
  y: number
  w: number
  h: number
  confidence: 'high' | 'medium' | 'low'
}

const SYSTEM_PROMPT = `あなたは画像内のテキスト用語を検出するアシスタントです。

タスク:
- 画像に写っている「用語・ラベル・キーワード」（暗記対象になりうる短い語句）を検出する。
- 各用語について、画像全体を基準にした矩形の位置を 0〜100 の百分率で返す（左上を原点）。
  x=左端の%、y=上端の%、w=幅の%、h=高さの%。
- 枠は対象の語をやや広めに囲む（後でユーザーが微調整する前提）。

ガイドライン:
- 図解・地図・解剖図・年表など、ラベルが点在する教材を想定。
- 長い本文や説明文ではなく、暗記対象になる短い用語/固有名詞/数値を優先。
- 確信度を high/medium/low で付ける。
- JSONのみを返す（マークダウンや前置きなし）。

JSON形式:
{
  "candidates": [
    {"text": "用語", "x": 12.5, "y": 30.0, "w": 18.0, "h": 6.0, "confidence": "high"}
  ],
  "warnings": ["問題があれば記載"]
}`

function parseCandidates(response: string): { candidates: Candidate[]; warnings?: string[] } | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.candidates || !Array.isArray(parsed.candidates)) return null

    const clamp = (v: unknown): number => {
      const n = typeof v === 'number' ? v : parseFloat(String(v))
      if (!Number.isFinite(n)) return 0
      return Math.max(0, Math.min(100, n))
    }

    const candidates: Candidate[] = parsed.candidates
      .filter(
        (c: { text?: unknown }) =>
          c && typeof c.text === 'string' && c.text.trim() !== ''
      )
      .map((c: Record<string, unknown>) => {
        const x = clamp(c.x)
        const y = clamp(c.y)
        // 幅/高さは原点からはみ出さないよう上限
        const w = Math.min(clamp(c.w) || 8, 100 - x)
        const h = Math.min(clamp(c.h) || 5, 100 - y)
        const conf = ['high', 'medium', 'low'].includes(String(c.confidence))
          ? (c.confidence as 'high' | 'medium' | 'low')
          : 'medium'
        return { text: String(c.text).trim(), x, y, w, h, confidence: conf }
      })

    const result: { candidates: Candidate[]; warnings?: string[] } = { candidates }
    if (Array.isArray(parsed.warnings)) {
      result.warnings = parsed.warnings.filter((w: unknown) => typeof w === 'string')
    }
    return result
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 })
    }

    const supabase = await createClient()
    const { error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { image, imageType } = body as { image?: string; imageType?: string }

    if (!image || !imageType) {
      return NextResponse.json(
        { error: 'Missing required fields: image, imageType' },
        { status: 400 }
      )
    }
    if (!SUPPORTED_IMAGE_TYPES.includes(imageType)) {
      return NextResponse.json(
        { error: `Unsupported image type. Supported: ${SUPPORTED_IMAGE_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    const base64Data = image.includes(',') ? image.split(',')[1] : image
    const estimatedSize = (base64Data.length * 3) / 4
    if (estimatedSize > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: 'Image size exceeds 10MB limit' }, { status: 400 })
    }

    const anthropic = getAnthropic()
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: 'この画像から暗記対象になりうる用語を検出し、指定のJSON形式（位置は%）で返してください。',
            },
          ],
        },
      ],
    })

    const textContent = message.content.find((c) => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'Failed to process image: empty response' }, { status: 500 })
    }

    const result = parseCandidates(textContent.text)
    if (!result) {
      console.error('Failed to parse mask candidates:', textContent.text)
      return NextResponse.json({ error: 'Failed to parse candidates' }, { status: 500 })
    }

    return NextResponse.json({ success: true, candidates: result.candidates, warnings: result.warnings })
  } catch (error) {
    console.error('Error in image-mask-candidates API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
