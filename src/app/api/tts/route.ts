import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import type { TTSVoice } from '@/types/database'

// Lazy initialization of OpenAI client
let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiClient
}

// Strip HTML tags from text
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// Process cloze deletions - reveal the answer for TTS
function processClozeForTTS(text: string): string {
  // {{c1::answer}} -> answer
  // {{c1::answer::hint}} -> answer
  return text.replace(/\{\{c\d+::([^:}]+)(?:::[^}]+)?\}\}/g, '$1')
}

export async function POST(request: NextRequest) {
  try {
    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { noteId, fieldName, text, voice = 'alloy', speed = 1.0 } = body

    // Validate required fields
    if (!noteId || !fieldName || !text) {
      return NextResponse.json(
        { error: 'Missing required fields: noteId, fieldName, text' },
        { status: 400 }
      )
    }

    // Validate voice
    const validVoices: TTSVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
    if (!validVoices.includes(voice)) {
      return NextResponse.json(
        { error: 'Invalid voice. Must be one of: alloy, echo, fable, onyx, nova, shimmer' },
        { status: 400 }
      )
    }

    // Validate speed
    if (speed < 0.25 || speed > 4.0) {
      return NextResponse.json(
        { error: 'Speed must be between 0.25 and 4.0' },
        { status: 400 }
      )
    }

    // Get note and verify access, including note type for field settings
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select(`
        id,
        deck_id,
        audio_urls,
        note_type:note_types (
          fields
        )
      `)
      .eq('id', noteId)
      .single()

    if (noteError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    // Check if field has TTS enabled in note type settings
    // If note type has field settings, validate that TTS is enabled for this field
    const noteType = note.note_type as unknown as { fields: Array<{ name: string; settings?: { tts_enabled?: boolean } }> } | null
    if (noteType?.fields) {
      const fieldDef = noteType.fields.find(f => f.name === fieldName)
      // Only block if field is explicitly defined and tts_enabled is explicitly false
      // Allow if field is not found or if settings are not defined (backward compatibility)
      if (fieldDef && fieldDef.settings && fieldDef.settings.tts_enabled === false) {
        return NextResponse.json(
          { error: 'TTS is not enabled for this field' },
          { status: 400 }
        )
      }
    }

    // Check if audio already exists for this field
    const existingAudioUrls = note.audio_urls as Record<string, string> | null
    if (existingAudioUrls && existingAudioUrls[fieldName]) {
      return NextResponse.json({
        success: true,
        audioUrl: existingAudioUrls[fieldName],
        cached: true,
      })
    }

    // Verify deck access (user owns it or it's assigned to them)
    const { data: deck } = await supabase
      .from('decks')
      .select('id, owner_id')
      .eq('id', note.deck_id)
      .single()

    if (!deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    // Check access - owner or assigned
    let hasAccess = deck.owner_id === user.id

    if (!hasAccess) {
      // Check deck assignments
      const { data: assignment } = await supabase
        .from('deck_assignments')
        .select('id')
        .eq('deck_id', deck.id)
        .or(`user_id.eq.${user.id}`)
        .limit(1)
        .single()

      if (assignment) {
        hasAccess = true
      } else {
        // Check class-based assignment
        const { data: classMembership } = await supabase
          .from('class_members')
          .select('class_id')
          .eq('user_id', user.id)

        if (classMembership && classMembership.length > 0) {
          const classIds = classMembership.map(cm => cm.class_id)
          const { data: classAssignment } = await supabase
            .from('deck_assignments')
            .select('id')
            .eq('deck_id', deck.id)
            .in('class_id', classIds)
            .limit(1)
            .single()

          if (classAssignment) {
            hasAccess = true
          }
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Process text for TTS
    let processedText = text
    processedText = processClozeForTTS(processedText)
    processedText = stripHtml(processedText)

    if (!processedText) {
      return NextResponse.json(
        { error: 'No text content to convert to speech' },
        { status: 400 }
      )
    }

    // Limit text length to prevent excessive API costs
    if (processedText.length > 5000) {
      processedText = processedText.substring(0, 5000)
    }

    // Generate audio using OpenAI TTS
    const openai = getOpenAI()
    const mp3Response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice,
      input: processedText,
      speed: speed,
    })

    // Get audio as buffer
    const audioBuffer = Buffer.from(await mp3Response.arrayBuffer())

    // Generate unique filename
    const timestamp = Date.now()
    const fileName = `${noteId}/${fieldName}_${timestamp}.mp3`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '31536000', // 1 year cache
      })

    if (uploadError) {
      console.error('Error uploading audio:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload audio file' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('audio')
      .getPublicUrl(fileName)

    const audioUrl = publicUrlData.publicUrl

    // Update note with audio URL
    const updatedAudioUrls = {
      ...(existingAudioUrls || {}),
      [fieldName]: audioUrl,
    }

    const { error: updateError } = await supabase
      .from('notes')
      .update({ audio_urls: updatedAudioUrls })
      .eq('id', noteId)

    if (updateError) {
      console.error('Error updating note:', updateError)
      // Audio was uploaded but note update failed - still return success
    }

    return NextResponse.json({
      success: true,
      audioUrl,
      cached: false,
    })
  } catch (error) {
    console.error('Error in TTS API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
