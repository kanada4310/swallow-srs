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
