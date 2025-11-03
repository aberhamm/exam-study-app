# Generating Exam Questions from Important Documentation Sections

This guide explains how to automatically generate exam questions from sections marked as "Important" in the Sitecore XM Cloud documentation.

## Overview

The workflow consists of three main steps:

1. **Extract** important sections from markdown documentation
2. **Generate** exam questions using AI (via OpenRouter)
3. **Import** generated questions into MongoDB (with optional post-processing)

## Prerequisites

- OpenRouter API key set in `.env.local`:
  ```bash
  OPENROUTER_API_KEY=your-key-here
  OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free  # optional, defaults to this
  ```

- Documentation files in `data-pipelines/data/markdown-to-embeddings/output/`

## Step 1: Extract Important Sections

The extraction script scans all markdown files and identifies content marked as important:

- `<Alert status="warning">` components (critical warnings)
- `**IMPORTANT**` markers (standalone important notes)
- `<Alert status="info">` with technical details (contextual notes)

```bash
pnpm extract:important
```

**Output:** `data/important-sections.json`

This file contains structured data about each important section:
```json
{
  "sourceFile": "getting-component-specific-data.md",
  "title": "Getting Component Specific Data",
  "context": "Component Level Data Fetching",
  "content": "Because the getStaticProps and getServerSideProps...",
  "type": "warning-alert"
}
```

## Step 2: Generate Questions

The generation script uses OpenRouter to create 1-3 exam questions for each important section:

```bash
# Generate questions for all sections
pnpm generate:important-questions

# Test with a limited number (e.g., first 3 sections)
pnpm generate:important-questions --limit 3

# Dry run (no API calls, just preview)
pnpm generate:important-questions --dry-run
```

**Output:**
- `data/generated-important-questions.json` (detailed with metadata)
- `data/important-questions-flat.json` (flat array ready for import)

### Generated Question Format

Each question includes:
- Clear, unambiguous question text
- 4 options (A, B, C, D)
- Single or multiple-select type
- Detailed explanation referencing the source
- Study link back to the documentation

Example:
```json
{
  "question": "What is the security concern with component-level getStaticProps?",
  "question_type": "single",
  "options": {
    "A": "It exposes secrets in the client bundle",
    "B": "It requires authentication",
    "C": "It's slower than page-level",
    "D": "It doesn't support TypeScript"
  },
  "answer": "A",
  "explanation": "Component-level getStaticProps functions are included...",
  "study": [
    {
      "chunkId": "getting-component-specific-data-important",
      "excerpt": "Do not include any secrets or sensitive information..."
    }
  ]
}
```

## Step 3: Import Questions

### Using the Web UI (Recommended)

Navigate to [`/import`](http://localhost:3000/import) and:

1. Select your exam from the dropdown
2. Paste the contents of `data/important-questions-flat.json`
3. Check the optional processing boxes:
   - ☑ **Generate embeddings** - Creates vector embeddings for semantic search
   - ☑ **Auto-assign competencies** - Uses AI to assign related competencies

4. Click "Import Questions"

The UI will show progress for each step:
- ✓ Imported N questions
- ✓ Generated N embeddings
- ✓ Assigned competencies to N questions

### Using the API

```bash
# Basic import (no post-processing)
curl -X POST "http://localhost:3000/api/exams/sitecore-xmc/questions/import" \
  -H "Content-Type: application/json" \
  -d @data/important-questions-flat.json

# Then manually process (optional)
curl -X POST "http://localhost:3000/api/exams/sitecore-xmc/questions/process" \
  -H "Content-Type: application/json" \
  -d '{
    "questionIds": ["id1", "id2", "id3"],
    "generateEmbeddings": true,
    "assignCompetencies": true,
    "competencyOptions": {
      "topN": 1,
      "threshold": 0.5,
      "overwrite": false
    }
  }'
```

### What Happens During Import

1. **Import** - Questions are validated and inserted into the database
2. **Embeddings** (if enabled) - Vector embeddings created for each question
3. **Competencies** (if enabled) - AI finds similar competencies and assigns them automatically

Note: Competency assignment requires:
- Embeddings to exist (generated in step 2)
- Competencies defined in your database
- Vector index configured on the competencies collection

## Customization

### Extraction Patterns

Edit `scripts/extract-important-sections.ts` to adjust:
- Regular expressions for finding important sections
- Context extraction (section headings)
- Filtering criteria (minimum length, keywords)

### Question Generation

Edit `scripts/generate-questions-from-important.ts` to customize:
- The AI prompt template
- Number of questions per section (currently 1-3)
- Question difficulty or style
- LLM model selection (OpenRouter or Portkey)

**Environment Variables:**
- When `USE_PORTKEY=true`: Uses Portkey with `PORTKEY_API_KEY` (Model Catalog recommended)
- When `USE_PORTKEY` is not set: Uses OpenRouter with `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`

### Recommended Models

- `google/gemini-2.0-flash-exp:free` - Fast, free, good quality (OpenRouter)
- `anthropic/claude-3.5-sonnet` - Higher quality, costs per token (OpenRouter)
- `meta-llama/llama-3.1-70b-instruct` - Good balance (OpenRouter)
- `gpt-4o-mini` - Good quality, cost-effective (Portkey/OpenAI)

## Tips

1. **Start small**: Use `--limit 5` to test with a few sections first
2. **Review output**: Check `important-questions-flat.json` before importing
3. **Iterate prompts**: Adjust the prompt template if questions aren't meeting quality standards
4. **Cost monitoring**: OpenRouter provides free models, but track usage for paid ones
5. **Version control**: Consider committing generated questions for review

## Troubleshooting

### No sections found
- Check that markdown files contain `<Alert status="warning">` or `**IMPORTANT**` markers
- Verify the docs directory path in the extraction script

### Invalid questions generated
- Questions are validated with Zod; invalid ones are skipped
- Check console output for validation errors
- Adjust the AI prompt to be more specific

### API rate limits
- The script includes 1-second delays between requests
- For large batches, consider using `--limit` in multiple runs

## Example Workflow

### Complete Workflow (CLI + UI)

```bash
# 1. Extract important sections from docs
pnpm extract:important
# Output: Found 31 important sections

# 2. Review what was found (optional)
cat data/important-sections.json
# Shows: source file, title, context, content for each section

# 3. Generate questions (test with a few first)
pnpm generate:important-questions --limit 5
# Output: Generated 8-15 questions from 5 sections

# 4. Review generated questions (optional)
cat data/important-questions-flat.json
# Shows: question, options, answer, explanation for each

# 5. Import via web UI
# Navigate to http://localhost:3000/import
# - Paste contents of data/important-questions-flat.json
# - Select exam: "sitecore-xmc"
# - Check: ☑ Generate embeddings
# - Check: ☑ Auto-assign competencies
# - Click "Import Questions"
# Result: Questions imported, embeddings created, competencies assigned

# 6. Generate remaining questions
pnpm generate:important-questions
# Processes all 31 sections

# 7. Import the rest
# Repeat step 5 with updated data/important-questions-flat.json
```

### Quick Workflow (CLI Only)

```bash
# Extract and generate
pnpm extract:important
pnpm generate:important-questions

# Import via API (no post-processing)
curl -X POST "http://localhost:3000/api/exams/sitecore-xmc/questions/import" \
  -H "Content-Type: application/json" \
  -d @data/important-questions-flat.json

# Manually run embeddings and competencies
pnpm embed:questions --exam sitecore-xmc
pnpm assign:competencies --exam sitecore-xmc
```

## Integration with Existing Questions

Generated questions:
- Use the same schema as manually created questions
- Generate stable IDs based on content hash
- Support both single and multiple-select types
- Include study materials linking back to docs
- Preserve explanations on re-import

This ensures seamless integration with your existing question management workflow.
