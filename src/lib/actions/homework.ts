'use server';

import { revalidatePath } from 'next/cache';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { resolveHomeworkSourceName } from '@/lib/ai/homework-context';
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
  exercise: { type: HomeworkMaterialType; id: string };
  materialRefs: Array<{ type: HomeworkMaterialType; id: string }>;
}): Promise<{ documentId: string; sessionId: string }> {
  const supabase = await createClient();
  const admin = createAdminClient();
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

  // Validate + name the exercise. The user-scoped client means RLS returns
  // null for anything the user can't read, so a null name doubles as the
  // access check (Moodle files are read via admin — shared registry).
  const exerciseName = await resolveHomeworkSourceName(
    supabase,
    admin,
    data.exercise.type,
    data.exercise.id,
  );
  if (!exerciseName) throw new Error('Exercise not found');

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

  // Create the homework session. The exercise is polymorphic; keep the legacy
  // exercise_document_id in sync for documents so old readers still resolve.
  const { data: session, error: sessionErr } = await supabase
    .from('homework_sessions')
    .insert({
      document_id: doc.id,
      exercise_type: data.exercise.type,
      exercise_id: data.exercise.id,
      exercise_document_id:
        data.exercise.type === 'document' ? data.exercise.id : null,
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
  // Moodle reads need the admin client (shared registry); resolveHomeworkSourceName
  // only uses it for moodle_file, so it's safe to pass for every type.
  const admin = createAdminClient();

  // Resolve the polymorphic exercise name, falling back to the legacy document
  // FK for pre-feature / seeded rows.
  const exerciseType = (typedSession.exercise_type ??
    (typedSession.exercise_document_id
      ? 'document'
      : null)) as HomeworkMaterialType | null;
  const exerciseId =
    typedSession.exercise_id ?? typedSession.exercise_document_id;
  const exerciseName =
    exerciseType && exerciseId
      ? await resolveHomeworkSourceName(
          supabase,
          admin,
          exerciseType,
          exerciseId,
        )
      : null;

  // Fetch session materials
  const { data: materialsData } = await supabase
    .from('homework_session_materials')
    .select('*')
    .eq('session_id', typedSession.id);

  const typedMaterials =
    (materialsData as HomeworkSessionMaterial[] | null) ?? [];

  // Resolve display names for each material (same per-type resolver as above).
  const materials: HomeworkContext['materials'] = [];
  for (const mat of typedMaterials) {
    const name =
      (await resolveHomeworkSourceName(
        supabase,
        admin,
        mat.material_type,
        mat.material_id,
      )) ?? 'Unknown material';
    materials.push({ type: mat.material_type, id: mat.material_id, name });
  }

  return {
    session: typedSession,
    exerciseDocument: {
      id: exerciseId ?? '',
      title: exerciseName ?? 'Exercise unavailable',
    },
    materials,
  };
}
