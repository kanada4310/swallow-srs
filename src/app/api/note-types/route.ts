import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FieldDefinition, TemplateInput } from '@/types/database'

// GET /api/note-types - Get all note types
export async function GET() {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get note types with template count
    // System note types + user's own note types
    const { data: noteTypes, error } = await supabase
      .from('note_types')
      .select(`
        *,
        card_templates (id)
      `)
      .or(`is_system.eq.true,owner_id.eq.${user.id}`)
      .order('is_system', { ascending: false })
      .order('name')

    if (error) {
      console.error('Error fetching note types:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform to include template count
    const noteTypesWithCount = noteTypes.map(nt => ({
      ...nt,
      template_count: nt.card_templates?.length || 0,
      card_templates: undefined, // Remove raw templates from response
    }))

    return NextResponse.json(noteTypesWithCount)
  } catch (error) {
    console.error('Error in GET /api/note-types:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/note-types - Create a new note type
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is a teacher
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (profile.role !== 'teacher' && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Only teachers can create note types' }, { status: 403 })
    }

    const body = await request.json()
    const { name, fields, templates } = body as {
      name: string
      fields: FieldDefinition[]
      templates: TemplateInput[]
    }

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json({ error: 'At least one field is required' }, { status: 400 })
    }

    if (!templates || !Array.isArray(templates) || templates.length === 0) {
      return NextResponse.json({ error: 'At least one template is required' }, { status: 400 })
    }

    // Validate field names are unique
    const fieldNames = fields.map(f => f.name)
    if (new Set(fieldNames).size !== fieldNames.length) {
      return NextResponse.json({ error: 'Field names must be unique' }, { status: 400 })
    }

    // Ensure fields have proper ordinal
    const processedFields = fields.map((f, index) => ({
      name: f.name,
      ord: index,
      settings: f.settings || {},
    }))

    // Create note type
    const { data: noteType, error: createError } = await supabase
      .from('note_types')
      .insert({
        name: name.trim(),
        owner_id: user.id,
        fields: processedFields,
        is_system: false,
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating note type:', createError)
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    // Create templates
    const templatesToInsert = templates.map((t, index) => ({
      note_type_id: noteType.id,
      name: t.name || `Card ${index + 1}`,
      ordinal: t.ordinal ?? index,
      front_template: t.front_template,
      back_template: t.back_template,
      css: t.css || '',
    }))

    const { data: createdTemplates, error: templateError } = await supabase
      .from('card_templates')
      .insert(templatesToInsert)
      .select()

    if (templateError) {
      // Rollback note type creation
      await supabase.from('note_types').delete().eq('id', noteType.id)
      console.error('Error creating templates:', templateError)
      return NextResponse.json({ error: templateError.message }, { status: 500 })
    }

    return NextResponse.json({
      ...noteType,
      card_templates: createdTemplates,
    }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/note-types:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
