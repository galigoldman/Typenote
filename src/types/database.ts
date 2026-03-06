export type Subject =
  | 'calculus'
  | 'linear_algebra'
  | 'discrete_math'
  | 'logic'
  | 'data_structures'
  | 'algorithms'
  | 'physics'
  | 'other';

export type CanvasType = 'blank' | 'lined' | 'grid';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  color: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  user_id: string;
  folder_id: string | null;
  title: string;
  content: Record<string, unknown>;
  subject: Subject;
  subject_custom: string | null;
  canvas_type: CanvasType;
  position: number;
  created_at: string;
  updated_at: string;
}
