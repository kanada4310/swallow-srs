import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/classes - List classes owned by the teacher
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
      return NextResponse.json({ error: 'Only teachers can access classes' }, { status: 403 })
    }

    // Get classes with member count
    const { data: classes, error } = await supabase
      .from('classes')
      .select(`
        id,
        name,
        created_at,
        updated_at,
        class_members (user_id)
      `)
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching classes:', error)
      return NextResponse.json({ error: 'Failed to fetch classes' }, { status: 500 })
    }

    // Transform to include member count
    const classesWithCount = classes?.map(c => ({
      id: c.id,
      name: c.name,
      created_at: c.created_at,
      updated_at: c.updated_at,
      memberCount: c.class_members?.length || 0,
    })) || []

    return NextResponse.json({ classes: classesWithCount })
  } catch (error) {
    console.error('Error in classes API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/classes - Create a new class
export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: 'Only teachers can create classes' }, { status: 403 })
    }

    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Class name is required' }, { status: 400 })
    }

    const { data: newClass, error: createError } = await supabase
      .from('classes')
      .insert({
        name: name.trim(),
        teacher_id: user.id,
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating class:', createError)
      return NextResponse.json({ error: 'Failed to create class' }, { status: 500 })
    }

    return NextResponse.json({ success: true, class: newClass })
  } catch (error) {
    console.error('Error in class creation API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
