# Repository Guidelines

## Project Structure & Module Organization
Central Next.js routes live in `app/` (`layout.tsx`, `page.tsx`, hooks like `useQuestions.ts`). Feature-focused UI sits in `components/`; shared context providers in `contexts/`; utilities in `lib/`; strict types in `types/`. Quiz seed data and scenarios live under `data/`; static assets in `public/`; long-form docs in `docs/`. The `data-pipelines/` workspace transforms markdown into the JSON consumed by the app.

## Build, Test, and Development Commands
- `pnpm install` bootstraps root and workspace dependencies.
- `pnpm dev` runs Next.js with Turbopack; `pnpm build` plus `pnpm start` serve the production bundle.
- `pnpm lint` enforces the Next core web vitals ESLint ruleset.
- `pnpm --filter data-pipelines markdown-to-json data/input/demo.md` converts sample markdown; swap in `markdown-to-embeddings` when generating vectors.

## Coding Style & Naming Conventions
TypeScript runs in strict mode, so annotate props, context values, and pipeline outputs. Name React components, providers, and files with PascalCase; keep hooks, helpers, and pipeline functions camelCase. Favor functional components, Tailwind utility classes, and the `@/` alias instead of deep relative imports. ESLint governs formatting expectations—use two-space indentation, inline JSX props when short, and eliminate unused exports before committing.

## Testing Guidelines
Automated tests are not yet present, so lean on `pnpm lint` and TypeScript for fast feedback. Exercise critical quiz flows manually via `pnpm dev`, covering timer behavior, question selection, and markdown-driven content. For pipelines, direct output to `data/output/`, spot-check schema compliance, and re-run conversions whenever source markdown changes.

## Commit & Pull Request Guidelines
Recent history favors concise Conventional Commit prefixes (`feat:`, `fix:`, `refactor:`) with imperative verbs. Keep commits focused on a single change surface and include any updated assets or dataset snapshots. Pull requests should outline the problem, summarize the solution, list verification steps, and link tracking issues or specs. Attach before/after screenshots or sample JSON when the reviewer needs context.

## Data Pipelines & Configuration
Copy `data-pipelines/.env.example` to `.env` and supply keys such as `OPENROUTER_API_KEY` before running conversion or embedding scripts. Pipeline outputs in `data/output/` are ignored by git; promote curated artifacts into `data/` once reviewed. When onboarding new study sets, process the markdown through the pipeline, validate the JSON locally, then reference it from the quiz app.
