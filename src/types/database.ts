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

export type MaterialCategory = 'material' | 'homework';

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

export interface Course {
  id: string;
  user_id: string;
  folder_id: string | null;
  name: string;
  color: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CourseWeek {
  id: string;
  course_id: string;
  user_id: string;
  week_number: number;
  topic: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseMaterial {
  id: string;
  week_id: string;
  user_id: string;
  category: MaterialCategory;
  storage_path: string;
  file_name: string;
  label: string | null;
  file_size: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  user_id: string;
  folder_id: string | null;
  course_id: string | null;
  week_id: string | null;
  purpose: 'homework' | 'summary' | 'notes' | null;
  title: string;
  content: Record<string, unknown>;
  pages: Record<string, unknown> | null;
  subject: Subject;
  subject_custom: string | null;
  canvas_type: CanvasType;
  position: number;
  created_at: string;
  updated_at: string;
}
