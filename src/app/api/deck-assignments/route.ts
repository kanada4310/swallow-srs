import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'

// GET /api/deck-assignments?deckId=xxx - Get assignments for a deck
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const deckId = searchParams.get('deckId')

    if (!deckId) {
      return NextResponse.json({ error: 'Deck ID is required' }, { status: 400 })
    }

    // Verify user owns the deck
    const { data: deck } = await supabase
      .from('decks')
      .select('id, owner_id')
      .eq('id', deckId)
      .single()

    if (!deck || deck.owner_id !== user.id) {
      return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 })
    }

    // Get assignments with class and user details
    const { data: assignments, error } = await supabase
      .from('deck_assignments')
      .select(`
        id,
        deck_id,
        class_id,
        user_id,
        assigned_at,
        classes:class_id (
          id,
          name
        ),
        profiles:user_id (
          id,
          name,
          email
        )
      `)
      .eq('deck_id', deckId)

    if (error) {
      console.error('Error fetching assignments:', error)
      return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 })
    }

    // Transform data - Supabase joins return single objects, but TS infers arrays
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformedAssignments = assignments?.map((a: any) => ({
      id: a.id,
      deckId: a.deck_id,
      assignedAt: a.assigned_at,
      type: a.class_id ? 'class' : 'individual',
      target: a.class_id
        ? { id: a.classes?.id, name: a.classes?.name }
        : { id: a.profiles?.id, name: a.profiles?.name, email: a.profiles?.email },
    })) || []

    return NextResponse.json({ assignments: transformedAssignments })
  } catch (error) {
    console.error('Error in deck-assignments API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/deck-assignments - Create a new assignment
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { deckId, classId, userId } = body

    if (!deckId) {
      return NextResponse.json({ error: 'Deck ID is required' }, { status: 400 })
    }

    if (!classId && !userId) {
      return NextResponse.json({ error: 'Either classId or userId is required' }, { status: 400 })
    }

    if (classId && userId) {
      return NextResponse.json({ error: 'Cannot specify both classId and userId' }, { status: 400 })
    }

    // Verify user owns the deck
    const { data: deck } = await supabase
      .from('decks')
      .select('id, owner_id')
      .eq('id', deckId)
      .single()

    if (!deck || deck.owner_id !== user.id) {
      return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 })
    }

    // Check if assignment already exists
    const existingQuery = supabase
      .from('deck_assignments')
      .select('id')
      .eq('deck_id', deckId)

    if (classId) {
      existingQuery.eq('class_id', classId)
    } else {
      existingQuery.eq('user_id', userId)
    }

    const { data: existing } = await existingQuery.single()

    if (existing) {
      return NextResponse.json({ error: 'Assignment already exists' }, { status: 400 })
    }

    // Create assignment
    const insertData: { deck_id: string; class_id?: string; user_id?: string } = {
      deck_id: deckId,
    }

    if (classId) {
      insertData.class_id = classId
    } else {
      insertData.user_id = userId
    }

    const { data: assignment, error: insertError } = await supabase
      .from('deck_assignments')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      console.error('Error creating assignment:', insertError)
      return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
    }

    // Update deck's is_distributed flag
    await supabase
      .from('decks')
      .update({ is_distributed: true })
      .eq('id', deckId)

    return NextResponse.json({ success: true, assignment })
  } catch (error) {
    console.error('Error in deck-assignments API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/deck-assignments?id=xxx - Delete an assignment
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const assignmentId = searchParams.get('id')

    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 })
    }

    // Get assignment to verify ownership
    const { data: assignment } = await supabase
      .from('deck_assignments')
      .select('id, deck_id')
      .eq('id', assignmentId)
      .single()

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    // Verify user owns the deck
    const { data: deck } = await supabase
      .from('decks')
      .select('id, owner_id')
      .eq('id', assignment.deck_id)
      .single()

    if (!deck || deck.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Delete assignment
    const { error } = await supabase
      .from('deck_assignments')
      .delete()
      .eq('id', assignmentId)

    if (error) {
      console.error('Error deleting assignment:', error)
      return NextResponse.json({ error: 'Failed to delete assignment' }, { status: 500 })
    }

    // Check if there are any remaining assignments
    const { count } = await supabase
      .from('deck_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('deck_id', assignment.deck_id)

    // If no more assignments, update is_distributed flag
    if (count === 0) {
      await supabase
        .from('decks')
        .update({ is_distributed: false })
        .eq('id', assignment.deck_id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in deck-assignments API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
