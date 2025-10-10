/**
 * Test vector search against the document_embeddings collection.
 * Embeds a query, runs a vector search, and prints top matches.
 *
 * Usage (from data-pipelines/):
 *   pnpm tsx scripts/test-embeddings-search.ts --query "your text" [--k 5] [--group <id>] [--index <name>]
 */
import { config as loadDotenv } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { OpenAIEmbeddings } from '@langchain/openai';

// Load env
const moduleDir = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: join(moduleDir, '../.env'), quiet: true });
loadDotenv({ quiet: true });

type Format = 'compact' | 'json';
type Args = {
  query?: string;
  k?: number;
  group?: string;
  index?: string;
  format?: Format;
  fetch?: number; // candidate pool size
  hybrid?: boolean; // use compound hybrid search (Atlas)
  mmr?: number; // 0..1 lambda for MMR re-ranking
};
function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--query') out.query = args[++i];
    else if (a === '--k') out.k = Number(args[++i]);
    else if (a === '--group') out.group = args[++i];
    else if (a === '--index') out.index = args[++i];
    else if (a === '--format') out.format = args[++i] as Format;
    else if (a === '--fetch') out.fetch = Number(args[++i]);
    else if (a === '--hybrid') out.hybrid = true;
    else if (a === '--mmr') out.mmr = Number(args[++i]);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: pnpm tsx scripts/test-embeddings-search.ts --query "your text" [--k 5] [--fetch 40] [--hybrid] [--mmr 0.7] [--group <id>] [--index <name>] [--format compact|json]');
      process.exit(0);
    }
  }
  return out;
}

function env(name: string, alt?: string): string | undefined {
  return process.env[name] || (alt ? process.env[alt] : undefined);
}
function requireEnv(name: string, alt?: string): string {
  const v = env(name, alt);
  if (!v) throw new Error(`Missing env: ${name}${alt ? ` (or ${alt})` : ''}`);
  return v;
}

async function main() {
  const { query, k: cliK, group, index: cliIndex, format, fetch: cliFetch, hybrid, mmr } = parseArgs();
  if (!query) throw new Error('Missing --query');
  const uri = requireEnv('MONGODB_URI', 'MONGO_URI');
  const database = requireEnv('MONGODB_DATABASE', 'MONGODB_DB');
  const collection = 'document_embeddings';
  const indexName = cliIndex || 'embedding_vector';
  const k = typeof cliK === 'number' && !Number.isNaN(cliK) ? cliK : 5;
  const fetchN = typeof cliFetch === 'number' && !Number.isNaN(cliFetch) ? cliFetch : Math.max(30, k * 6);

  // Embed the query
  const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  const dimensions = process.env.EMBEDDING_DIMENSIONS ? Number(process.env.EMBEDDING_DIMENSIONS) : 1536;
  const apiKey = requireEnv('OPENAI_API_KEY');
  const embeddings = new OpenAIEmbeddings({ apiKey, model, dimensions });
  const vector = await embeddings.embedQuery(query);

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(database);

  try {
    // Try Atlas Search first
    let used = 'atlas-search';
    type Hit = { _id?: unknown; score?: number; text?: string; sourceFile?: string; sourceBasename?: string; url?: string; sectionPath?: string; chunkIndex?: number; title?: string; description?: string; tags?: string[]; embedding?: number[] };
    let results: Array<Hit>;

    try {
      const fields = ['title', 'sectionPath', 'text', 'url', 'tags'];
      const useHybrid = Boolean(hybrid);
      const project: Record<string, unknown> = { text: 1, sourceFile: 1, sourceBasename: 1, url: 1, sectionPath: 1, chunkIndex: 1, title: 1, description: 1, tags: 1, score: { $meta: 'searchScore' } };
      if (typeof mmr === 'number' && !Number.isNaN(mmr)) project.embedding = 1;
      const searchStage: Record<string, unknown> = useHybrid
        ? {
            $search: {
              index: indexName,
              compound: {
                should: [
                  { knnBeta: { vector, path: 'embedding', k: fetchN } },
                  { text: { query, path: fields, score: { boost: { value: 2.0 } } } },
                ],
                minimumShouldMatch: 1,
                ...(group ? { filter: { equals: { path: 'groupId', value: group } } } : {}),
              },
            },
          }
        : {
            $search: {
              index: indexName,
              knnBeta: { vector, path: 'embedding', k: fetchN },
              ...(group ? { filter: { equals: { path: 'groupId', value: group } } } : {}),
            },
          };

      const pipeline: Array<Record<string, unknown>> = [
        searchStage,
        { $limit: fetchN },
        { $project: project },
      ];
      results = await db.collection(collection).aggregate(pipeline).toArray();
    } catch {
      // Fallback to $vectorSearch if available
      used = 'vector-search';
      const project: Record<string, unknown> = { text: 1, sourceFile: 1, sourceBasename: 1, url: 1, sectionPath: 1, chunkIndex: 1, title: 1, description: 1, tags: 1, score: { $meta: 'vectorSearchScore' } };
      if (typeof mmr === 'number' && !Number.isNaN(mmr)) project.embedding = 1;
      const pipeline: Array<Record<string, unknown>> = [
        {
          $vectorSearch: {
            index: indexName,
            path: 'embedding',
            queryVector: vector,
            numCandidates: Math.max(100, fetchN * 2),
            limit: fetchN,
            ...(group ? { filter: { groupId: group } } : {}),
          },
        },
        { $project: project },
      ];
      results = await db.collection(collection).aggregate(pipeline).toArray();
    }

    // Optional MMR re-ranking on client
    const doMMR = typeof mmr === 'number' && !Number.isNaN(mmr) && results.every(r => Array.isArray(r.embedding));
    let finalResults = results;
    if (doMMR) {
      const lambda = Math.min(1, Math.max(0, mmr!));
      const sel: Hit[] = [];
      const cand = results.slice();
      // Normalize vectors for cosine
      const norm = (v: number[]) => {
        const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0) || 1);
        return v.map(x => x / mag);
      };
      const qv = norm(vector);
      const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
      const candVecs = cand.map(r => norm(r.embedding as number[]));
      const candScores = candVecs.map(v => cosine(qv, v));
      while (sel.length < Math.min(k, cand.length)) {
        let bestIdx = -1;
        let bestScore = -Infinity;
        for (let i = 0; i < cand.length; i++) {
          const s1 = candScores[i];
          let diversity = 0;
          for (let j = 0; j < sel.length; j++) {
            const dv = candVecs[i];
            const sv = norm((sel[j].embedding as number[])!);
            diversity = Math.max(diversity, cosine(dv, sv));
          }
          const mmrScore = lambda * s1 - (1 - lambda) * diversity;
          if (mmrScore > bestScore) { bestScore = mmrScore; bestIdx = i; }
        }
        sel.push(cand[bestIdx]!);
        cand.splice(bestIdx, 1);
        candVecs.splice(bestIdx, 1);
        candScores.splice(bestIdx, 1);
      }
      finalResults = sel;
    }

    const fmt: Format = format || 'compact';
    console.log(`\nSearch`);
    console.log(`- Method: ${used}${hybrid ? ' (hybrid)' : ''}${doMMR ? ` + MMR(l=${mmr})` : ''}`);
    console.log(`- Collection: ${collection}`);
    if (group) console.log(`- Group: ${group}`);
    console.log(`- K: ${k} (fetch: ${fetchN})`);

    if (fmt === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else {
      const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
      const shortUrl = (u?: string) => {
        if (!u) return '';
        try {
          const url = new URL(u);
          const path = url.pathname.replace(/\/+$/, '');
          const last = path.split('/').filter(Boolean).slice(-2).join('/');
          return `${url.hostname}/${last || ''}`;
        } catch { return u; }
      };
      finalResults.slice(0, k).forEach((r, i) => {
        const score = r.score !== undefined ? (r.score as number).toFixed(4) : 'n/a';
        const file = r.sourceBasename || (r.sourceFile ? r.sourceFile.split('/').pop() : '');
        const path = r.sectionPath || '';
        const title = r.title || '';
        const urlDisp = shortUrl(r.url);
        const text = truncate((r.text || '').replace(/\s+/g, ' '), 180);
        console.log(`\n${i + 1}) score ${score} | idx ${r.chunkIndex ?? ''}`);
        if (title) console.log(`   title: ${truncate(title, 120)}`);
        if (path) console.log(`   path:  ${truncate(path, 120)}`);
        if (urlDisp) console.log(`   url:   ${urlDisp}`);
        if (file) console.log(`   file:  ${file}`);
        console.log(`   text:  ${text}`);
        if (Array.isArray(r.tags) && r.tags.length) console.log(`   tags:  ${r.tags.join(', ')}`);
      });
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
