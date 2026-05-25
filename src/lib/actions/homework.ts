'use server';

import { revalidatePath } from 'next/cache';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type {
  HomeworkContext,
  HomeworkMaterialType,
  HomeworkSession,
  HomeworkSessionMaterial,
} from '@/types/database';

// ---------------------------------------------------------------------------
// createHomeworkSession
// ---------------------------------------------------------------------------

export async function createHomeworkSession(data: {
  courseId: string;
  exerciseDocumentId: string;
  materialRefs: Array<{ type: HomeworkMaterialType; id: string }>;
}): Promise<{ documentId: string; sessionId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Validate course belongs to user
  const { data: course, error: courseErr } = await supabase
    .from('courses')
    .select('id')
    .eq('id', data.courseId)
    .eq('user_id', user.id)
    .single();
  if (courseErr || !course) throw new Error('Course not found');

  // Validate exercise document belongs to user and is in this course
  const { data: exercise, error: exErr } = await supabase
    .from('documents')
    .select('id, title')
    .eq('id', data.exerciseDocumentId)
    .eq('user_id', user.id)
    .eq('course_id', data.courseId)
    .single();
  if (exErr || !exercise) throw new Error('Exercise document not found');

  // Create the homework document
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      course_id: data.courseId,
      purpose: 'homework' as const,
      title: `HW — ${exercise.title}`,
      content: {},
      subject: 'other' as const,
      canvas_type: 'blank' as const,
    })
    .select('id')
    .single();
  if (docErr || !doc)
    throw new Error(docErr?.message ?? 'Failed to create document');

  // Create the homework session
  const { data: session, error: sessionErr } = await supabase
    .from('homework_sessions')
    .insert({
      document_id: doc.id,
      exercise_document_id: data.exerciseDocumentId,
      course_id: data.courseId,
      user_id: user.id,
    })
    .select('id')
    .single();
  if (sessionErr || !session)
    throw new Error(sessionErr?.message ?? 'Failed to create session');

  // Create material links
  if (data.materialRefs.length > 0) {
    const materialRows = data.materialRefs.map((ref) => ({
      session_id: session.id,
      material_type: ref.type,
      material_id: ref.id,
    }));
    const { error: matErr } = await supabase
      .from('homework_session_materials')
      .insert(materialRows);
    if (matErr) throw new Error(matErr.message);
  }

  revalidatePath('/dashboard');
  return { documentId: doc.id, sessionId: session.id };
}

// ---------------------------------------------------------------------------
// getHomeworkContext
// ---------------------------------------------------------------------------

export async function getHomeworkContext(data: {
  documentId: string;
}): Promise<HomeworkContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch homework session for this document
  const { data: session } = await supabase
    .from('homework_sessions')
    .select('*')
    .eq('document_id', data.documentId)
    .single();
  if (!session) return null;

  const typedSession = session as HomeworkSession;

  // Fetch exercise document title
  const { data: exerciseDoc } = await supabase
    .from('documents')
    .select('id, title')
    .eq('id', typedSession.exercise_document_id)
    .single();

  // Fetch session materials
  const { data: materialsData } = await supabase
    .from('homework_session_materials')
    .select('*')
    .eq('session_id', typedSession.id);

  const typedMaterials =
    (materialsData as HomeworkSessionMaterial[] | null) ?? [];

  // Resolve display names for each material
  const materials: HomeworkContext['materials'] = [];
  for (const mat of typedMaterials) {
    let name = 'Unknown material';
    if (mat.material_type === 'course_material') {
      const { data: cm } = await supabase
        .from('course_materials')
        .select('file_name')
        .eq('id', mat.material_id)
        .single();
      if (cm) name = cm.file_name;
    } else if (mat.material_type === 'personal_file') {
      const { data: pf } = await supabase
        .from('personal_files')
        .select('display_name')
        .eq('id', mat.material_id)
        .single();
      if (pf) name = pf.display_name;
    } else if (mat.material_type === 'document') {
      const { data: d } = await supabase
        .from('documents')
        .select('title')
        .eq('id', mat.material_id)
        .single();
      if (d) name = d.title;
    } else if (mat.material_type === 'moodle_file') {
      // Moodle files are shared (user_id null on embeddings); read via admin
      // so RLS on the shared registry never hides the display name.
      const admin = createAdminClient();
      const { data: mf } = await admin
        .from('moodle_files')
        .select('file_name')
        .eq('id', mat.material_id)
        .single();
      if (mf) name = mf.file_name;
    }
    materials.push({ type: mat.material_type, id: mat.material_id, name });
  }

  return {
    session: typedSession,
    exerciseDocument: exerciseDoc
      ? { id: exerciseDoc.id, title: exerciseDoc.title }
      : {
          id: typedSession.exercise_document_id ?? '',
          title: 'Exercise unavailable',
        },
    materials,
  };
}
