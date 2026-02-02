import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
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
      return NextResponse.json({ error: 'Only teachers can create decks' }, { status: 403 })
    }

    const body = await request.json()
    const { name, newCardsPerDay = 20 } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Deck name is required' }, { status: 400 })
    }

    if (typeof newCardsPerDay !== 'number' || newCardsPerDay < 1 || newCardsPerDay > 100) {
      return NextResponse.json({ error: 'Invalid newCardsPerDay value' }, { status: 400 })
    }

    // Create deck
    const { data: deck, error: createError } = await supabase
      .from('decks')
      .insert({
        name: name.trim(),
        owner_id: user.id,
        is_distributed: false,
        settings: { new_cards_per_day: newCardsPerDay },
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating deck:', createError)
      return NextResponse.json({ error: 'Failed to create deck' }, { status: 500 })
    }

    return NextResponse.json({ success: true, deck })
  } catch (error) {
    console.error('Error in deck creation API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's own decks
    const { data: decks, error } = await supabase
      .from('decks')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching decks:', error)
      return NextResponse.json({ error: 'Failed to fetch decks' }, { status: 500 })
    }

    return NextResponse.json({ decks })
  } catch (error) {
    console.error('Error in decks API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
