/**
 * 講師用の正解表（模範分析集・共有事項 C24）の入口。**講師・管理者だけが読める。**
 *
 * GET /api/reading/syntax-problems … 置き場にある正解表をまとめて返す
 *
 * この正解表は記号の一部が落ちており許容解も無いため、生徒には出さない。
 * 実物は `private/syntax-problems/`（配信されない場所）にあり、ここでだけ配る。
 * **役割は画面から送られてきた値ではなく、profiles の記録をサーバー側で見て確かめる**
 * （requireTeacher）。教材本文の入口（/api/reading/material）はログインまでしか
 * 見ていないので、そこと同じでは足りない。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeacher } from '@/lib/api/auth'
import { readSyntaxProblemSets } from '@/lib/reading/syntax-problem-store'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const { error } = await requireTeacher(supabase)
  if (error) return error

  let sets
  try {
    sets = readSyntaxProblemSets()
  } catch {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  return NextResponse.json(
    { contract: 'C24', sets },
    {
      status: 200,
      headers: {
        // 端末や中継に残さない（講師にだけ渡すため）
        'cache-control': 'private, no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    }
  )
}
