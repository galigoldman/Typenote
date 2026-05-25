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
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a display name for any material type */
async function resolveMaterialName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  type: HomeworkMaterialType,
  id: string,
): Promise<string> {
  if (type === 'document') {
    const { data } = await supabase
      .from('documents')
      .select('title')
      .eq('id', id)
      .single();
    return data?.title ?? 'Unknown document';
  }
  if (type === 'course_material') {
    const { data } = await supabase
      .from('course_materials')
      .select('file_name')
      .eq('id', id)
      .single();
    return data?.file_name ?? 'Unknown material';
  }
  if (type === 'personal_file') {
    const { data } = await supabase
      .from('personal_files')
      .select('display_name')
      .eq('id', id)
      .single();
    return data?.display_name ?? 'Unknown file';
  }
  if (type === 'moodle_file') {
    const admin = createAdminClient();
    const { data } = await admin
      .from('moodle_files')
      .select('file_name')
      .eq('id', id)
      .single();
    return data?.file_name ?? 'Unknown Moodle file';
  }
  return 'Unknown';
}

// ---------------------------------------------------------------------------
// createHomeworkSession
// ---------------------------------------------------------------------------

export async function createHomeworkSession(data: {
  courseId: string;
  exerciseRef: { type: HomeworkMaterialType; id: string };
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

  // Resolve exercise name for the document title
  const exerciseName = await resolveMaterialName(
    supabase,
    data.exerciseRef.type,
    data.exerciseRef.id,
  );

  // Create the homework document
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      course_id: data.courseId,
      purpose: 'homework' as const,
      title: `HW — ${exerciseName}`,
      content: {},
      subject: 'other' as const,
      canvas_type: 'blank' as const,
    })
    .select('id')
    .single();
  if (docErr || !doc)
    throw new Error(docErr?.message ?? 'Failed to create document');

  // Create the homework session with polymorphic exercise reference
  const exerciseDocId =
    data.exerciseRef.type === 'document' ? data.exerciseRef.id : null;
  const { data: session, error: sessionErr } = await supabase
    .from('homework_sessions')
    .insert({
      document_id: doc.id,
      exercise_document_id: exerciseDocId,
      exercise_type: data.exerciseRef.type,
      exercise_id: data.exerciseRef.id,
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

  // Resolve exercise name using the polymorphic reference
  const exerciseType =
    typedSession.exercise_type ??
    (typedSession.exercise_document_id ? 'document' : null);
  const exerciseId =
    typedSession.exercise_id ?? typedSession.exercise_document_id;

  let exerciseName = 'Exercise unavailable';
  if (exerciseType && exerciseId) {
    exerciseName = await resolveMaterialName(
      supabase,
      exerciseType as HomeworkMaterialType,
      exerciseId,
    );
  }

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
    const name = await resolveMaterialName(
      supabase,
      mat.material_type,
      mat.material_id,
    );
    materials.push({ type: mat.material_type, id: mat.material_id, name });
  }

  return {
    session: typedSession,
    exercise: {
      type: (exerciseType as HomeworkMaterialType) ?? 'document',
      id: exerciseId ?? '',
      name: exerciseName,
    },
    materials,
  };
}
