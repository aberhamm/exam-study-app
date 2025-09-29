import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { MongoClient } from 'mongodb';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

type Row = { _id: string; count: number; latest: Date | null };

async function main() {
  const uri = requireEnv('MONGODB_URI');
  const dbName = requireEnv('MONGODB_DB');
  const qName = requireEnv('MONGODB_QUESTIONS_COLLECTION');
  const eName = requireEnv('MONGODB_QUESTION_EMBEDDINGS_COLLECTION');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const qCol = db.collection(qName);
  const eCol = db.collection(eName);

  try {
    const [qAgg, eAgg] = await Promise.all([
      qCol
        .aggregate<Row>([
          { $group: { _id: '$examId', count: { $sum: 1 }, latest: { $max: '$updatedAt' } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      eCol
        .aggregate<Row>([
          { $group: { _id: '$examId', count: { $sum: 1 }, latest: { $max: '$embeddingUpdatedAt' } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
    ]);

    const qMap = new Map<string, Row>(qAgg.map((r) => [r._id, r]));
    const eMap = new Map<string, Row>(eAgg.map((r) => [r._id, r]));
    const exams = Array.from(new Set([...qMap.keys(), ...eMap.keys()])).sort();

    let totalQ = 0;
    let totalE = 0;
    console.log('Exam ID                    Questions  Embeddings  Latest Question Update        Latest Embedding Update');
    console.log('-------------------------  ---------  ----------  -----------------------------  -----------------------------');
    for (const id of exams) {
      const q = qMap.get(id);
      const e = eMap.get(id);
      totalQ += q?.count ?? 0;
      totalE += e?.count ?? 0;
      const qLatest = q?.latest ? new Date(q.latest).toISOString() : '-';
      const eLatest = e?.latest ? new Date(e.latest).toISOString() : '-';
      console.log(
        `${id.padEnd(25)}  ${(q?.count ?? 0).toString().padStart(9)}  ${(e?.count ?? 0)
          .toString()
          .padStart(10)}  ${qLatest.padEnd(29)}  ${eLatest.padEnd(29)}`
      );
    }
    console.log('-------------------------  ---------  ----------  -----------------------------  -----------------------------');
    console.log(`TOTALS                     ${totalQ.toString().padStart(9)}  ${totalE
      .toString()
      .padStart(10)}`);

    const missingEmb = exams.filter((id) => (qMap.get(id)?.count ?? 0) > 0 && (eMap.get(id)?.count ?? 0) === 0);
    if (missingEmb.length) {
      console.log(`\nExams missing embeddings: ${missingEmb.join(', ')}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

