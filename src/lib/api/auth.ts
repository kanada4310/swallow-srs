import { NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'

type ErrorResponse = NextResponse<{ error: string }>

type AuthResult =
  | { user: { id: string; email?: string }; error: null }
  | { user: null; error: ErrorResponse }

type TeacherAuthResult =
  | { user: { id: string; email?: string }; profile: { role: string }; error: null }
  | { user: null; profile: null; error: ErrorResponse }

export async function requireAuth(supabase: SupabaseClient): Promise<AuthResult> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { user, error: null }
}

export async function requireTeacher(supabase: SupabaseClient): Promise<TeacherAuthResult> {
  const authResult = await requireAuth(supabase)
  if (authResult.error) {
    return { user: null, profile: null, error: authResult.error }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authResult.user.id)
    .single()

  if (!profile || profile.role === 'student') {
    return { user: null, profile: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user: authResult.user, profile, error: null }
}

/**
 * デッキを「管理（編集・削除・ノート追加など）」できるかを判定する。
 *
 * - 自分が所有するデッキ → 常に可
 * - 講師同士の共同編集: 自分が teacher/admin かつ デッキ所有者も teacher/admin なら可
 *   （講師が作ったデッキは講師間で自動共有・共同編集できる）
 *
 * RLS（021_teacher_shared_decks.sql）と整合。生徒は他人のデッキを管理できない。
 */
export async function canManageDeck(
  supabase: SupabaseClient,
  userId: string,
  deckOwnerId: string,
): Promise<boolean> {
  if (deckOwnerId === userId) return true

  // 講師は全プロフィールを読める（003_allow_teachers_read_profiles）。
  // 生徒は自分のプロフィールしか読めないため、owner 行が取れず false になる（=ブロック）。
  const { data: rows } = await supabase
    .from('profiles')
    .select('id, role')
    .in('id', [userId, deckOwnerId])

  if (!rows) return false
  const isTeacher = (id: string) => {
    const r = rows.find((x) => x.id === id)
    return !!r && (r.role === 'teacher' || r.role === 'admin')
  }
  return isTeacher(userId) && isTeacher(deckOwnerId)
}
