/**
 * ペン入力の実書き蓄積の読み書き（2026-09-01・文字認識検討会の確定内容 v1）。
 *
 * GET  /api/pen-samples … 本人の蓄積＋塾の共通お手本集を返す（練習を開くときに読み込む）
 * POST /api/pen-samples … 確定して訂正されなかった線をためる（採点したときにまとめて送る）
 * DELETE /api/pen-samples?symbol=X … 本人の蓄積からその記号を消す（お手本の登録し直し用）
 *
 * - 判定そのものは端末内・書いた瞬間（通信はこの読み書きだけ）
 * - 共通お手本集は**名前を付けない形**: user_id を持たない表に、サーバー（service role）
 *   だけが書く。線の座標と記号名以外は保存しない
 * - 上限と間引き（1記号あたり本人16件・共通24件・似た線は足さない）は sample-store.ts の
 *   純ロジックで行う
 * - マイグレーション 027 が未適用でも壊れない: 読みは空を返し、書きは黙って見送る
 *   （端末内のお手本だけで従来どおり動く）
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/api/auth'
import {
  isAccumulatable,
  isSampleSource,
  PERSONAL_CAP,
  planAddition,
  rowsToStore,
  sanitizeSampleStrokes,
  SHARED_CAP,
} from '@/lib/pen-syntax/sample-store'

export const dynamic = 'force-dynamic'

/** 1回の送信で受け付ける線の上限（1文ぶんの書き込みで足りる数） */
const MAX_SAMPLES_PER_POST = 60

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createSupabaseClient(url, key, { auth: { persistSession: false } })
}

export async function GET() {
  const supabase = await createClient()
  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError

  const [personalRes, sharedRes] = await Promise.all([
    supabase
      .from('pen_stroke_samples')
      .select('symbol, strokes')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    supabase.from('pen_shared_samples').select('symbol, strokes').order('created_at', { ascending: true }),
  ])

  // 表がまだ無い（027未適用）等は空で返す＝端末内のお手本だけで動く
  const personal = personalRes.error ? {} : rowsToStore(personalRes.data ?? [])
  const shared = sharedRes.error ? {} : rowsToStore(sharedRes.data ?? [])
  return NextResponse.json(
    { personal, shared, available: !personalRes.error && !sharedRes.error },
    { headers: { 'cache-control': 'private, no-store' } },
  )
}

interface PostBody {
  samples?: Array<{ symbol?: unknown; strokes?: unknown; source?: unknown }>
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError

  let body: PostBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const incoming = Array.isArray(body.samples) ? body.samples.slice(0, MAX_SAMPLES_PER_POST) : []
  const valid = incoming.flatMap((s) => {
    if (typeof s.symbol !== 'string' || !isAccumulatable(s.symbol)) return []
    if (!isSampleSource(s.source)) return []
    const strokes = sanitizeSampleStrokes(s.strokes)
    if (!strokes) return []
    return [{ symbol: s.symbol, strokes, source: s.source }]
  })
  if (valid.length === 0) return NextResponse.json({ saved: 0, shared: 0 })

  const admin = adminClient()
  let savedPersonal = 0
  let savedShared = 0
  let available = true

  // 記号ごとに「既存を読む→間引きを決める→消して足す」。件数は少ない（1採点で数十まで）
  const bySymbol = new Map<string, typeof valid>()
  for (const s of valid) {
    bySymbol.set(s.symbol, [...(bySymbol.get(s.symbol) ?? []), s])
  }

  for (const symbol of Array.from(bySymbol.keys())) {
    const group = bySymbol.get(symbol)!

    // 本人の蓄積（RLSで自分の行だけ）
    const existingRes = await supabase
      .from('pen_stroke_samples')
      .select('id, strokes')
      .eq('user_id', user.id)
      .eq('symbol', symbol)
      .order('created_at', { ascending: true })
    if (existingRes.error) {
      // 表が無い（027未適用）: 蓄積は見送る（端末内のお手本だけで動く）
      available = false
      break
    }
    const rows = existingRes.data ?? []
    let strokesList = rows.map((r) => sanitizeSampleStrokes(r.strokes) ?? [])
    let ids = rows.map((r) => r.id as string)
    for (const s of group) {
      const plan = planAddition(strokesList, s.strokes, PERSONAL_CAP)
      if (plan.action === 'skip') continue
      if (plan.removeOldest > 0) {
        const removeIds = ids.slice(0, plan.removeOldest).filter((id) => id !== '')
        if (removeIds.length > 0) {
          await supabase.from('pen_stroke_samples').delete().in('id', removeIds)
        }
        ids = ids.slice(plan.removeOldest)
        strokesList = strokesList.slice(plan.removeOldest)
      }
      const ins = await supabase
        .from('pen_stroke_samples')
        .insert({ user_id: user.id, symbol, strokes: s.strokes, source: s.source })
      if (!ins.error) {
        savedPersonal++
        strokesList = [...strokesList, s.strokes]
        ids = [...ids, ''] // 以後の間引き計算用の埋め草（この行が消される順になることはない）
      }
    }

    // 塾の共通お手本集（名前を付けない形・service role でだけ書く）
    if (admin) {
      const sharedRes = await admin
        .from('pen_shared_samples')
        .select('id, strokes')
        .eq('symbol', symbol)
        .order('created_at', { ascending: true })
      if (!sharedRes.error) {
        const sRows = sharedRes.data ?? []
        let sList = sRows.map((r) => sanitizeSampleStrokes(r.strokes) ?? [])
        let sIds = sRows.map((r) => r.id as string)
        for (const s of group) {
          const plan = planAddition(sList, s.strokes, SHARED_CAP)
          if (plan.action === 'skip') continue
          if (plan.removeOldest > 0) {
            const removeIds = sIds.slice(0, plan.removeOldest).filter((id) => id !== '')
            if (removeIds.length > 0) {
              await admin.from('pen_shared_samples').delete().in('id', removeIds)
            }
            sIds = sIds.slice(plan.removeOldest)
            sList = sList.slice(plan.removeOldest)
          }
          const ins = await admin
            .from('pen_shared_samples')
            .insert({ symbol, strokes: s.strokes, source: s.source })
          if (!ins.error) {
            savedShared++
            sList = [...sList, s.strokes]
            sIds = [...sIds, '']
          }
        }
      }
    }
  }

  return NextResponse.json({ saved: savedPersonal, shared: savedShared, available })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError

  const symbol = request.nextUrl.searchParams.get('symbol')
  if (!symbol || !isAccumulatable(symbol)) {
    return NextResponse.json({ error: 'symbol が不正です' }, { status: 400 })
  }
  // 消せるのは本人の蓄積だけ（共通お手本集は名前が付いていないので個人からは消せない）
  const res = await supabase
    .from('pen_stroke_samples')
    .delete()
    .eq('user_id', user.id)
    .eq('symbol', symbol)
  return NextResponse.json({ ok: !res.error })
}
