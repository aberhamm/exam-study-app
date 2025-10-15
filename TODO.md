# TODO List

## Next Up (Short-Term Plan)

- RAG/Explanation Pipeline
  - Admin tool to batch-generate missing explanations with a dry‑run cost estimate.

- Admin UX & DX
  - Explanation history audit UI (diff‑friendly view) in admin pages.
  - Gate noisy logs across explanation routes/generator behind `DEBUG_RETRIEVAL` or dev checks.

- API & Types
  - Audit remaining endpoints for strict parsing of `explanationSources` (avoid `unknown` casts).

- Docs & Config
  - Quick pass on `.env` docs to confirm alignment with hardcoded collection names and new flags (e.g., `USE_RAND_SORT_SAMPLING`).

## Mid-Term

- Bulk operations: batch assign competencies; batch embed/regenerate; show estimated token cost.
- Optional analytics: allow users to opt-in to send anonymized local metrics for aggregated insights.
- Study mode: delay correctness feedback; emphasize sources and explanations on demand.

## Future Enhancements

- Clustering improvements
  - Advanced cluster splitting algorithms (auto + manual tooling).
  - Cluster quality metrics (coherence scoring, validation).

- Exam management
  - Exam constraint enforcement: avoid highly similar items in a single quiz session; substitute on conflict.

- Analytics & Reporting
  - Clustering/duplication analytics dashboard (distribution, efficiency, trends).

## Performance & Background Work

- Background processor for cluster generation to avoid UI timeouts
  - Job queue (Mongo-backed), worker script, progress updates, non-blocking UI with polling, concurrent job support.
