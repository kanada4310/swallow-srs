import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import Anthropic from '@anthropic-ai/sdk'
import type { GeneratedContent, GenerationRule } from '@/types/database'

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

// Legacy system prompt (for notes without generation rules)
const LEGACY_SYSTEM_PROMPT = `You are an English vocabulary assistant for Japanese learners.
Generate natural example sentences using common collocations.

Guidelines:
- Use intermediate-level English
- Include practical, memorable contexts
- Collocations should be frequently used combinations
- Return valid JSON only, no markdown or extra text`

// Build system prompt for generation rules
function buildRuleSystemPrompt(): string {
  return `You are an AI assistant for a Japanese learning application.
Generate content based on the user's instruction.

Guidelines:
- Follow the instruction precisely
- Return ONLY the generated text content, no JSON, no markdown code blocks
- If multiple items are requested, separate them with newlines
- Be concise and practical`
}

// Build user prompt for a generation rule
function buildRuleUserPrompt(rule: GenerationRule, fieldValues: Record<string, string>): string {
  const sourceData = rule.source_fields
    .map(f => {
      const val = fieldValues[f]
      return val ? `${f}: "${val}"` : null
    })
    .filter(Boolean)
    .join('\n')

  return `${rule.instruction}

参照データ:
${sourceData}

生成結果のみを返してください。説明やマークダウンは不要です。`
}

// Legacy: Build user prompt for old-style generation
function buildLegacyUserPrompt(word: string, meaning?: string, includeCollocations: boolean = true): string {
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

// Parse JSON response from Claude (legacy mode)
function parseLegacyContent(response: string): { examples: string[], collocations?: string[] } | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    if (!parsed.examples || !Array.isArray(parsed.examples)) return null
    if (parsed.examples.length === 0) return null

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

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const {
      noteId,
      word,
      meaning,
      includeCollocations = true,
      regenerate = false,
      ruleId,
    } = body

    // Validate required fields
    if (!noteId) {
      return NextResponse.json(
        { error: 'Missing required field: noteId' },
        { status: 400 }
      )
    }

    // Get note and verify access, including note type for field settings and generation rules
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select(`
        id,
        deck_id,
        generated_content,
        field_values,
        note_type:note_types (
          fields,
          generation_rules
        )
      `)
      .eq('id', noteId)
      .single()

    if (noteError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    // Verify deck access
    const { data: deck } = await supabase
      .from('decks')
      .select('id, owner_id')
      .eq('id', note.deck_id)
      .single()

    if (!deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    let hasAccess = deck.owner_id === user.id

    if (!hasAccess) {
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

    const noteType = note.note_type as unknown as {
      fields: Array<{ name: string; settings?: { example_source?: boolean; example_context?: boolean } }>
      generation_rules?: GenerationRule[]
    } | null
    const fieldValues = note.field_values as Record<string, string> | null

    // If a ruleId is specified, use the generation rule
    if (ruleId && noteType?.generation_rules) {
      const rule = noteType.generation_rules.find(r => r.id === ruleId)
      if (!rule) {
        return NextResponse.json({ error: 'Generation rule not found' }, { status: 404 })
      }

      if (!fieldValues) {
        return NextResponse.json({ error: 'Note has no field values' }, { status: 400 })
      }

      // Check if target field already has content and regenerate is not requested
      if (fieldValues[rule.target_field] && !regenerate) {
        return NextResponse.json({
          success: true,
          content: fieldValues[rule.target_field],
          target_field: rule.target_field,
          cached: true,
        })
      }

      // Generate using the rule
      const anthropic = getAnthropic()
      const userPrompt = buildRuleUserPrompt(rule, fieldValues)

      const message = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [{ role: 'user', content: userPrompt }],
        system: buildRuleSystemPrompt(),
      })

      const textContent = message.content.find(c => c.type === 'text')
      if (!textContent || textContent.type !== 'text') {
        return NextResponse.json(
          { error: 'Failed to generate content: empty response' },
          { status: 500 }
        )
      }

      const generatedText = textContent.text.trim()

      // Save to field_values
      const updatedFieldValues = { ...fieldValues, [rule.target_field]: generatedText }
      const { error: updateError } = await supabase
        .from('notes')
        .update({ field_values: updatedFieldValues })
        .eq('id', noteId)

      if (updateError) {
        console.error('Error updating note field_values:', updateError)
      }

      return NextResponse.json({
        success: true,
        content: generatedText,
        target_field: rule.target_field,
        cached: false,
      })
    }

    // ---- Legacy mode (for notes without generation rules) ----

    if (!word) {
      return NextResponse.json(
        { error: 'Missing required field: word (legacy mode)' },
        { status: 400 }
      )
    }

    // Determine word and meaning from field settings or fallback
    let effectiveWord = word
    let effectiveMeaning = meaning

    if (noteType?.fields && fieldValues) {
      const sourceField = noteType.fields.find(f => f.settings?.example_source)
      if (sourceField && fieldValues[sourceField.name]) {
        effectiveWord = fieldValues[sourceField.name]
      }

      const contextField = noteType.fields.find(f => f.settings?.example_context)
      if (contextField && fieldValues[contextField.name]) {
        effectiveMeaning = fieldValues[contextField.name]
      }

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

    // Generate examples using Claude (legacy)
    const anthropic = getAnthropic()
    const userPrompt = buildLegacyUserPrompt(effectiveWord, effectiveMeaning, includeCollocations)

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [{ role: 'user', content: userPrompt }],
      system: LEGACY_SYSTEM_PROMPT,
    })

    const textContent = message.content.find(c => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { error: 'Failed to generate examples: empty response' },
        { status: 500 }
      )
    }

    const generatedData = parseLegacyContent(textContent.text)
    if (!generatedData) {
      console.error('Failed to parse Claude response:', textContent.text)
      return NextResponse.json(
        { error: 'Failed to parse generated content' },
        { status: 500 }
      )
    }

    // Prepare content to save (legacy: generated_content column)
    const contentToSave: GeneratedContent = {
      examples: generatedData.examples,
      collocations: generatedData.collocations,
      generated_at: new Date().toISOString(),
      model: 'claude-3-haiku-20240307',
    }

    const { error: updateError } = await supabase
      .from('notes')
      .update({ generated_content: contentToSave })
      .eq('id', noteId)

    if (updateError) {
      console.error('Error updating note:', updateError)
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
