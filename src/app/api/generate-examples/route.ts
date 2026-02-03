import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import type { GeneratedContent } from '@/types/database'

// Lazy initialization of Anthropic client
let anthropicClient: Anthropic | null = null

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropicClient
}

// System prompt for example generation
const SYSTEM_PROMPT = `You are an English vocabulary assistant for Japanese learners.
Generate natural example sentences using common collocations.

Guidelines:
- Use intermediate-level English
- Include practical, memorable contexts
- Collocations should be frequently used combinations
- Return valid JSON only, no markdown or extra text`

// Build user prompt
function buildUserPrompt(word: string, meaning?: string, includeCollocations: boolean = true): string {
  let prompt = `Generate example sentences for: "${word}"`
  if (meaning) {
    prompt += `\nMeaning: "${meaning}"`
  }

  prompt += `

Return JSON ONLY (no markdown, no code blocks):
{
  "examples": ["sentence using collocation 1", "sentence using collocation 2"]`

  if (includeCollocations) {
    prompt += `,
  "collocations": ["collocation1", "collocation2", "collocation3"]`
  }

  prompt += `
}

Use common collocations in the example sentences. Generate 2 examples`

  if (includeCollocations) {
    prompt += ` and 3 collocations`
  }

  prompt += `.`

  return prompt
}

// Parse JSON response from Claude
function parseGeneratedContent(response: string): { examples: string[], collocations?: string[] } | null {
  try {
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    // Validate structure
    if (!parsed.examples || !Array.isArray(parsed.examples)) return null
    if (parsed.examples.length === 0) return null

    // Ensure examples are strings
    const examples = parsed.examples.filter((e: unknown) => typeof e === 'string')
    if (examples.length === 0) return null

    const result: { examples: string[], collocations?: string[] } = { examples }

    if (parsed.collocations && Array.isArray(parsed.collocations)) {
      result.collocations = parsed.collocations.filter((c: unknown) => typeof c === 'string')
    }

    return result
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check for Anthropic API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured' },
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
    const { noteId, word, meaning, includeCollocations = true, regenerate = false } = body

    // Validate required fields
    if (!noteId || !word) {
      return NextResponse.json(
        { error: 'Missing required fields: noteId, word' },
        { status: 400 }
      )
    }

    // Get note and verify access, including note type for field settings
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select(`
        id,
        deck_id,
        generated_content,
        field_values,
        note_type:note_types (
          fields
        )
      `)
      .eq('id', noteId)
      .single()

    if (noteError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    // Determine word and meaning from field settings or fallback to provided values
    let effectiveWord = word
    let effectiveMeaning = meaning

    const noteType = note.note_type as unknown as { fields: Array<{ name: string; settings?: { example_source?: boolean; example_context?: boolean } }> } | null
    const fieldValues = note.field_values as Record<string, string> | null

    if (noteType?.fields && fieldValues) {
      // Find example_source field (the word to generate examples for)
      const sourceField = noteType.fields.find(f => f.settings?.example_source)
      if (sourceField && fieldValues[sourceField.name]) {
        effectiveWord = fieldValues[sourceField.name]
      }

      // Find example_context field (the meaning/context)
      const contextField = noteType.fields.find(f => f.settings?.example_context)
      if (contextField && fieldValues[contextField.name]) {
        effectiveMeaning = fieldValues[contextField.name]
      }

      // Fallback to Front/Back or Text/Extra if no fields are marked
      if (!sourceField) {
        effectiveWord = effectiveWord || fieldValues['Front'] || fieldValues['Text'] || word
      }
      if (!contextField) {
        effectiveMeaning = effectiveMeaning || fieldValues['Back'] || fieldValues['Extra'] || meaning
      }
    }

    // Check if content already exists and regenerate is not requested
    const existingContent = note.generated_content as GeneratedContent | null
    if (existingContent && !regenerate) {
      return NextResponse.json({
        success: true,
        content: {
          examples: existingContent.examples,
          collocations: existingContent.collocations,
        },
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

    // Generate examples using Claude
    const anthropic = getAnthropic()
    const userPrompt = buildUserPrompt(effectiveWord, effectiveMeaning, includeCollocations)

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: SYSTEM_PROMPT,
    })

    // Extract text content
    const textContent = message.content.find(c => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { error: 'Failed to generate examples: empty response' },
        { status: 500 }
      )
    }

    // Parse response
    const generatedData = parseGeneratedContent(textContent.text)
    if (!generatedData) {
      console.error('Failed to parse Claude response:', textContent.text)
      return NextResponse.json(
        { error: 'Failed to parse generated content' },
        { status: 500 }
      )
    }

    // Prepare content to save
    const contentToSave: GeneratedContent = {
      examples: generatedData.examples,
      collocations: generatedData.collocations,
      generated_at: new Date().toISOString(),
      model: 'claude-3-haiku-20240307',
    }

    // Update note with generated content
    const { error: updateError } = await supabase
      .from('notes')
      .update({ generated_content: contentToSave })
      .eq('id', noteId)

    if (updateError) {
      console.error('Error updating note:', updateError)
      // Content was generated but save failed - still return success
    }

    return NextResponse.json({
      success: true,
      content: {
        examples: generatedData.examples,
        collocations: generatedData.collocations,
      },
      cached: false,
    })
  } catch (error) {
    console.error('Error in generate-examples API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
