# Explanation Pipeline

How AI-generated explanations work — architecture, prompt design decisions, and operational guidance.

---

## Architecture

Generating an explanation involves three stages:

```
Question + embedding
        ↓
  Vector search (RAG)
        ↓
  Retrieved document chunks
        ↓
  LLM prompt (question + correct answer + chunks)
        ↓
  Explanation text   +   Sources list (separate)
        ↓                       ↓
  questions.explanation   questions.explanation_sources
```

### Key separation: text vs. sources

The explanation text and the sources list are **stored and rendered separately**.

- **`explanation`** — plain Markdown prose. Must not contain embedded hyperlinks or URLs.
- **`explanation_sources`** — array of `{ url, title, sourceFile, sectionPath }` objects, populated from the RAG chunks *before* the LLM is called. The LLM never influences what goes into sources.

In the UI, `QuestionCard` renders these independently:

```tsx
<MarkdownContent variant="explanation">{question.explanation}</MarkdownContent>
<ExplanationSourcesList sources={question.explanationSources} />
```

`ExplanationSourcesList` renders each source as a labelled link using `s.url`. It has no dependency on the explanation text.

**Why this matters:** The old prompt asked the LLM to embed inline citation links into the explanation markdown. This was redundant (sources are already stored separately), error-prone (LLMs invent or mis-attribute URLs), and coupled the explanation text to specific URLs that could go stale. The prompt was updated to explicitly prohibit embedded links.

---

## Prompt design

The system prompt lives in `lib/server/explanation-generator.ts` → `generateExplanationWithLLM`.

### What the prompt asks for

- Teach why the correct answer is correct, using only the provided documentation
- Briefly explain why the most tempting wrong answer is wrong
- 120–200 words, Markdown, bold key terms
- No filler, no chit-chat, no restating choices

### Hard rules (and why they exist)

| Rule | Reason |
|------|--------|
| Do not embed hyperlinks or URLs | Sources are stored in `explanation_sources` and rendered separately |
| Do not invent examples, APIs, UI names, or commands | Prior prompts that asked for "a practical code snippet" produced hallucinated product behavior, invented tab names, and fake GraphQL mutations |
| Do not teach the whole topic | Models tend to broaden into mini-articles; every sentence should justify the specific correct answer |
| Every sentence must help the student understand why *this* answer is correct | Prevents generic conceptual filler that is technically true but not useful for the question |

### What not to add back

- **Code blocks / snippets** — these were in an earlier version of the prompt and were the primary source of hallucinated examples
- **Inline citation links** — see separation section above
- **"Include a practical use-case example"** — same problem as code blocks; models invent scenarios not grounded in the documentation

---

## Routing

LLM calls route through either **OpenRouter** or **Portkey** depending on feature flags.

```
USE_PORTKEY=false  →  OpenRouter  (OPENROUTER_MODEL)
USE_PORTKEY=true   →  Portkey     (PORTKEY_MODEL_EXPLANATION or PORTKEY_MODEL)
```

Embeddings always use OpenAI directly regardless of `USE_PORTKEY`.

Relevant env vars:

```
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
PORTKEY_MODEL_EXPLANATION=us.anthropic.claude-sonnet-4-20250514-v1:0
```

---

## Choosing a model

Use the model comparison script to evaluate candidates before changing the production model:

```bash
pnpm compare:models
pnpm compare:models --exam sitecore-xmc --limit 10
pnpm compare:models --models "anthropic/claude-3-5-haiku,google/gemini-2.0-flash-001,qwen/qwen3.5-35b-a3b"
pnpm compare:models --output results/comparison.json
```

The script (`scripts/compare-models.ts`):
- Fetches real questions from Supabase
- Runs them through all models concurrently via OpenRouter
- Uses the same prompt structure as the production generator (no RAG context, since the script is standalone)
- Reports latency, token usage, and estimated cost per question and per 1k questions
- Per-model prompt suffixes can be added in `MODEL_SUFFIXES` to test whether tighter instructions improve a specific model

**Note on Qwen3 models:** Qwen3/3.5 models use a thinking/reasoning mode by default. The script disables this with `reasoning: { exclude: true }` in the request body. Without this, the model consumes its token budget on internal reasoning and returns blank or truncated output.

### Pricing reference (as of 2026-03)

| Model | Input $/MTok | Output $/MTok |
|-------|-------------|---------------|
| `anthropic/claude-3.5-sonnet` | $3.00 | $15.00 |
| `anthropic/claude-3-5-haiku` | $0.80 | $4.00 |
| `google/gemini-2.0-flash-001` | $0.10 | $0.40 |
| `qwen/qwen3.5-9b` | $0.10 | $0.15 |
| `qwen/qwen3.5-35b-a3b` | $0.16 | $1.30 |

The pricing table in `scripts/compare-models.ts` is the authoritative reference — update it there when prices change.

---

## Regenerating explanations

### Generate missing explanations

```bash
pnpm generate:explanations
pnpm generate:explanations --exam sitecore-xmc
```

### Regenerate all explanations (e.g. after a prompt change)

```bash
pnpm generate:explanations --recompute --exam sitecore-xmc
```

Before overwriting, `--recompute` saves the current explanation to `explanation_history` on the question row, so nothing is permanently lost.

### After a prompt change

When the system prompt in `explanation-generator.ts` is updated, run `--recompute` to bring existing explanations in line. The most recent prompt change removed inline citation links and added anti-hallucination rules — any explanation generated before that change may contain embedded links or invented examples.

---

## Files

| File | Role |
|------|------|
| `lib/server/explanation-generator.ts` | Core pipeline: RAG retrieval, prompt construction, LLM call |
| `lib/llm-client.ts` | Routes chat completions to OpenRouter or Portkey based on `USE_PORTKEY` |
| `lib/server/documents-search.ts` | Vector search for relevant document chunks |
| `components/ExplanationSources.tsx` | Renders `explanation_sources` as a source list |
| `app/api/…/explain/route.ts` | API endpoint that triggers explanation generation from the UI |
| `scripts/generate-explanations.ts` | Batch script to generate/regenerate explanations |
| `scripts/compare-models.ts` | Model comparison tool |
