import type { QuestionDocument } from './question';

export type QuestionCluster = {
  id: string;
  examId: string;
  questionIds: string[];
  avgSimilarity: number;
  maxSimilarity: number;
  minSimilarity: number;
  status: 'pending' | 'approved_duplicates' | 'approved_variants' | 'split';
  createdAt: Date;
  updatedAt: Date;
  questions?: (QuestionDocument & { id: string })[];
};

export type ClusterDocument = QuestionCluster & {
  _id?: unknown;
};

export type ClusterAction =
  | { type: 'approve_duplicates'; keepQuestionId?: string }
  | { type: 'approve_variants' }
  | { type: 'exclude_question'; questionId: string }
  | { type: 'split'; threshold?: number }
  | { type: 'reset' };

export type ClusterSummary = {
  id: string;
  questionCount: number;
  avgSimilarity: number;
  status: QuestionCluster['status'];
  sampleQuestionText: string;
};