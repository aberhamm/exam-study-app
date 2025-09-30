# Operational Scripts

This project includes a set of typed Node scripts for seeding data, migrating legacy layouts, generating embeddings, and auditing status. All scripts read configuration from the same environment variables as the app.

Environment prerequisites

- Required: `MONGODB_URI`, `MONGODB_DB`, `MONGODB_EXAMS_COLLECTION`, `MONGODB_QUESTIONS_COLLECTION`
- Embeddings: `OPENAI_API_KEY`, `MONGODB_QUESTION_EMBEDDINGS_COLLECTION`, optional `MONGODB_QUESTION_EMBEDDINGS_VECTOR_INDEX`, `QUESTIONS_EMBEDDING_MODEL`, `QUESTIONS_EMBEDDING_DIMENSIONS`

Run scripts with `pnpm` commands provided in `package.json`.

Seed Exams (metadata + questions)

- File: `scripts/seed-exams.ts`
- Command: `pnpm seed:exams`
- Purpose: Load JSON exams from `data/exams/`, validate against `ExamDetailZ`, and upsert:
  - Exam metadata into `MONGODB_EXAMS_COLLECTION` (no embedded questions)
  - Questions into `MONGODB_QUESTIONS_COLLECTION` with stable `id`
- Safety: Preserves existing `explanation` fields. On update, does not overwrite explanation; it is set only when inserting a new question.
- Typical use:
  - Onboard a new exam JSON file into both collections.
  - Refresh question text/options/answers while keeping curated explanations in DB.

Migrate Embedded Questions → Collection

- File: `scripts/migrate-questions-to-collection.ts`
- Command: `pnpm migrate:questions`
- Purpose: One-time migration of legacy embedded `exams.questions[]` into the dedicated questions collection.
- Behavior:
  - Upserts each embedded question as a `{ examId, id }` document
  - Creates necessary indexes on the questions collection
  - Sets `legacyQuestionsMigrated: true` on each processed exam
  - Does NOT overwrite existing `explanation` on updates (explanation is set via `$setOnInsert` only)
- Typical use:
  - Prepare a legacy database to the current architecture where questions live in their own collection.

Sync From Legacy (no explanation overwrites)

- File: `scripts/sync-questions-from-legacy.ts`
- Command: `pnpm sync:questions [--exam <examId>] [--dry-run] [--overwrite] [--insert-only]`
- Purpose: Reconcile the dedicated questions collection from the legacy embedded array, without overwriting explanations.
- Flags:
  - `--exam <id>`: Restrict to a single exam
  - `--dry-run`: Show planned actions without writing
  - `--overwrite`: Overwrite non-explanation fields if they differ (explanations still preserved)
  - `--insert-only`: Insert missing questions only (default behavior if `--overwrite` is not set)
- Output:
  - Logs inserts, diffs, and `[SKIP-EXPL]` whenever explanations differ but are preserved.
- Typical use:
  - After editing a legacy JSON/embedded source, update the new questions collection without risking curated explanations.

Remove Legacy Embedded Questions (clean up)

- File: `scripts/remove-legacy-embedded-questions.ts`
- Command: `pnpm remove:legacy-questions [--exam <examId>] [--dry-run]`
- Purpose: Permanently unset the legacy `questions` array from exam documents.
- Behavior:
  - Unsets the `questions` field and marks `legacyQuestionsMigrated: true`, updates `updatedAt`.
- Typical use:
  - Final clean-up once migration and verification are complete.

Generate Question Embeddings

- File: `scripts/embed-questions.ts`
- Command: `pnpm embed:questions [--exam <examId>] [--limit <n>] [--batch <n>] [--recompute]`
- Purpose: Create vector embeddings for questions to support semantic search.
- Requirements:
  - `OPENAI_API_KEY` set, and embeddings collection configured via `MONGODB_QUESTION_EMBEDDINGS_COLLECTION`
  - Optional: `QUESTIONS_EMBEDDING_MODEL` (default `text-embedding-3-small`), `QUESTIONS_EMBEDDING_DIMENSIONS`
- Flags:
  - `--exam <id>`: Limit to an exam
  - `--limit <n>`: Limit number of questions processed
  - `--batch <n>`: Batch size for API calls (default 16)
  - `--recompute`: Recompute embeddings even if present
- Typical use:
  - After adding/importing questions, generate or refresh embeddings for search.

Migrate Embeddings To Collection

- File: `scripts/migrate-embeddings-to-collection.ts`
- Command: `pnpm migrate:embeddings [--unset-in-questions]`
- Purpose: Move embeddings stored on question documents into a separate embeddings collection.
- Flags:
  - `--unset-in-questions`: Remove `embedding*` fields from `MONGODB_QUESTIONS_COLLECTION` after migration
- Typical use:
  - Consolidate embeddings into a dedicated collection for vector index alignment and smaller question docs.

Aggregate Questions/Embeddings Status

- File: `scripts/agg-questions-status.ts` (Node-compatible output also in `.mjs`)
- Command: `pnpm status:questions`
- Purpose: Print a per-exam summary table with question counts, embedding counts, and latest update timestamps.
- Typical use:
  - Sanity-check migration/embedding coverage and identify exams missing embeddings.

Recommended workflows

1) Initial migration from legacy embedded arrays
- `pnpm migrate:questions`
- Optional preview: `pnpm sync:questions --dry-run`
- Optional reconcile: `pnpm sync:questions --overwrite`
- Clean up: `pnpm remove:legacy-questions`

2) Onboarding a new exam JSON
- Place file in `data/exams/` (e.g., `my-exam.json`)
- `pnpm seed:exams`
- `pnpm embed:questions --exam my-exam`
- `pnpm status:questions`

3) Updating questions text/options
- Update source JSON; run `pnpm seed:exams` (explanations preserved)
- Re-embed with `pnpm embed:questions --exam <id> --recompute` if needed

