import { MongoClient } from 'mongodb';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load env (basic .env if present)
try {
  require('@next/env').loadEnvConfig(process.cwd());
} catch {}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function fmt(date) {
  return date ? new Date(date).toISOString() : '-';
}

async function main() {
  // Args: --exam <examId>
  const args = process.argv.slice(2);
  let examFilter = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--exam') {
      examFilter = args[i + 1] || null;
      i++;
    }
  }

  const uri = requireEnv('MONGODB_URI');
  const dbName = requireEnv('MONGODB_DB');
  const qName = process.env.MONGODB_QUESTIONS_COLLECTION || 'questions';
  const eName = process.env.MONGODB_QUESTION_EMBEDDINGS_COLLECTION || 'question_embeddings';

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const qCol = db.collection(qName);
  const eCol = db.collection(eName);

  try {
    const qPipeline = [];
    if (examFilter) qPipeline.push({ $match: { examId: examFilter } });
    qPipeline.push({ $group: { _id: '$examId', count: { $sum: 1 }, latest: { $max: '$updatedAt' } } });
    qPipeline.push({ $sort: { _id: 1 } });

    const ePipeline = [];
    if (examFilter) ePipeline.push({ $match: { examId: examFilter } });
    ePipeline.push({ $group: { _id: '$examId', count: { $sum: 1 }, latest: { $max: '$embeddingUpdatedAt' } } });
    ePipeline.push({ $sort: { _id: 1 } });

    const [qAgg, eAgg] = await Promise.all([
      qCol.aggregate(qPipeline).toArray(),
      eCol.aggregate(ePipeline).toArray(),
    ]);

    const mapQ = new Map(qAgg.map((r) => [r._id, r]));
    const mapE = new Map(eAgg.map((r) => [r._id, r]));
    const exams = Array.from(new Set([...mapQ.keys(), ...mapE.keys()])).sort();

    let totalQ = 0;
    let totalE = 0;
    console.log('Exam ID                    Questions  Embeddings  Latest Question Update        Latest Embedding Update');
    console.log('-------------------------  ---------  ----------  -----------------------------  -----------------------------');
    for (const id of exams) {
      const q = mapQ.get(id);
      const e = mapE.get(id);
      totalQ += (q?.count ?? 0);
      totalE += (e?.count ?? 0);
      console.log(
        `${id.padEnd(25)}  ${(q?.count ?? 0).toString().padStart(9)}  ${(e?.count ?? 0)
          .toString()
          .padStart(10)}  ${fmt(q?.latest).padEnd(29)}  ${fmt(e?.latest).padEnd(29)}`
      );
    }
    console.log('-------------------------  ---------  ----------  -----------------------------  -----------------------------');
    console.log(`TOTALS                     ${totalQ.toString().padStart(9)}  ${totalE.toString().padStart(10)}`);

    const missing = exams.filter((id) => (mapQ.get(id)?.count ?? 0) > 0 && (mapE.get(id)?.count ?? 0) === 0);
    if (missing.length) {
      console.log(`\nExams missing embeddings: ${missing.join(', ')}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
