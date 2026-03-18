import type { MoodleAssignment, AssignmentSplit, SplitQuestion } from './database';

/** An assignment with its available splits loaded */
export interface AssignmentWithSplits extends MoodleAssignment {
  splits: AssignmentSplit[];
}

/** A split with its questions loaded */
export interface SplitWithQuestions extends AssignmentSplit {
  questions: SplitQuestion[];
}

/** Boundary definition for creating/editing splits */
export interface QuestionBoundary {
  label: string;
  position: number;
  boundaryStart: number;
  boundaryEnd: number;
  parentLabel?: string;
  preambleStart?: number;
  preambleEnd?: number;
  lowConfidence?: boolean;
}

/** Result from AI split */
export interface AiSplitResult {
  questions: QuestionBoundary[];
  contentVersion: number;
}

/** Scraped assignment data from the extension */
export interface ScrapedAssignment {
  moodleUrl: string;
  moodleModuleId: string;
  title: string;
  descriptionHtml: string;
  dueDate: string | null;
}
