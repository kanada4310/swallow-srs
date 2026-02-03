import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { TTSVoice } from '@/types/database'

const VALID_VOICES: TTSVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']

export async function GET() {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user TTS settings
    const { data: settings, error } = await supabase
      .from('user_tts_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (which is fine, we'll return defaults)
      console.error('Error fetching TTS settings:', error)
      return NextResponse.json(
        { error: 'Failed to fetch TTS settings' },
        { status: 500 }
      )
    }

    // Return settings or defaults
    return NextResponse.json({
      success: true,
      settings: settings || {
        user_id: user.id,
        enabled_fields: ['Front'],
        voice: 'alloy',
        speed: 1.0,
      },
    })
  } catch (error) {
    console.error('Error in TTS settings GET:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { enabled_fields, voice, speed } = body

    // Validate enabled_fields
    if (enabled_fields !== undefined) {
      if (!Array.isArray(enabled_fields)) {
        return NextResponse.json(
          { error: 'enabled_fields must be an array' },
          { status: 400 }
        )
      }
      if (enabled_fields.some(f => typeof f !== 'string')) {
        return NextResponse.json(
          { error: 'enabled_fields must contain only strings' },
          { status: 400 }
        )
      }
    }

    // Validate voice
    if (voice !== undefined && !VALID_VOICES.includes(voice)) {
      return NextResponse.json(
        { error: `Invalid voice. Must be one of: ${VALID_VOICES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate speed
    if (speed !== undefined && (typeof speed !== 'number' || speed < 0.25 || speed > 4.0)) {
      return NextResponse.json(
        { error: 'Speed must be a number between 0.25 and 4.0' },
        { status: 400 }
      )
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {}
    if (enabled_fields !== undefined) updateData.enabled_fields = enabled_fields
    if (voice !== undefined) updateData.voice = voice
    if (speed !== undefined) updateData.speed = speed

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // Upsert settings
    const { data: settings, error } = await supabase
      .from('user_tts_settings')
      .upsert({
        user_id: user.id,
        ...updateData,
      }, {
        onConflict: 'user_id',
      })
      .select()
      .single()

    if (error) {
      console.error('Error updating TTS settings:', error)
      return NextResponse.json(
        { error: 'Failed to update TTS settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      settings,
    })
  } catch (error) {
    console.error('Error in TTS settings PUT:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
