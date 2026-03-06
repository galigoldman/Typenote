import type { Subject } from '@/types/database';

export const SUBJECTS: { value: Subject; label: string }[] = [
  { value: 'calculus', label: 'Calculus' },
  { value: 'linear_algebra', label: 'Linear Algebra' },
  { value: 'discrete_math', label: 'Discrete Math' },
  { value: 'logic', label: 'Logic' },
  { value: 'data_structures', label: 'Data Structures' },
  { value: 'algorithms', label: 'Algorithms' },
  { value: 'physics', label: 'Physics' },
  { value: 'other', label: 'Other' },
];

export const CANVAS_TYPES = [
  { value: 'blank', label: 'Blank' },
  { value: 'lined', label: 'Lined' },
  { value: 'grid', label: 'Grid' },
] as const;
