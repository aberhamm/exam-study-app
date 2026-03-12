# Documentation Enrichment Pipeline Plan

## Goal

Enrich existing exam questions with `explanation`, `explanationSources`, and `study` fields
by building a pipeline that:

1. Ingests all Sitecore documentation into the MongoDB vector store
2. Runs semantic search per question to find the most relevant doc chunks
3. Uses an LLM to generate a grounded explanation citing those chunks
4. Outputs enriched questions ready for import — or triggers generation through
   the existing `/api/explain` endpoint in bulk

---

## How Explanations and Sources Work (existing system)

The app already has a full explanation generation system in `lib/server/explanation-generator.ts`.
Understanding it is essential for the enrichment pipeline.

### Backend: Supabase, not MongoDB

The `markdown-to-embeddings` pipeline writes to `quiz.document_chunks` in Supabase via
`SupabaseService` (`data-pipelines/src/shared/services/supabase.ts`). The app queries
it via the `search_quiz_documents` RPC in `lib/server/documents-search.ts`. **There is
no MongoDB in this pipeline — the plan's earlier references to MongoDB are obsolete.**

### Generation flow

1. **Embed the question** — create an OpenAI embedding for the question text
2. **Embed the answer** — create a second embedding for the correct answer text
3. **Vector search** — call `search_quiz_documents` RPC on Supabase for top-K chunks
   matching each embedding separately
4. **Merge chunks** — combine and sort by score, then call `rebuildDocumentsFromChunks()`
   which groups by `sourceFile`, merges overlapping text, and returns the top N documents
5. **LLM call** — pass rebuilt document text + question to the LLM to generate the explanation
6. **Build sources** — map each processed chunk to `{ url, title, sourceFile, sectionPath }`

### `explanationSources` type

```ts
// Stored on the question document in Supabase and returned to the client
{
  url?: string;        // Live URL from chunk metadata — e.g. https://doc.sitecore.com/...
  title?: string;      // Document title from chunk metadata
  sourceFile: string;  // Filename/basename of the source doc (required)
  sectionPath?: string // e.g. "JSS > Placeholders > Nested placeholders"
}[]
```

The `url` comes directly from `quiz.document_chunks.url`, which is set by the
`markdown-to-embeddings` pipeline from:
- **Firecrawl JSON** — `metadata.sourceURL` field in the scraped JSON
- **Markdown files** — derived from the file path + `--base-url` CLI arg

### `study` type (separate from sources)

```ts
{
  chunkId: string;   // Identifies the specific chunk
  url?: string;      // Same doc URL as explanationSources
  anchor?: string;   // Optional section anchor
  excerpt?: string;  // Short text snippet (~200 chars) from the chunk
}[]
```

Rendered in the UI as a "Recommended reading" card with an excerpt and
"Open documentation →" link per entry.

### Rule: regenerate if no chunks matched

If a question has an `explanation` but no `explanationSources` (or sources with no URLs),
it means the explanation was generated without vector search context — regenerate it
once the vector store is rebuilt.

---

## Data Sources

### Source A — Firecrawl JSON (doc.sitecore.com)

- **Location:** `data-pipelines/data/markdown-to-embeddings/output/` (326 files)
- **Format:** `{ markdown: string, metadata: { sourceURL, title, description, ... } }`
- **Coverage:** Sitecore XP Headless Development docs — JSS v22, Next.js, GraphQL,
  Layout Service, placeholders, caching, code-first workflow, etc.
- **URL source:** `metadata.sourceURL` → e.g. `https://doc.sitecore.com/xp/en/developers/hd/22/sitecore-headless-development/placeholders.html`
- **Status:** Already scraped. MongoDB data was lost — files need to move back to `input/` and be re-embedded.

### Source B — XM Cloud Accelerate Markdown (developers.sitecore.com)

- **Location:** `data/sources/xm-cloud-accelerate/` (92 files)
- **Format:** Markdown with YAML frontmatter (`title`, `description`, `audience`, `lastUpdated`, etc.)
- **Coverage:** XM Cloud Accelerate Cookbook — project setup, component design, deployment,
  content authoring, serialization, personalization, forms, search, etc.
- **URL source:** Derived from file path relative to `data/sources/xm-cloud-accelerate/`
  using `--base-url https://developers.sitecore.com/learn/accelerate/xm-cloud`
  e.g. `pre-development/sprint-zero/project-solution-setup.md` →
  `https://developers.sitecore.com/learn/accelerate/xm-cloud/pre-development/sprint-zero/project-solution-setup`
- **Status:** Ready. Copied from `Sitecore/developer-portal` repo (sparse checkout, then extracted).
  Only the `xm-cloud/` subtree was kept — everything else was discarded.

### Existing Questions

- **Exam JSON:** `data/exams/sitecore-xmc.json` — questions without explanations
- **Source questions:** `data/sources/questions/sitecore-xm-cloud-practice-exam.json`
- **Previously enriched:** `data/important-questions-flat.json` — have `explanation` + `study`
  but `study` entries lack `url` fields (generated before vector store had URLs). These
  questions need regeneration.

---

## Target Output Format

Enriched questions must match `ExternalQuestion` (from both
`data-pipelines/src/schemas/external-question.ts` and `types/external-question.ts`):

```ts
{
  question: string
  options: { A: string; B: string; C: string; D: string }
  answer: 'A' | 'B' | 'C' | 'D' | ('A' | 'B' | 'C' | 'D')[]
  question_type?: 'single' | 'multiple'
  explanation?: string                 // markdown, 2-4 sentences
  explanationSources?: {               // from matched chunk metadata
    url?: string
    title?: string
    sourceFile: string
    sectionPath?: string
  }[]
  study?: {
    chunkId: string                    // "{sourceBasename}-{chunkIndex}"
    url?: string                       // live doc URL
    anchor?: string
    excerpt?: string                   // first ~200 chars of chunk text
  }[]
}
```

---

## Pipeline Steps

### Step 1 — Restore Firecrawl Docs to Pipeline Input

The 326 Firecrawl JSON files are in `output/` (processed before data loss).
Move them back to `input/` so they are re-embedded.

```bash
mv data-pipelines/data/markdown-to-embeddings/output/*.json \
   data-pipelines/data/markdown-to-embeddings/input/
```

### Step 2 — Embed Firecrawl JSON Docs (Pass 1)

With the 326 Firecrawl JSON files restored to `input/`, run the pipeline first so it
processes them and moves them to `output/` before the markdown files are added.

```bash
cd data-pipelines
pnpm markdown-to-embeddings --group sitecore-xp-headless-docs
```

### Step 3 — Stage and Embed XM Cloud Accelerate Markdown (Pass 2)

**Important — URL derivation:** `extractUrlFromPath()` computes URLs relative to the
top-level `input/` directory. Files must be copied **directly into `input/`** (not a
subdirectory), otherwise the subdirectory name appears in the URL.

```
input/pre-development/sprint-zero/project-solution-setup.md
  → https://developers.sitecore.com/learn/accelerate/xm-cloud/pre-development/sprint-zero/project-solution-setup ✓

input/xm-cloud-accelerate/pre-development/...  ← WRONG, adds extra segment
```

Copy directly into `input/`:

```bash
cp -r data/sources/xm-cloud-accelerate/. \
      data-pipelines/data/markdown-to-embeddings/input/
```

Then run with the correct `--base-url` and a dedicated group:

```bash
pnpm markdown-to-embeddings \
  --base-url https://developers.sitecore.com/learn/accelerate/xm-cloud \
  --group xmc-accelerate
```

Pipeline will:
- Chunk each document with `RecursiveCharacterTextSplitter` (1500 chars, 200 overlap)
- Attach `sectionPath` and `nearestHeading` per chunk
- Generate OpenAI embeddings (`text-embedding-3-small`, 1536 dims)
- Upsert `EmbeddingChunkDocument` records into MongoDB with `url`, `title`, `sourceBasename`
- Move processed files to `output/`

Total: ~418 documents, estimated several hundred chunks each.

### Step 4 — Build `enrich-questions` Pipeline

Create a new pipeline at `data-pipelines/src/pipelines/enrich-questions/`.
This mirrors the logic in `lib/server/explanation-generator.ts` but runs as a
batch CLI script against a questions JSON file rather than a single HTTP request.

#### `config.ts`

- Input: path to questions JSON (default: `data/exams/sitecore-xmc.json`)
- Output dir: `data-pipelines/data/enrich-questions/output/`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (same as embeddings pipeline)
- RPC: `search_quiz_documents(p_embedding, p_top_k, p_group_ids)` — mirrors `lib/server/documents-search.ts`
- Top-K per search: `5` (question embedding) + `5` (answer embedding) = 10 candidates
- Max docs after rebuild: `3`
- LLM: OpenRouter (same client as `markdown-to-json`)
- Flag: `--skip-existing` to skip questions that already have valid sources

#### `index.ts` — main logic

For each question:

1. **Check skip condition** — if `--skip-existing` and question already has
   `explanation` + `explanationSources` with at least one `url`, skip it
2. **Embed question text** — `createEmbedding(question.question)`
3. **Embed correct answer** — `createEmbedding(options[answer])`
4. **Vector search** — call `search_quiz_documents` RPC on Supabase for top-5 chunks
   per embedding (10 total). This replicates `searchSimilarDocuments()` from
   `lib/server/documents-search.ts` using the pipeline's own Supabase client
   (cannot import from the Next.js app directly)
5. **Rebuild documents** — group by `sourceFile`, merge overlapping text, take top 3
   (mirrors `rebuildDocumentsFromChunks()` in `lib/server/explanation-generator.ts`)
6. **Generate explanation** — call LLM with rebuilt doc text + question context
7. **Build output fields:**
   - `explanation` — LLM response text
   - `explanationSources` — `processedChunks.map(c => ({ url: c.url, title: c.title, sourceFile: c.sourceFile, sectionPath: c.sectionPath }))`
   - `study` — one entry per unique source:
     ```json
     {
       "chunkId": "{sourceBasename}-{chunkIndex}",
       "url": "{chunk.url}",
       "excerpt": "{first 200 chars of chunk text}"
     }
     ```

#### `prompts.ts`

```
System:
You are a Sitecore XM Cloud certification exam assistant.

Given a multiple-choice question and relevant documentation excerpts, write a concise
explanation (2–4 sentences) that:
1. States clearly why the correct answer is right
2. Briefly explains why the other options are incorrect
3. References the source documentation by name where appropriate

Rules:
- Use only the provided documentation excerpts. Do not invent facts.
- Format: plain markdown, no headers.
- Be specific and technical — this is for a developer certification exam.

User:
Question: {question}
Correct answer: {answer} — {answerText}
Other options: {distractors}

Documentation:
{chunksFormatted}
```

### Step 5 — Run Enrichment and Review

```bash
cd data-pipelines
pnpm enrich-questions \
  --input ../data/exams/sitecore-xmc.json \
  --skip-existing
```

Output: `data-pipelines/data/enrich-questions/output/enriched-questions.json`

Spot-check:
- Explanations cite real doc content and are technically accurate
- `explanationSources[].url` resolves to a live Sitecore doc page
- `study[].url` matches the same doc
- `study[].excerpt` is a meaningful snippet (not navigation boilerplate)

### Step 6 — Import Enriched Questions

Use the `/import` UI or API:

```bash
curl -X POST "http://localhost:3000/api/exams/sitecore-xmc/questions/import" \
  -H "Content-Type: application/json" \
  -d @data-pipelines/data/enrich-questions/output/enriched-questions.json
```

Or via the web UI at `/import`:
1. Paste `enriched-questions.json`
2. Select exam: `sitecore-xmc`
3. Check: ☑ Generate embeddings, ☑ Auto-assign competencies
4. Click "Import Questions"

---

## File Structure After Completion

```
data/
  sources/
    xm-cloud-accelerate/       ← 92 XM Cloud Accelerate .md files (clean, no git)
      pre-development/
      implementation/
      optimization/
      final-steps/
      appendix-i/
      appendix-ii/

data-pipelines/
  src/
    pipelines/
      enrich-questions/        ← NEW
        config.ts
        index.ts
        prompts.ts
      markdown-to-embeddings/  ← existing (unchanged)
      markdown-to-json/        ← existing (unchanged)
  data/
    markdown-to-embeddings/
      input/                   ← empty after run
      output/                  ← all ~418 processed docs
    enrich-questions/          ← NEW
      output/
        enriched-questions.json
```

---

## Implementation Notes

### URL Derivation for Accelerate Docs

`extractUrlFromPath()` in `data-pipelines/src/shared/utils/file-utils.ts` computes the
URL as `relative(baseInputDir, filePath)` + base URL, where `baseInputDir` is always the
top-level `input/` directory (hardcoded in the pipeline's `main()`).

By copying files directly into `input/` (no subdirectory), a file at:
```
input/pre-development/sprint-zero/project-solution-setup.md
```
produces:
```
https://developers.sitecore.com/learn/accelerate/xm-cloud/pre-development/sprint-zero/project-solution-setup
```
which matches the live site URL. This is why Steps 2 and 3 are run as separate passes.

### Regeneration Condition

A question needs enrichment (or re-enrichment) if any of these are true:
- No `explanation`
- Has `explanation` but `explanationSources` is empty or missing
- Has `study` entries with no `url` fields (generated before URLs were in the vector store)

### Supabase Vector Search

The enrichment pipeline calls the `search_quiz_documents` RPC on Supabase, which
performs pgvector similarity search on `quiz.document_chunks`. Verify the RPC and
the vector index on the `embedding` column exist before running Step 4.

The pipeline creates its own Supabase client using the unscoped admin credentials
(same pattern as `lib/server/documents-search.ts`) since it cannot import from
the Next.js app at runtime.

### LLM Choice

Recommended models for explanation quality (via OpenRouter):
- `anthropic/claude-3.5-sonnet` — highest quality, most accurate citations
- `google/gemini-2.0-flash-exp:free` — free tier, good quality for bulk runs
- `openai/gpt-4o-mini` — cost-effective middle ground

---

## Completion Status (2026-03-12)

### Done
- 325 Firecrawl docs embedded → `quiz.document_chunks` (group: `sitecore-xp-headless-docs`)
- 92 XM Cloud Accelerate docs embedded → `quiz.document_chunks` (group: `xmc-accelerate`)
- 652 questions seeded to `quiz.questions` via `pnpm seed:exams:supabase`
- 418/652 questions fully enriched (explanation + explanationSources + study) and applied to Supabase
- `scripts/apply-enriched-questions.ts` — script to apply enriched output directly to Supabase

### Remaining: 234 questions need enrichment

Questions 419–652 in `data/exams/sitecore-xmc.json` have pre-existing explanations but no
`explanationSources` or `study` links. OpenRouter credits were exhausted mid-run.

To complete:
```bash
# 1. Top up OpenRouter credits at https://openrouter.ai/settings/credits
# 2. Re-run from the enriched output (--skip-existing skips the 418 already done)
cd data-pipelines
pnpm enrich-questions \
  /path/to/enriched-sitecore-xmc.json \
  --skip-existing \
  --exam sitecore-xmc

# 3. Apply to Supabase
pnpm apply:enriched-questions
```

Alternatively, use `pnpm generate:explanations --exam sitecore-xmc` which uses the app's
`generateQuestionExplanation` function (goes through the configured LLM client/Portkey).
