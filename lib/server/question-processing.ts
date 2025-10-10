/**
 * Question Processing - Embeddings and Competency Assignment
 *
 * Reusable functions for post-import processing that can be called from:
 * - API endpoints (UI-driven)
 * - CLI scripts (bulk operations)
 */
import { MongoClient, ObjectId } from 'mongodb';
import { envConfig } from '../env-config';
import { searchSimilarCompetencies } from './competency-assignment';

type QuestionDoc = {
  _id: ObjectId;
  examId: string;
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  answer: 'A' | 'B' | 'C' | 'D' | 'E' | ('A' | 'B' | 'C' | 'D' | 'E')[];
  explanation?: string;
  competencyIds?: string[];
};

type QuestionEmbeddingDoc = {
  examId: string;
  question_id: ObjectId;
  embedding: number[];
  embeddingModel: string;
  embeddingUpdatedAt: Date;
};

export type EmbeddingResult = {
  questionId: string;
  success: boolean;
  error?: string;
};

export type CompetencyAssignmentResult = {
  questionId: string;
  success: boolean;
  competencyIds: string[];
  error?: string;
};

/**
 * Build text for embedding from question data
 */
function buildTextForEmbedding(q: QuestionDoc): string {
  const choices =
    `A) ${q.options.A}\nB) ${q.options.B}\nC) ${q.options.C}\nD) ${q.options.D}` +
    (q.options.E ? `\nE) ${q.options.E}` : '');
  const answer = Array.isArray(q.answer) ? q.answer.join(', ') : q.answer;
  const explanation = q.explanation ? `\nExplanation: ${q.explanation}` : '';
  return `Question: ${q.question}\nOptions:\n${choices}\nAnswer: ${answer}${explanation}`;
}

/**
 * Call OpenAI embeddings API
 */
async function createEmbeddings(
  inputs: string[],
  model: string,
  dimensions?: number
): Promise<number[][]> {
  const apiKey = envConfig.openai.apiKey;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for embeddings');
  }

  const url = 'https://api.openai.com/v1/embeddings';
  const body: Record<string, unknown> = { model, input: inputs };
  if (dimensions) body.dimensions = dimensions;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}

/**
 * Generate embeddings for specific questions by their MongoDB _id
 * @param questionIds - Array of MongoDB ObjectId strings
 * @param options - Optional batch size and model settings
 * @returns Results array with success/error for each question
 */
export async function generateEmbeddingsForQuestions(
  questionIds: string[],
  options?: {
    batchSize?: number;
    model?: string;
    dimensions?: number;
  }
): Promise<EmbeddingResult[]> {
  const batchSize = options?.batchSize ?? 16;
  const model = options?.model ?? envConfig.openai.embeddingModel;
  const dimensions = options?.dimensions ?? envConfig.openai.embeddingDimensions;

  const uri = envConfig.mongo.uri;
  const dbName = envConfig.mongo.database;
  const questionsColName = envConfig.mongo.questionsCollection;
  const embeddingsColName = envConfig.mongo.questionEmbeddingsCollection;

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db(dbName);
    const questionsCol = db.collection<QuestionDoc>(questionsColName);
    const embeddingsCol = db.collection<QuestionEmbeddingDoc>(embeddingsColName);

    // Convert string IDs to ObjectIds
    const objectIds = questionIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    if (objectIds.length === 0) {
      return [];
    }

    // Fetch questions
    const questions = await questionsCol
      .find({ _id: { $in: objectIds } })
      .toArray();

    const results: EmbeddingResult[] = [];

    // Process in batches
    for (let i = 0; i < questions.length; i += batchSize) {
      const batchDocs = questions.slice(i, i + batchSize);
      const inputs = batchDocs.map(buildTextForEmbedding);

      try {
        const embeddings = await createEmbeddings(inputs, model, dimensions);
        const now = new Date();

        // Store embeddings
        const ops = batchDocs.map((doc, idx) => {
          return embeddingsCol.updateOne(
            { examId: doc.examId, question_id: doc._id },
            {
              $set: {
                examId: doc.examId,
                question_id: doc._id,
                embedding: embeddings[idx],
                embeddingModel: model,
                embeddingUpdatedAt: now,
              },
            },
            { upsert: true }
          );
        });

        await Promise.all(ops);

        // Mark as successful
        for (const doc of batchDocs) {
          results.push({
            questionId: doc._id.toString(),
            success: true,
          });
        }
      } catch (error) {
        // Mark batch as failed
        for (const doc of batchDocs) {
          results.push({
            questionId: doc._id.toString(),
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return results;
  } finally {
    await client.close();
  }
}

/**
 * Auto-assign competencies to questions using vector similarity
 * @param examId - Exam ID to scope the competencies
 * @param questionIds - Array of MongoDB ObjectId strings
 * @param options - Similarity threshold and top N matches
 * @returns Results array with assigned competency IDs for each question
 */
export async function assignCompetenciesToQuestions(
  examId: string,
  questionIds: string[],
  options?: {
    topN?: number;
    threshold?: number;
    overwrite?: boolean;
  }
): Promise<CompetencyAssignmentResult[]> {
  const topN = options?.topN ?? 1;
  const threshold = options?.threshold ?? 0.5;
  const overwrite = options?.overwrite ?? false;

  const uri = envConfig.mongo.uri;
  const dbName = envConfig.mongo.database;
  const questionsColName = envConfig.mongo.questionsCollection;
  const embeddingsColName = envConfig.mongo.questionEmbeddingsCollection;

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db(dbName);
    const questionsCol = db.collection<QuestionDoc>(questionsColName);
    const embeddingsCol = db.collection<QuestionEmbeddingDoc>(embeddingsColName);

    // Convert string IDs to ObjectIds
    const objectIds = questionIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    if (objectIds.length === 0) {
      return [];
    }

    // Fetch questions
    const questions = await questionsCol
      .find({ _id: { $in: objectIds }, examId })
      .toArray();

    const results: CompetencyAssignmentResult[] = [];

    for (const question of questions) {
      try {
        // Skip if already has competencies and not overwriting
        if (!overwrite && question.competencyIds && question.competencyIds.length > 0) {
          results.push({
            questionId: question._id.toString(),
            success: true,
            competencyIds: question.competencyIds,
          });
          continue;
        }

        // Get question embedding
        const embeddingDoc = await embeddingsCol.findOne(
          { question_id: question._id, examId },
          { projection: { embedding: 1 } }
        );

        if (!embeddingDoc?.embedding || embeddingDoc.embedding.length === 0) {
          results.push({
            questionId: question._id.toString(),
            success: false,
            competencyIds: [],
            error: 'No embedding found for question',
          });
          continue;
        }

        // Search for similar competencies using existing function
        const similarCompetencies = await searchSimilarCompetencies(
          embeddingDoc.embedding,
          examId,
          topN
        );

        // Filter by threshold
        const competencyIds = similarCompetencies
          .filter((c) => c.score >= threshold)
          .map((c) => c.competency.id);

        if (competencyIds.length === 0) {
          results.push({
            questionId: question._id.toString(),
            success: false,
            competencyIds: [],
            error: `No competencies above threshold ${threshold}`,
          });
          continue;
        }

        // Use existing assignCompetenciesToQuestion which maintains questionCount sync
        const { assignCompetenciesToQuestion } = await import('./competency-assignment');
        await assignCompetenciesToQuestion(question._id.toString(), examId, competencyIds);

        results.push({
          questionId: question._id.toString(),
          success: true,
          competencyIds,
        });
      } catch (error) {
        results.push({
          questionId: question._id.toString(),
          success: false,
          competencyIds: [],
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  } finally {
    await client.close();
  }
}
