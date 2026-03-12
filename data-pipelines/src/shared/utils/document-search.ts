/**
 * Shared document search utilities used by the find-question-sources and
 * generate-explanations pipelines.
 */

import { basename } from 'path';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentChunkRow {
  id: string;
  chunk_id: string;
  source_file: string;
  source_basename: string | null;
  group_id: string | null;
  title: string | null;
  description: string | null;
  url: string | null;
  tags: string[] | null;
  text: string;
  section_path: string | null;
  nearest_heading: string | null;
  chunk_index: number;
  chunk_total: number;
  start_index: number;
  end_index: number;
  model: string;
  dimensions: number;
  content_hash: string | null;
  source_meta: Record<string, unknown> | null;
  score: number;
}

export interface DocumentChunk {
  text: string;
  url?: string;
  title?: string;
  sourceFile: string;
  sourceBasename?: string;
  sectionPath?: string;
  score: number;
  chunkIndex?: number;
  chunkTotal?: number;
  startIndex?: number;
  endIndex?: number;
}

export interface ExplanationSource {
  url?: string;
  title?: string;
  sourceFile: string;
  sectionPath?: string;
}

export interface StudyLink {
  chunkId: string;
  url?: string;
  excerpt?: string;
}

export interface ExternalQuestion {
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  answer: string | string[];
  question_type?: 'single' | 'multiple';
  explanation?: string;
  explanationSources?: ExplanationSource[];
  study?: StudyLink[];
  [key: string]: unknown;
}

export interface QuestionsFile {
  examId?: string;
  examTitle?: string;
  questions: ExternalQuestion[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------

export async function createEmbedding(
  openai: OpenAI,
  text: string,
  model: string,
  dimensions: number
): Promise<number[]> {
  const response = await openai.embeddings.create({ model, input: text, dimensions });
  const embedding = response.data[0]?.embedding;
  if (!embedding) throw new Error('Empty embedding response from OpenAI');
  return embedding;
}

// ---------------------------------------------------------------------------
// Supabase vector search
// ---------------------------------------------------------------------------

export async function searchQuizDocuments(
  supabase: ReturnType<typeof createClient>,
  queryEmbedding: number[],
  topK: number,
  groupIds?: string[] | null
): Promise<DocumentChunk[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('search_quiz_documents', {
    p_embedding: queryEmbedding,
    p_top_k: topK,
    p_group_ids: groupIds && groupIds.length > 0 ? groupIds : null,
  });

  if (error) throw new Error(`search_quiz_documents RPC failed: ${error.message}`);

  const rows = (data ?? []) as DocumentChunkRow[];
  return rows.map((row) => ({
    text: row.text,
    url: row.url ?? undefined,
    title: row.title ?? row.description ?? undefined,
    sourceFile: row.source_file ?? row.source_basename ?? 'unknown',
    sourceBasename: row.source_basename ?? undefined,
    sectionPath: row.section_path ?? undefined,
    score: row.score ?? 0,
    chunkIndex: row.chunk_index,
    chunkTotal: row.chunk_total,
    startIndex: row.start_index,
    endIndex: row.end_index,
  }));
}

// ---------------------------------------------------------------------------
// Document rebuild (mirrors rebuildDocumentsFromChunks in the app)
// ---------------------------------------------------------------------------

export function rebuildDocumentsFromChunks(
  chunks: DocumentChunk[],
  maxDocs: number,
  maxChars: number
): DocumentChunk[] {
  if (!chunks.length) return [];

  const bySource = new Map<string, DocumentChunk[]>();
  for (const c of chunks) {
    const key = c.sourceFile || 'unknown';
    const arr = bySource.get(key) ?? [];
    arr.push(c);
    bySource.set(key, arr);
  }

  const rebuilt: DocumentChunk[] = [];

  for (const [sourceFile, group] of bySource.entries()) {
    const top = group.reduce((a, b) => (a.score >= b.score ? a : b));

    const sorted = [...group].sort((a, b) => {
      const aHas = typeof a.startIndex === 'number';
      const bHas = typeof b.startIndex === 'number';
      if (aHas && bHas) return (a.startIndex as number) - (b.startIndex as number);
      if (aHas) return -1;
      if (bHas) return 1;
      const ai = typeof a.chunkIndex === 'number' ? (a.chunkIndex as number) : Number.MAX_SAFE_INTEGER;
      const bi = typeof b.chunkIndex === 'number' ? (b.chunkIndex as number) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    let merged = '';
    let currentEnd = -1;

    for (const ch of sorted) {
      const text = ch.text || '';
      const hasPos = typeof ch.startIndex === 'number' && typeof ch.endIndex === 'number';

      if (!hasPos) {
        merged += (merged ? '\n\n' : '') + text;
        continue;
      }

      const start = ch.startIndex as number;
      const end = ch.endIndex as number;

      if (merged.length === 0) {
        merged = text;
        currentEnd = end;
      } else if (start <= currentEnd) {
        const overlap = Math.max(0, currentEnd - start + 1);
        const suffix = overlap > 0 ? text.slice(overlap) : text;
        merged += suffix;
        currentEnd = Math.max(currentEnd, end);
      } else {
        merged += '\n\n' + text;
        currentEnd = end;
      }

      if (merged.length > maxChars * 1.5) {
        merged = merged.slice(0, Math.ceil(maxChars * 1.5));
      }
    }

    if (merged.length > maxChars) {
      merged = merged.slice(0, maxChars) + '...';
    }

    rebuilt.push({
      text: merged,
      url: top.url,
      title: top.title,
      sourceFile,
      sourceBasename: top.sourceBasename,
      sectionPath: top.sectionPath,
      score: top.score,
    });
  }

  rebuilt.sort((a, b) => b.score - a.score);
  return rebuilt.slice(0, maxDocs);
}

// ---------------------------------------------------------------------------
// Fetch exam document groups from Supabase
// ---------------------------------------------------------------------------

export async function fetchExamDocumentGroups(
  supabase: ReturnType<typeof createClient>,
  examId: string
): Promise<string[] | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .schema('quiz')
    .from('exams')
    .select('document_groups')
    .eq('exam_id', examId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch document groups for exam "${examId}": ${error.message}`);
  if (!data) return null;

  const groups = data.document_groups as string[] | null;
  return groups && groups.length > 0 ? groups : null;
}

// ---------------------------------------------------------------------------
// Build explanationSources + study from retrieved chunks
// ---------------------------------------------------------------------------

export function buildSourceFields(
  rebuiltDocs: DocumentChunk[],
  allRawChunks: DocumentChunk[],
  studyChunkCount: number
): { explanationSources: ExplanationSource[]; study: StudyLink[] } {
  const explanationSources: ExplanationSource[] = rebuiltDocs.map((doc) => ({
    ...(doc.url ? { url: doc.url } : {}),
    ...(doc.title ? { title: doc.title } : {}),
    sourceFile: doc.sourceBasename ?? basename(doc.sourceFile),
    ...(doc.sectionPath ? { sectionPath: doc.sectionPath } : {}),
  }));

  const study: StudyLink[] = allRawChunks.slice(0, studyChunkCount).map((c) => {
    const base = c.sourceBasename ?? basename(c.sourceFile, '.json');
    const chunkId = `${base}-${c.chunkIndex ?? 0}`;
    return {
      chunkId,
      ...(c.url ? { url: c.url } : {}),
      excerpt: c.text.slice(0, 200),
    };
  });

  return { explanationSources, study };
}

// ---------------------------------------------------------------------------
// Skip helpers
// ---------------------------------------------------------------------------

/** Returns true if the question already has grounded sources (skip in find-sources pass). */
export function hasValidSources(question: ExternalQuestion): boolean {
  return (
    Array.isArray(question.explanationSources) &&
    question.explanationSources.length > 0 &&
    question.explanationSources.some((s) => typeof s.url === 'string' && s.url.trim().length > 0)
  );
}

/** Returns true if the question already has a grounded explanation (skip in generate-explanations pass). */
export function hasValidExplanation(question: ExternalQuestion): boolean {
  return (
    typeof question.explanation === 'string' &&
    question.explanation.trim().length > 0 &&
    hasValidSources(question)
  );
}
