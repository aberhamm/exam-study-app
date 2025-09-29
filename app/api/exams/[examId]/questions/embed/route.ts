import { NextResponse } from 'next/server';
import { getDb, getQuestionsCollectionName, getQuestionEmbeddingsCollectionName } from '@/lib/server/mongodb';

type RouteParams = {
  params: Promise<{
    examId: string;
  }>;
};

type EmbedRequest = {
  ids?: string[];
  recompute?: boolean; // if false, only embed if missing
};

function buildTextForEmbedding(doc: {
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  answer: 'A'|'B'|'C'|'D'|'E'|('A'|'B'|'C'|'D'|'E')[];
  explanation?: string;
}): string {
  const choices = `A) ${doc.options.A}\nB) ${doc.options.B}\nC) ${doc.options.C}\nD) ${doc.options.D}` + (doc.options.E ? `\nE) ${doc.options.E}` : '');
  const answer = Array.isArray(doc.answer) ? doc.answer.join(', ') : doc.answer;
  const explanation = doc.explanation ? `\nExplanation: ${doc.explanation}` : '';
  return `Question: ${doc.question}\nOptions:\n${choices}\nAnswer: ${answer}${explanation}`;
}

async function createEmbeddings(inputs: string[], model: string, dimensions?: number): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY environment variable');

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: inputs, ...(dimensions ? { dimensions } : {}) }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI embeddings error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}

export async function POST(request: Request, context: RouteParams) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  let examId = 'unknown';
  try {
    const params = await context.params;
    examId = params.examId;

    let body: EmbedRequest | null = null;
    try {
      body = (await request.json()) as EmbedRequest;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const ids = Array.isArray(body?.ids) ? (body!.ids as string[]) : [];
    const recompute = body?.recompute ?? false;

    const db = await getDb();
    const qCol = db.collection(getQuestionsCollectionName());
    const eCol = db.collection(getQuestionEmbeddingsCollectionName());

    // Build query for questions to embed
    const filter: Record<string, unknown> = { examId };
    if (ids.length > 0) {
      filter.id = { $in: ids };
    }

    // Exclude large fields from read and skip already-embedded if not recomputing
    const questionsCursor = qCol.find(filter, {
      projection: {
        _id: 0,
        id: 1,
        examId: 1,
        question: 1,
        options: 1,
        answer: 1,
        explanation: 1,
      },
    });
    let candidates = (await questionsCursor.toArray()) as unknown as Array<{
      id: string;
      examId: string;
      question: string;
      options: { A: string; B: string; C: string; D: string; E?: string };
      answer: 'A'|'B'|'C'|'D'|'E'|('A'|'B'|'C'|'D'|'E')[];
      explanation?: string;
    }>;

    if (!recompute && ids.length > 0) {
      // Filter out IDs that already have embeddings
      const existing = await eCol
        .find({ examId, id: { $in: ids } }, { projection: { id: 1 } })
        .toArray();
      const existingIds = new Set(existing.map((d) => d.id as string));
      candidates = candidates.filter((c) => !existingIds.has(c.id));
    } else if (!recompute && ids.length === 0) {
      // If no specific ids, only embed missing ones for this exam
      const missing = (await qCol
        .aggregate([
          { $match: { examId } },
          {
            $lookup: {
              from: eCol.collectionName,
              let: { qid: '$id', qexam: '$examId' },
              pipeline: [
                { $match: { $expr: { $and: [ { $eq: ['$id', '$$qid'] }, { $eq: ['$examId', '$$qexam'] } ] } } },
                { $project: { _id: 0, id: 1 } },
              ],
              as: 'e',
            },
          },
          { $match: { e: { $size: 0 } } },
          { $project: { _id: 0, id: 1, examId: 1, question: 1, options: 1, answer: 1, explanation: 1 } },
        ])
        .toArray()) as unknown as Array<{
          id: string;
          examId: string;
          question: string;
          options: { A: string; B: string; C: string; D: string; E?: string };
          answer: 'A'|'B'|'C'|'D'|'E'|('A'|'B'|'C'|'D'|'E')[];
          explanation?: string;
        }>;
      candidates = missing;
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        examId,
        embedded: 0,
        skipped: ids.length,
        message: 'No candidates to embed',
      });
    }

    const model = process.env.QUESTIONS_EMBEDDING_MODEL || 'text-embedding-3-small';
    const dimsStr = process.env.QUESTIONS_EMBEDDING_DIMENSIONS;
    const dimensions = dimsStr ? Number(dimsStr) : undefined;

    const texts = candidates.map((c) => buildTextForEmbedding(c));
    // Batch calls to embeddings API (max 16 per batch)
    const batchSize = 16;
    let embedded = 0;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batchDocs = candidates.slice(i, i + batchSize);
      const batchTexts = texts.slice(i, i + batchSize);
      const vectors = await createEmbeddings(batchTexts, model, dimensions);
      const now = new Date();
      const ops = batchDocs.map((doc, idx) =>
        eCol.updateOne(
          { examId: doc.examId, id: doc.id },
          {
            $setOnInsert: { createdAt: now, id: doc.id, examId: doc.examId },
            $set: {
              embedding: vectors[idx],
              embeddingModel: model,
              embeddingUpdatedAt: now,
              updatedAt: now,
            },
          },
          { upsert: true }
        )
      );
      await Promise.all(ops);
      embedded += batchDocs.length;
    }

    return NextResponse.json({ examId, embedded, recompute, totalCandidates: candidates.length });
  } catch (error) {
    console.error(`Failed to embed questions for exam ${examId}`, error);
    return NextResponse.json({ error: 'Failed to embed questions' }, { status: 500 });
  }
}
