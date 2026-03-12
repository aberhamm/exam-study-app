# Supabase Migration Plan

## Background

The MongoDB droplet was accidentally deleted. The quiz content has been recovered from local sources
and seeded into a new Supabase (`quiz` schema) PostgreSQL database. The app still reads/writes
from MongoDB — this plan tracks what's left to complete the migration.

---

## Status

| Step | Status |
|---|---|
| Recover question sources | ✅ Done |
| Merge & generate exam JSON | ✅ Done — 652 questions in `data/exams/sitecore-xmc.json` |
| Design `quiz` schema | ✅ Done — `supabase-quiz-schema.sql` |
| Apply schema migration | ✅ Done |
| Seed questions via `pnpm seed:exams:supabase` | ✅ Done — 652 questions in Supabase |
| Change dev port to 3100 | ✅ Done |
| Expose `quiz` schema in Supabase dashboard | ✅ Done — migration `20260311203748` |
| Add vector search RPC functions | ✅ Done — migration `quiz_vector_search_rpcs` |
| Migrate app data layer (MongoDB → Supabase) | ✅ Done — all 8 files + prepare route |
| Seed document chunks | ⏳ Pending |
| Seed competencies | ⏳ Pending |
| Generate explanations for remaining questions | ⏳ Pending — blocked on document chunks + competencies |
| Remove MongoDB dependency | ⏳ Pending (last step) |

---

## Manual Steps Required

### 1. Update Supabase auth redirect URLs

The app port changed from `3000` → `3100`. Update allowed redirect URLs in:

- Supabase Dashboard → **Authentication → URL Configuration**
  - Site URL: `http://localhost:3100`
  - Redirect URLs: add `http://localhost:3100/**`

---

## Data Layer Migration (completed)

All files migrated. Exported function signatures preserved — API routes required minimal changes.

| File | Status |
|---|---|
| `lib/server/db.ts` | ✅ New Supabase admin client singleton |
| `lib/server/exams.ts` | ✅ Migrated |
| `lib/server/questions.ts` | ✅ Migrated; ObjectId → UUID |
| `lib/server/questions-search.ts` | ✅ `$vectorSearch` → `search_quiz_questions` RPC |
| `lib/server/documents-search.ts` | ✅ `$vectorSearch` → `search_quiz_documents` RPC |
| `lib/server/competencies.ts` | ✅ Migrated |
| `lib/server/competency-assignment.ts` | ✅ Migrated; ObjectId → UUID |
| `lib/server/explanation-generator.ts` | ✅ Delegates to `searchSimilarDocuments` |
| `app/api/exams/[examId]/questions/prepare/route.ts` | ✅ Migrated; `$sample` → JS shuffle |

### Known limitations post-migration

- **`avoidSimilar` / cluster filtering**: The `question_clusters` MongoDB collection was not migrated
  to Supabase. The `prepare` endpoint still accepts `avoidSimilar: true` but returns
  `excludedBySimilarity: 0` without filtering. Clusters are a rarely-used feature and the data is
  likely stale.

---

## Pending Data Seeding

### Document chunks (`quiz.document_chunks`)

325 pre-processed Sitecore doc pages are in:
```
data-pipelines/data/markdown-to-embeddings/output/
```

A new script (`scripts/seed-document-chunks-supabase.ts`) needs to be written to import these
into `quiz.document_chunks` with their embeddings.

### Competencies (`quiz.competencies`)

Competency definitions are in `data/sources/study-notes/competencies.md`.
A seeding script or admin UI flow needs to populate `quiz.competencies`.

### Question explanations

303 of 652 questions have explanations (generated from study notes).
The remaining 349 (from the original JSON/markdown sources) have no explanations.
Run `pnpm generate:explanations` once document chunks and competencies are seeded.

---

## Remove MongoDB

Once all of the above is complete:

1. Remove the `mongodb` package: `pnpm remove mongodb`
2. Delete `lib/server/mongodb.ts`
3. Remove MongoDB env vars from `.env.local` and `.env.example`
4. Archive or delete MongoDB-specific scripts in `scripts/`
