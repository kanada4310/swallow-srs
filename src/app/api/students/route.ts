import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/students - List all students (for teachers only)
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is teacher or admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role === 'student') {
      return NextResponse.json({ error: 'Only teachers can access student list' }, { status: 403 })
    }

    // Get all students
    const { data: students, error } = await supabase
      .from('profiles')
      .select('id, name, email, created_at')
      .eq('role', 'student')
      .order('name')

    if (error) {
      console.error('Error fetching students:', error)
      return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
    }

    return NextResponse.json({ students: students || [] })
  } catch (error) {
    console.error('Error in students API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
