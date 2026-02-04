import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeacher } from '@/lib/api/auth'

// GET /api/students - List all students (for teachers only)
export async function GET() {
  try {
    const supabase = await createClient()
    const { error: authError } = await requireTeacher(supabase)
    if (authError) return authError

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
