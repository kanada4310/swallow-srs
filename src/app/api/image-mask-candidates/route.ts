import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import Anthropic from '@anthropic-ai/sdk'
import { MAX_IMAGE_SIZE, SUPPORTED_IMAGE_TYPES } from '@/lib/constants'

// 画像マスキング候補検出API（Phase 13.4）
//
// 2系統の検出を持ち、精度の高い順にフォールバックする:
//   1. Google Cloud Vision（DOCUMENT_TEXT_DETECTION）= 印刷ラベルの**正確なbbox**。
//      `GOOGLE_CLOUD_VISION_API_KEY` が設定されている時のみ。
//      テキストの選別（暗記対象かどうか）は Claude のテキストパスで補助（任意）。
//   2. Claude Vision = 用語を%bbox付きで推定（位置は近似）。Vision キーが無い/失敗時のフォールバック。
//
// いずれも座標は画像に対する 0〜100 の % で返す（表示サイズ非依存）。

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
  /** 暗記対象として初期チェックを入れるか（編集UIの included 初期値） */
  recommended?: boolean
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}
const round2 = (v: number) => Math.round(v * 100) / 100

// ============================================================
// 1. Google Cloud Vision（正確なbbox）
// ============================================================

interface VisionVertex {
  x?: number
  y?: number
}

function paragraphText(para: {
  words?: Array<{ symbols?: Array<{ text?: string; property?: { detectedBreak?: { type?: string } } }> }>
}): string {
  let s = ''
  for (const w of para.words || []) {
    for (const sym of w.symbols || []) {
      s += sym.text || ''
      const brk = sym.property?.detectedBreak?.type
      if (brk === 'SPACE' || brk === 'EOL_SURE_SPACE' || brk === 'LINE_BREAK') s += ' '
    }
  }
  return s.replace(/\s+/g, ' ').trim()
}

function vertsToBox(
  verts: VisionVertex[] | undefined,
  W: number,
  H: number,
  normalized: boolean
): { x: number; y: number; w: number; h: number } | null {
  if (!verts || verts.length === 0) return null
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const v of verts) {
    const x = normalized ? (v.x ?? 0) * 100 : ((v.x ?? 0) / W) * 100
    const y = normalized ? (v.y ?? 0) * 100 : ((v.y ?? 0) / H) * 100
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  const x = clampPct(minX)
  const y = clampPct(minY)
  const w = Math.min(clampPct(maxX - minX), 100 - x)
  const h = Math.min(clampPct(maxY - minY), 100 - y)
  if (w <= 0 || h <= 0) return null
  return { x: round2(x), y: round2(y), w: round2(w), h: round2(h) }
}

async function detectWithGoogleVision(base64: string, apiKey: string): Promise<Candidate[]> {
  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['ja', 'en'] },
          },
        ],
      }),
    }
  )
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Google Vision ${resp.status}: ${body.slice(0, 200)}`)
  }
  const data = await resp.json()
  const page = data?.responses?.[0]?.fullTextAnnotation?.pages?.[0]
  if (!page) return []
  const W = page.width
  const H = page.height
  if (!W || !H) return []

  const out: Candidate[] = []
  for (const block of page.blocks || []) {
    for (const para of block.paragraphs || []) {
      const text = paragraphText(para)
      if (!text) continue
      const bb = para.boundingBox
      const normalized = !!bb?.normalizedVertices && !bb?.vertices
      const box = vertsToBox(bb?.vertices || bb?.normalizedVertices, W, H, normalized)
      if (!box) continue
      const conf: number = para.confidence ?? block.confidence ?? 0.6
      out.push({
        text,
        ...box,
        confidence: conf >= 0.85 ? 'high' : conf >= 0.6 ? 'medium' : 'low',
      })
    }
  }
  return out
}

// Claude のテキストパスで「暗記対象になりうる短い用語」だけを選別（任意・失敗時は全件採用）
async function filterMaskWorthy(texts: string[]): Promise<Set<number> | null> {
  if (!process.env.ANTHROPIC_API_KEY || texts.length === 0) return null
  try {
    const list = texts.map((t, i) => `${i}: ${t}`).join('\n')
    const msg = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `与えられた候補から、暗記対象になりうる短い用語（固有名詞・専門用語・図のラベル）の番号だけを選ぶ。長い文・説明文・ページ番号・出典・記号のみは除外する。JSONのみ返す: {"keep":[番号,...]}`,
      messages: [{ role: 'user', content: `候補:\n${list}` }],
    })
    const tc = msg.content.find((c) => c.type === 'text')
    if (!tc || tc.type !== 'text') return null
    const m = tc.text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const parsed = JSON.parse(m[0])
    if (!Array.isArray(parsed.keep)) return null
    return new Set(parsed.keep.filter((n: unknown) => Number.isInteger(n)) as number[])
  } catch {
    return null
  }
}

// ============================================================
// 2. Claude Vision（%bbox 推定・フォールバック）
// ============================================================

const SYSTEM_PROMPT = `あなたは画像内のテキストラベルを検出するアシスタントです。

タスク:
- 画像に印刷された「用語・ラベル・キーワード」（暗記対象になりうる短い語句）を検出する。
- 各用語について、その**文字列が実際に描かれている矩形**を、画像全体を基準にした百分率(0〜100)で返す。
  x=文字列の左端の%、y=上端の%、w=文字列の幅の%、h=文字の高さの%。左上を原点とする。

位置決めの重要ルール（厳守）:
- 枠で囲むのは**ラベルの文字そのもの**。指し示している図・構造・アイコンや、引き出し線（リード線）は**含めない**。
- 枠は文字列に**タイトに**合わせる（上下左右の余白を最小限に）。横書きの用語は w が大きく h が小さい横長の矩形になるのが普通。
- 引き出し線で離れた位置に構造がある図では、構造の位置ではなく**文字が書いてある位置**に枠を置く。
- 同じ用語が複数回出るときはそれぞれ別の候補にする。

ガイドライン:
- 図解・地図・解剖図・年表など、ラベルが点在する教材を想定。
- 長い本文や説明文ではなく、暗記対象になる短い用語/固有名詞/数値を優先。
- 確信度を high/medium/low で付ける（位置に自信が無ければ low）。
- JSONのみを返す（マークダウンや前置きなし）。

JSON形式:
{
  "candidates": [
    {"text": "用語", "x": 12.5, "y": 30.0, "w": 18.0, "h": 5.0, "confidence": "high"}
  ],
  "warnings": ["問題があれば記載"]
}`

function parseClaudeCandidates(
  response: string
): { candidates: Candidate[]; warnings?: string[] } | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.candidates || !Array.isArray(parsed.candidates)) return null

    const candidates: Candidate[] = parsed.candidates
      .filter((c: { text?: unknown }) => c && typeof c.text === 'string' && c.text.trim() !== '')
      .map((c: Record<string, unknown>) => {
        const x = clampPct(typeof c.x === 'number' ? c.x : parseFloat(String(c.x)))
        const y = clampPct(typeof c.y === 'number' ? c.y : parseFloat(String(c.y)))
        const w = Math.min(clampPct(typeof c.w === 'number' ? c.w : parseFloat(String(c.w))) || 8, 100 - x)
        const h = Math.min(clampPct(typeof c.h === 'number' ? c.h : parseFloat(String(c.h))) || 5, 100 - y)
        const conf = ['high', 'medium', 'low'].includes(String(c.confidence))
          ? (c.confidence as 'high' | 'medium' | 'low')
          : 'medium'
        return { text: String(c.text).trim(), x, y, w, h, confidence: conf, recommended: true }
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

async function detectWithClaudeVision(
  base64: string,
  imageType: string
): Promise<{ candidates: Candidate[]; warnings?: string[] } | null> {
  const message = await getAnthropic().messages.create({
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
              data: base64,
            },
          },
          {
            type: 'text',
            text: 'この画像から暗記対象になりうる用語を検出し、指定のJSON形式で返してください。枠は「文字が書かれている位置」にタイトに合わせ、引き出し線や指し示す構造は含めないこと。',
          },
        ],
      },
    ],
  })
  const textContent = message.content.find((c) => c.type === 'text')
  if (!textContent || textContent.type !== 'text') return null
  return parseClaudeCandidates(textContent.text)
}

// ============================================================
// Route
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const googleKey = process.env.GOOGLE_CLOUD_VISION_API_KEY
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY
    if (!googleKey && !hasAnthropic) {
      return NextResponse.json(
        { error: 'No detection backend configured (set GOOGLE_CLOUD_VISION_API_KEY or ANTHROPIC_API_KEY)' },
        { status: 500 }
      )
    }

    const supabase = await createClient()
    const { error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { image, imageType } = body as { image?: string; imageType?: string }
    if (!image || !imageType) {
      return NextResponse.json({ error: 'Missing required fields: image, imageType' }, { status: 400 })
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

    const warnings: string[] = []

    // 1. Google Cloud Vision（正確bbox）
    if (googleKey) {
      try {
        let candidates = await detectWithGoogleVision(base64Data, googleKey)
        if (candidates.length > 0) {
          const keep = await filterMaskWorthy(candidates.map((c) => c.text))
          candidates = candidates.map((c, i) => ({
            ...c,
            recommended: keep ? keep.has(i) : true,
          }))
          return NextResponse.json({ success: true, candidates, source: 'google-vision' })
        }
        // 0件はテキスト無しの可能性。Claude にフォールバック。
      } catch (e) {
        console.error('Google Vision failed, falling back to Claude Vision:', e)
        warnings.push('高精度OCRに失敗したため簡易検出に切替えました（位置はおおまかです）')
      }
    }

    // 2. Claude Vision（%bbox 推定）
    if (hasAnthropic) {
      const result = await detectWithClaudeVision(base64Data, imageType)
      if (!result) {
        return NextResponse.json({ error: 'Failed to parse candidates' }, { status: 500 })
      }
      return NextResponse.json({
        success: true,
        candidates: result.candidates,
        warnings: [...warnings, ...(result.warnings || [])],
        source: 'claude-vision',
      })
    }

    return NextResponse.json({ success: true, candidates: [], warnings, source: 'none' })
  } catch (error) {
    console.error('Error in image-mask-candidates API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
