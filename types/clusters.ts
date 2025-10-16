import type { QuestionDocument } from './question';
import type { ObjectId } from 'mongodb';

/**
 * Clusters are the canonical representation of question similarity.
 *
 * Rationale:
 * - Pair-based dedupe is useful for triage, but clusters persist curation decisions.
 * - Cluster IDs are stable UUIDs and are preserved across regenerations.
 * - Admin decisions set `locked=true` to prevent incremental regeneration from overwriting them.
 */

/**
 * Cluster document stored in MongoDB.
 */
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
  // Optional metrics and management fields
  cohesionScore?: number;
  density?: number;
  edgeCount?: number;
  possibleEdgeCount?: number;
  stdDevSimilarity?: number;
  medoidId?: string;
  silhouette?: number;
  locked?: boolean;
  decidedAt?: Date;
  decisionBy?: string;
  parents?: string[];
  children?: string[];
  // Review flags
  flaggedForReview?: boolean;
  flaggedReason?: string;
  flaggedAt?: Date;
  flaggedBy?: string;
  // Proposed additions awaiting review
  proposedAdditions?: ProposedAddition[];
  questions?: (QuestionDocument & { id: string })[];
};

export type ClusterDocument = QuestionCluster & {
  _id?: ObjectId;
};

export type ProposedAddition = {
  id: string;
  score?: number;
  proposedAt: Date;
};

/**
 * Allowed admin actions on a cluster. See API route docs for behavior.
 */
export type ClusterAction =
  | { type: 'approve_duplicates'; keepQuestionId?: string }
  | { type: 'approve_variants' }
  | { type: 'exclude_question'; questionId: string }
  | { type: 'split'; strategy?: 'auto' | 'threshold'; threshold?: number; minClusterSize?: number }
  | { type: 'reset' }
  | { type: 'flag_review'; reason?: string }
  | { type: 'clear_review' }
  | { type: 'approve_additions'; ids: string[] }
  | { type: 'reject_additions'; ids: string[] };

export type ClusterSummary = {
  id: string;
  questionCount: number;
  avgSimilarity: number;
  status: QuestionCluster['status'];
  sampleQuestionText: string;
};
