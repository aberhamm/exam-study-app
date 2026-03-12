# Supabase Migration Plan

## Background

The MongoDB droplet was accidentally deleted. Quiz content was recovered from local sources
and seeded into a new Supabase (`quiz` schema) PostgreSQL database.

---

## Overall Status

| Area | Status |
|---|---|
| Schema design & application | ✅ Done |
| App data layer (`lib/server/`) | ✅ Done |
| Document chunks embedded | ✅ Done — 2,687 chunks (2 groups) |
| Competencies seeded & embedded | ✅ Done — 8 competencies |
| Questions seeded | ✅ Done — 652 questions |
| Question embeddings | ✅ Done — 652 questions embedded |
| Competencies assigned to questions | ✅ Done — 652 questions assigned |
| Question sources (`explanationSources` + `study`) | ✅ Done — 652/652 questions have sources |
| Question explanations | ⚠️ Partial — 418/652 done, 234 pending LLM credits |
| API routes migrated | ⚠️ Partial — several routes still use MongoDB |
| MongoDB removed | ⏳ Blocked on API route migration |

---

## Quiz Data: Remaining Work

### 234 questions need explanations generated

Questions have basic explanations from the original exam JSON but no `explanationSources`
or `study` links. These need to be run through the enrichment pipeline.

**Pipeline (already built):**

```bash
cd data-pipelines

# Step 1 — DONE ✅
# Sources already found for all 234 questions.
# Output: data-pipelines/data/find-question-sources/output/sourced-enriched-sitecore-xmc.json
# (652 questions: 418 with existing enrichment untouched, 234 with new explanationSources + study)

# Step 2 — generate explanations (requires OpenRouter or Portkey credits)
pnpm generate-explanations \
  data/find-question-sources/output/sourced-enriched-sitecore-xmc.json \
  --skip-existing --exam sitecore-xmc

# Step 3 — apply to Supabase
cd .. && pnpm apply:enriched-questions \
  --input data-pipelines/data/generate-explanations/output/explained-sourced-enriched-sitecore-xmc.json
```

**Blocker:** OpenRouter credits exhausted. Options:
- Top up OpenRouter at openrouter.ai/settings/credits
- Configure Portkey (`PIPELINES_USE_PORTKEY=true`) as alternative

**Document groups:** The `sitecore-xmc` exam has both document groups configured
(`sitecore-xp-headless-docs`, `xmc-accelerate`). The `find-question-sources` pipeline
respects this automatically.

---

## API Routes: MongoDB Still Present

The `lib/server/` data layer is fully on Supabase. These API routes were not part of the
original migration and still import from `lib/server/mongodb`:

| Route | Method(s) | Notes |
|---|---|---|
| `app/api/exams/[examId]/route.ts` | PATCH | ✅ Fixed — now uses Supabase |
| `app/api/exams/[examId]/questions/route.ts` | GET, POST | ⏳ Pending |
| `app/api/exams/[examId]/questions/[questionId]/route.ts` | GET, PATCH, DELETE | ⏳ Pending |
| `app/api/exams/[examId]/questions/[questionId]/explanation/route.ts` | GET, POST | ⏳ Pending |
| `app/api/exams/[examId]/questions/[questionId]/explanation/history/route.ts` | GET | ⏳ Pending |
| `app/api/exams/[examId]/questions/[questionId]/explanation/revert/route.ts` | POST | ⏳ Pending |
| `app/api/exams/[examId]/questions/embed/route.ts` | POST | ⏳ Pending |
| `app/api/db-status/route.ts` | GET | ⏳ Pending (low priority) |
| `app/api/exams/[examId]/dedupe/` (all routes) | various | ⏳ Pending (feature may be retired) |

**Migration approach for each route:** Replace `getDb()` / `getQuestionsCollectionName()` from
`lib/server/mongodb` with the equivalent Supabase functions already in `lib/server/questions.ts`,
`lib/server/competencies.ts`, etc. ObjectIds become UUIDs.

---

## Scripts: MongoDB Still Present

These scripts are legacy and mostly obsolete now that Supabase is the source of truth.
They do not need to be migrated — they should be deleted or archived.

| Script | Disposition |
|---|---|
| `scripts/seed-exams.ts` | Superseded by `seed:exams:supabase` |
| `scripts/migrate-questions-to-collection.ts` | Obsolete |
| `scripts/migrate-embeddings-to-collection.ts` | Obsolete |
| `scripts/sync-questions-from-legacy.ts` | Obsolete |
| `scripts/remove-legacy-embedded-questions.ts` | Obsolete |
| `scripts/create-vector-index.ts` | Obsolete (Supabase has pgvector) |
| `scripts/create-competencies-vector-index.ts` | Obsolete |
| `scripts/create-document-embeddings-vector-index.ts` | Obsolete |
| `scripts/check-mongodb-connection.ts` | Obsolete |
| `scripts/check-vector-search.ts` | Obsolete |
| `scripts/agg-questions-status.ts` | Obsolete |
| `scripts/migrate-cluster-ids.ts` | Obsolete |
| `scripts/sync-competency-references.ts` | Obsolete |
| `scripts/find-question.ts` | Replace with Supabase query if still needed |
| `scripts/check-question-ids.ts` | Replace with Supabase query if still needed |
| `scripts/fix-question-index.ts` | Obsolete |
| `scripts/check-recent-questions.ts` | Obsolete |

---

## Removing MongoDB (final step)

Once the API routes above are migrated:

```bash
# Remove package
pnpm remove mongodb

# Delete server module
rm lib/server/mongodb.ts

# Delete obsolete scripts (see list above)

# Remove MongoDB env vars from .env.local and .env.example
# (MONGODB_URI, MONGODB_DB, MONGODB_*_COLLECTION, etc.)
```

---

## Infrastructure Notes

- **Schema:** `quiz` schema in Supabase project `ompkcxbssxfweeqwdibt`
- **Local schema file:** `supabase-quiz-schema.sql` (reference only — not used by migrations)
- **App port:** `3100` (changed from `3000` after migration)
- **Supabase auth redirect URLs:** Must include `http://localhost:3100/**`
- **Document groups for `sitecore-xmc`:** `sitecore-xp-headless-docs`, `xmc-accelerate`
