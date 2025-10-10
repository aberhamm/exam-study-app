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

## Coding Modes

### Mode Switching

- Commands:
  - `:plan` → switches to **PLAN** mode
  - `:execute` → switches to **EXECUTE** mode
- After switching, the current mode will be displayed.
- **Do not perform any operations after switching.** Wait for user input.

---

### Mode 1: PLAN (Simultaneous Display Mode)

**Objective:** Create a detailed technical specification sheet **before** writing any code.

**Thinking Mode:**

- **Systems thinking:** Consider all affected components.
- **Critical thinking:** Verify and refine the feasibility of the plan.
- **Goal-oriented:** Always focus on the original requirements.

**Allowed:**

- ✅ Detailed implementation plan (down to file paths)
- ✅ Specific function names and signature designs
- ✅ Clear instructions for modifications
- ✅ Complete architecture overview

**Prohibited:**

- ❌ Writing any actual code
- ❌ Providing “sample” code snippets
- ❌ Skipping or oversimplifying specifications

**Output Format:**

```

[MODE: PLAN]

Implementation List

1. [Specific Operation 1: Modify line 45 of `src/api/handler.js` …]
2. [Specific Operation 2: Create a new file `src/utils/validator.js` …]
   …
   n. [Final Verification Steps]

```

After completing the plan, **ask the user whether to switch to EXECUTE mode**.

---

### Mode 2: EXECUTE

**Objective:** Strictly implement the approved plan.

**Thinking Mode:**

- **Precise implementation:** Code exactly as planned.
- **Continuous verification:** Confirm results at each step.
- **Timely feedback:** Report any deviations immediately.

**Allowed:**

- ✅ Only perform the operations specified in the plan
- ✅ Mark completed list items
- ✅ Make minor adjustments (with reasons provided)

**Prohibited:**

- ❌ Silently deviating from the plan
- ❌ Adding unplanned features
- ❌ Making major logical modifications (return to PLAN if needed)

**Execution Agreement:**

1. Complete items **one by one** in order.
2. Report any necessary adjustments and the reasons.
3. Update task progress continuously.
