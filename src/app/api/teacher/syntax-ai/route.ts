/**
 * 構文AI試行の講師向け管理API。
 *
 * GET  /api/teacher/syntax-ai … 設定＋今月の使用額・回数・生徒別内訳＋実測（1文あたり往復数）
 * PUT  /api/teacher/syntax-ai … 設定の変更（許可生徒は最大3人・上限は3,000円まで）
 *
 * 設定・記録の書き込みはサーバ（service role）のみ。講師の本人確認は requireTeacher で行う。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeacher } from '@/lib/api/auth'
import { createAdminClient, loadConfig } from '@/lib/syntax-ai/server'
import { jstMonthStartIso, MAX_ALLOWED_STUDENTS } from '@/lib/syntax-ai/gate'
import { MODEL_PRICES } from '@/lib/syntax-ai/pricing'

const MAX_CAP_YEN = 3000

interface UsageRow {
  user_id: string
  kind: string
  lesson_id: string | null
  sentence_key: string | null
  input_tokens: number
  output_tokens: number
  cache_write_tokens: number
  cache_read_tokens: number
  cost_yen: number
  created_at: string
}

export async function GET() {
  const supabase = await createClient()
  const { error: authError } = await requireTeacher(supabase)
  if (authError) return authError

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'サーバの設定が不足しています' }, { status: 503 })
  }

  const config = await loadConfig(admin)
  if (!config) {
    return NextResponse.json(
      { error: '設定の置き場所がまだ用意されていません（マイグレーション025が未適用）', code: 'TABLE_MISSING' },
      { status: 503 }
    )
  }

  // 使用記録（試行の規模なら全件でも小さい）
  const { data: usageData } = await admin
    .from('syntax_ai_usage')
    .select(
      'user_id, kind, lesson_id, sentence_key, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_yen, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(5000)
  const usage = (usageData ?? []) as UsageRow[]

  const monthStart = jstMonthStartIso(new Date())
  const monthRows = usage.filter((r) => r.created_at >= monthStart)

  const sum = (rows: UsageRow[]) => rows.reduce((s, r) => s + Number(r.cost_yen || 0), 0)

  // 生徒別（今月）
  const byUser = new Map<string, UsageRow[]>()
  for (const r of monthRows) {
    const arr = byUser.get(r.user_id) ?? []
    arr.push(r)
    byUser.set(r.user_id, arr)
  }

  // 名前の解決（許可一覧＋使用実績のある生徒）
  const idSet = new Set<string>([...config.allowedUserIds, ...Array.from(byUser.keys())])
  const { data: profilesData } = idSet.size
    ? await admin.from('profiles').select('id, name, role').in('id', Array.from(idSet))
    : { data: [] }
  const nameOf = new Map((profilesData ?? []).map((p) => [p.id as string, p.name as string]))

  const students = Array.from(idSet).map((id) => {
    const rows = byUser.get(id) ?? []
    const judged = rows.filter((r) => r.kind === 'judge')
    const dialogues = rows.filter((r) => r.kind === 'dialogue')
    // 1文あたりの往復数の実測: 文（lesson+sentence）ごとの判定回数と問答回数
    const sentences = new Set(rows.map((r) => `${r.lesson_id}|${r.sentence_key}`))
    return {
      userId: id,
      name: nameOf.get(id) ?? '(不明)',
      allowed: config.allowedUserIds.includes(id),
      judgeCount: judged.length,
      dialogueCount: dialogues.length,
      sentenceCount: sentences.size,
      costYen: Math.round(sum(rows) * 100) / 100,
    }
  })
  students.sort((a, b) => b.costYen - a.costYen)

  // 生徒選択用の一覧（在籍生徒）
  const { data: allStudents } = await admin
    .from('profiles')
    .select('id, name')
    .eq('role', 'student')
    .order('name')

  return NextResponse.json({
    config,
    maxAllowedStudents: MAX_ALLOWED_STUDENTS,
    maxCapYen: MAX_CAP_YEN,
    month: {
      spentYen: Math.round(sum(monthRows) * 100) / 100,
      judgeCount: monthRows.filter((r) => r.kind === 'judge').length,
      dialogueCount: monthRows.filter((r) => r.kind === 'dialogue').length,
      tokens: monthRows.reduce(
        (acc, r) => ({
          input: acc.input + r.input_tokens,
          output: acc.output + r.output_tokens,
          cacheWrite: acc.cacheWrite + r.cache_write_tokens,
          cacheRead: acc.cacheRead + r.cache_read_tokens,
        }),
        { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
      ),
    },
    totalSpentYen: Math.round(sum(usage) * 100) / 100,
    students,
    studentOptions: (allStudents ?? []).map((s) => ({ id: s.id as string, name: s.name as string })),
  })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { error: authError } = await requireTeacher(supabase)
  if (authError) return authError

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'サーバの設定が不足しています' }, { status: 503 })
  }

  let body: {
    enabled?: unknown
    allowedUserIds?: unknown
    startsAt?: unknown
    endsAt?: unknown
    monthlyCapYen?: unknown
    model?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled

  if (body.allowedUserIds !== undefined) {
    if (
      !Array.isArray(body.allowedUserIds) ||
      body.allowedUserIds.some((v) => typeof v !== 'string')
    ) {
      return NextResponse.json({ error: '許可生徒の形が正しくありません' }, { status: 400 })
    }
    const ids = Array.from(new Set(body.allowedUserIds as string[]))
    if (ids.length > MAX_ALLOWED_STUDENTS) {
      return NextResponse.json(
        { error: `許可できる生徒は最大${MAX_ALLOWED_STUDENTS}人です（試行の枠）` },
        { status: 400 }
      )
    }
    patch.allowed_user_ids = ids
  }

  for (const key of ['startsAt', 'endsAt'] as const) {
    const v = body[key]
    if (v === undefined) continue
    if (v === null) {
      patch[key === 'startsAt' ? 'starts_at' : 'ends_at'] = null
    } else if (typeof v === 'string' && !Number.isNaN(new Date(v).getTime())) {
      patch[key === 'startsAt' ? 'starts_at' : 'ends_at'] = new Date(v).toISOString()
    } else {
      return NextResponse.json({ error: '日付の形が正しくありません' }, { status: 400 })
    }
  }

  if (body.monthlyCapYen !== undefined) {
    const cap = Number(body.monthlyCapYen)
    if (!Number.isFinite(cap) || cap <= 0 || cap > MAX_CAP_YEN) {
      return NextResponse.json(
        { error: `上限額は1〜${MAX_CAP_YEN}円の範囲で設定してください（試行の枠）` },
        { status: 400 }
      )
    }
    patch.monthly_cap_yen = cap
  }

  if (body.model !== undefined) {
    if (typeof body.model !== 'string' || !(body.model in MODEL_PRICES)) {
      return NextResponse.json({ error: '選べないモデルです' }, { status: 400 })
    }
    patch.model = body.model
  }

  const { error } = await admin.from('syntax_ai_config').update(patch).eq('id', 1)
  if (error) {
    return NextResponse.json({ error: '設定の保存に失敗しました' }, { status: 500 })
  }

  const config = await loadConfig(admin)
  return NextResponse.json({ ok: true, config })
}
