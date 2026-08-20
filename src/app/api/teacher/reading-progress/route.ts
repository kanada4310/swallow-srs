/**
 * 講師向け: 読解の取組状況 API。
 *
 * GET /api/teacher/reading-progress
 *   担当生徒 × 講の一覧を返す。「どこまで進んだか」と「ヒントを何段使ったか」は
 *   保存されている作業そのもの（reading_progress.state）から集計する。
 *
 * 認証: 講師セッション（requireTeacher）。読むのは RLS 経由（024 のポリシーで
 * 担当生徒ぶんだけが見える）ので、service role は使わない。
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeacher } from '@/lib/api/auth'
import { summarizeProgress, type ProgressSummary } from '@/lib/reading/progress'
import type { ReadingProgressState } from '@/lib/reading/types'

interface StudentRow {
  userId: string
  name: string
  lessons: Array<{ lessonId: string; summary: ProgressSummary }>
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    // 誰の行が見えるかは RLS（024 のポリシー = is_student_of_teacher）に任せる。
    // ここで別途クラスを引いて絞ると、判定の基準が2つに分かれてズレるため。
    const { data: rows, error } = await supabase
      .from('reading_progress')
      .select('user_id, lesson_id, state, updated_at')
      .order('updated_at', { ascending: false })

    if (error) {
      const missing =
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        /reading_progress/i.test(error.message || '')
      if (missing) {
        return NextResponse.json({ students: [], tableMissing: true })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const visible = rows ?? []
    const userIds = Array.from(new Set(visible.map((r) => r.user_id as string)))

    const nameById = new Map<string, string>()
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds)
      ;(profiles ?? []).forEach((p) => nameById.set(p.id as string, (p.name as string) || '名前未設定'))
    }

    const byStudent = new Map<string, StudentRow>()
    visible.forEach((r) => {
      const userId = r.user_id as string
      if (!byStudent.has(userId)) {
        byStudent.set(userId, { userId, name: nameById.get(userId) || '名前未設定', lessons: [] })
      }
      const state = r.state as ReadingProgressState
      if (!state || state.version !== 1) return
      byStudent.get(userId)!.lessons.push({
        lessonId: r.lesson_id as string,
        summary: summarizeProgress(state),
      })
    })

    const students = Array.from(byStudent.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'))

    return NextResponse.json({ students, tableMissing: false })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '取得に失敗しました' },
      { status: 500 }
    )
  }
}
