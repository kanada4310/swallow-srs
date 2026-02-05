import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import type { FieldDefinition, GenerationRule, TemplateInput } from '@/types/database'

// GET /api/note-types/[id] - Get a note type with templates
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    // Get note type with templates
    const { data: noteType, error } = await supabase
      .from('note_types')
      .select(`
        *,
        card_templates (*)
      `)
      .eq('id', id)
      .or(`is_system.eq.true,owner_id.eq.${user.id}`)
      .single()

    if (error || !noteType) {
      return NextResponse.json({ error: 'Note type not found' }, { status: 404 })
    }

    // Sort templates by ordinal
    if (noteType.card_templates) {
      noteType.card_templates.sort((a: { ordinal: number }, b: { ordinal: number }) => a.ordinal - b.ordinal)
    }

    return NextResponse.json(noteType)
  } catch (error) {
    console.error('Error in GET /api/note-types/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/note-types/[id] - Update a note type
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    // Get existing note type
    const { data: existingNoteType, error: fetchError } = await supabase
      .from('note_types')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existingNoteType) {
      return NextResponse.json({ error: 'Note type not found' }, { status: 404 })
    }

    // Check if it's a system note type
    if (existingNoteType.is_system) {
      return NextResponse.json({ error: 'Cannot modify system note types' }, { status: 403 })
    }

    // Check if user owns this note type
    if (existingNoteType.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const { name, fields, generation_rules, templates } = body as {
      name?: string
      fields?: FieldDefinition[]
      generation_rules?: GenerationRule[]
      templates?: (TemplateInput & { id?: string })[]
    }

    // Validate fields if provided
    if (fields) {
      if (!Array.isArray(fields) || fields.length === 0) {
        return NextResponse.json({ error: 'At least one field is required' }, { status: 400 })
      }

      const fieldNames = fields.map(f => f.name)
      if (new Set(fieldNames).size !== fieldNames.length) {
        return NextResponse.json({ error: 'Field names must be unique' }, { status: 400 })
      }
    }

    // Update note type
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (fields !== undefined) {
      updateData.fields = fields.map((f, index) => ({
        name: f.name,
        ord: index,
        settings: f.settings || {},
      }))
    }
    if (generation_rules !== undefined) {
      updateData.generation_rules = generation_rules
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('note_types')
        .update(updateData)
        .eq('id', id)

      if (updateError) {
        console.error('Error updating note type:', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    // Update templates if provided
    if (templates) {
      // Get existing templates
      const { data: existingTemplates } = await supabase
        .from('card_templates')
        .select('id')
        .eq('note_type_id', id)

      const existingTemplateIds = new Set(existingTemplates?.map(t => t.id) || [])
      const newTemplateIds = new Set(templates.filter(t => t.id).map(t => t.id))

      // Delete templates that are no longer present
      const templatesToDelete = Array.from(existingTemplateIds).filter(id => !newTemplateIds.has(id))
      if (templatesToDelete.length > 0) {
        await supabase
          .from('card_templates')
          .delete()
          .in('id', templatesToDelete)
      }

      // Update or insert templates
      for (const template of templates) {
        const templateData = {
          note_type_id: id,
          name: template.name,
          ordinal: template.ordinal,
          front_template: template.front_template,
          back_template: template.back_template,
          css: template.css || '',
        }

        if (template.id && existingTemplateIds.has(template.id)) {
          // Update existing template
          await supabase
            .from('card_templates')
            .update(templateData)
            .eq('id', template.id)
        } else {
          // Insert new template
          await supabase
            .from('card_templates')
            .insert(templateData)
        }
      }
    }

    // Fetch and return updated note type
    const { data: updatedNoteType, error: refetchError } = await supabase
      .from('note_types')
      .select(`
        *,
        card_templates (*)
      `)
      .eq('id', id)
      .single()

    if (refetchError) {
      return NextResponse.json({ error: refetchError.message }, { status: 500 })
    }

    // Sort templates by ordinal
    if (updatedNoteType.card_templates) {
      updatedNoteType.card_templates.sort((a: { ordinal: number }, b: { ordinal: number }) => a.ordinal - b.ordinal)
    }

    return NextResponse.json(updatedNoteType)
  } catch (error) {
    console.error('Error in PUT /api/note-types/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/note-types/[id] - Delete a note type
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    // Get existing note type
    const { data: existingNoteType, error: fetchError } = await supabase
      .from('note_types')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existingNoteType) {
      return NextResponse.json({ error: 'Note type not found' }, { status: 404 })
    }

    // Check if it's a system note type
    if (existingNoteType.is_system) {
      return NextResponse.json({ error: 'Cannot delete system note types' }, { status: 403 })
    }

    // Check if user owns this note type
    if (existingNoteType.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check if there are notes using this note type
    const { count, error: countError } = await supabase
      .from('notes')
      .select('id', { count: 'exact', head: true })
      .eq('note_type_id', id)

    if (countError) {
      console.error('Error counting notes:', countError)
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    if (count && count > 0) {
      return NextResponse.json({
        error: `Cannot delete note type: ${count} notes are using this note type`,
      }, { status: 400 })
    }

    // Delete templates first (due to foreign key constraint)
    await supabase
      .from('card_templates')
      .delete()
      .eq('note_type_id', id)

    // Delete note type
    const { error: deleteError } = await supabase
      .from('note_types')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting note type:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/note-types/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
