import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/classes/[id]/members - Add member to class
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: classId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify teacher owns the class
    const { data: classData } = await supabase
      .from('classes')
      .select('id')
      .eq('id', classId)
      .eq('teacher_id', user.id)
      .single()

    if (!classData) {
      return NextResponse.json({ error: 'Class not found or access denied' }, { status: 404 })
    }

    const body = await request.json()
    const { userId, email } = body

    // Either userId or email must be provided
    let targetUserId = userId

    if (!targetUserId && email) {
      // Find user by email (case-insensitive)
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id, role')
        .ilike('email', email.trim())
        .single()

      if (!targetProfile) {
        return NextResponse.json({ error: 'User not found with this email' }, { status: 404 })
      }

      if (targetProfile.role !== 'student') {
        return NextResponse.json({ error: 'Only students can be added to classes' }, { status: 400 })
      }

      targetUserId = targetProfile.id
    }

    if (!targetUserId) {
      return NextResponse.json({ error: 'User ID or email is required' }, { status: 400 })
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('class_members')
      .select('user_id')
      .eq('class_id', classId)
      .eq('user_id', targetUserId)
      .single()

    if (existingMember) {
      return NextResponse.json({ error: 'User is already a member of this class' }, { status: 400 })
    }

    // Add member
    const { error: insertError } = await supabase
      .from('class_members')
      .insert({
        class_id: classId,
        user_id: targetUserId,
      })

    if (insertError) {
      console.error('Error adding member:', insertError)
      return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
    }

    // Get the added member's profile
    const { data: memberProfile } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', targetUserId)
      .single()

    return NextResponse.json({
      success: true,
      member: {
        id: memberProfile?.id,
        name: memberProfile?.name || 'Unknown',
        email: memberProfile?.email || '',
      },
    })
  } catch (error) {
    console.error('Error adding member:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/classes/[id]/members - Remove member from class
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: classId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify teacher owns the class
    const { data: classData } = await supabase
      .from('classes')
      .select('id')
      .eq('id', classId)
      .eq('teacher_id', user.id)
      .single()

    if (!classData) {
      return NextResponse.json({ error: 'Class not found or access denied' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('class_members')
      .delete()
      .eq('class_id', classId)
      .eq('user_id', userId)

    if (error) {
      console.error('Error removing member:', error)
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing member:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
