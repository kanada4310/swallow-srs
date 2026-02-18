import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'

export async function GET() {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const { data: settings, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching notification settings:', error)
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      settings: settings || {
        user_id: user.id,
        enabled: true,
        reminder_hour: 7,
      },
    })
  } catch (error) {
    console.error('Error in push settings GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { enabled, reminder_hour } = body

    const updateData: Record<string, unknown> = {}

    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') {
        return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
      }
      updateData.enabled = enabled
    }

    if (reminder_hour !== undefined) {
      if (typeof reminder_hour !== 'number' || reminder_hour < 0 || reminder_hour > 23 || !Number.isInteger(reminder_hour)) {
        return NextResponse.json({ error: 'reminder_hour must be an integer between 0 and 23' }, { status: 400 })
      }
      updateData.reminder_hour = reminder_hour
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: settings, error } = await supabase
      .from('notification_settings')
      .upsert(
        { user_id: user.id, ...updateData },
        { onConflict: 'user_id' }
      )
      .select()
      .single()

    if (error) {
      console.error('Error updating notification settings:', error)
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }

    return NextResponse.json({ success: true, settings })
  } catch (error) {
    console.error('Error in push settings PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
