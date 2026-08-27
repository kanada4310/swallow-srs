/**
 * 教材データ（共有事項 C22）の入口。**ログインした人だけが読める。**
 *
 * GET /api/reading/material/index.json          … 講の一覧
 * GET /api/reading/material/<教材>_<講>_seg.json … その講の中身
 *
 * 教材の本文は市販教材のものなので、誰でも取りに行ける場所には置かない。
 * 実物は `private/reading-data/`（配信されない場所）にあり、ここでだけ配る。
 * 役割による出し分けはしない（在籍していれば読める）。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import { MaterialNotFoundError, readMaterialFile } from '@/lib/reading/material-store'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: { file: string } }
) {
  const supabase = await createClient()
  const { error } = await requireAuth(supabase)
  if (error) return error

  let body: string
  try {
    body = readMaterialFile(decodeURIComponent(params.file))
  } catch (e) {
    if (e instanceof MaterialNotFoundError) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }
    throw e
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // 端末や中継に残さない（ログインした人にだけ渡すため）
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
