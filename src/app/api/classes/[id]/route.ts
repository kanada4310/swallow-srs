import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/classes/[id] - Get class details with members
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    // Get class with members
    const { data: classData, error } = await supabase
      .from('classes')
      .select(`
        id,
        name,
        teacher_id,
        created_at,
        updated_at,
        class_members (
          user_id,
          joined_at,
          profiles:user_id (
            id,
            name,
            email
          )
        )
      `)
      .eq('id', id)
      .eq('teacher_id', user.id)
      .single()

    if (error || !classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    // Transform members data - profiles is a single object from the join
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const members = classData.class_members?.map((m: any) => ({
      id: m.user_id,
      name: m.profiles?.name || 'Unknown',
      email: m.profiles?.email || '',
      joinedAt: m.joined_at,
    })) || []

    return NextResponse.json({
      class: {
        id: classData.id,
        name: classData.name,
        createdAt: classData.created_at,
        updatedAt: classData.updated_at,
      },
      members,
    })
  } catch (error) {
    console.error('Error fetching class:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/classes/[id] - Update class name
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Class name is required' }, { status: 400 })
    }

    const { data: updatedClass, error } = await supabase
      .from('classes')
      .update({ name: name.trim() })
      .eq('id', id)
      .eq('teacher_id', user.id)
      .select()
      .single()

    if (error || !updatedClass) {
      return NextResponse.json({ error: 'Failed to update class' }, { status: 500 })
    }

    return NextResponse.json({ success: true, class: updatedClass })
  } catch (error) {
    console.error('Error updating class:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/classes/[id] - Delete class
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const { error } = await supabase
      .from('classes')
      .delete()
      .eq('id', id)
      .eq('teacher_id', user.id)

    if (error) {
      console.error('Error deleting class:', error)
      return NextResponse.json({ error: 'Failed to delete class' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting class:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
