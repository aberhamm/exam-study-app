# Generating Exam Questions from Important Documentation Sections

This guide explains how to automatically generate exam questions from sections marked as "Important" in the Sitecore XM Cloud documentation.

## Overview

The workflow consists of three steps:

1. **Extract** important sections from markdown documentation
2. **Generate** exam questions using AI (via OpenRouter)
3. **Import** generated questions into MongoDB

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

Use the existing import API to add questions to your exam:

```bash
# Via API
curl -X POST "http://localhost:3000/api/exams/sitecore-xmc/questions/import" \
  -H "Content-Type: application/json" \
  -d @data/important-questions-flat.json

# Or use the web UI at /import
```

The questions will be:
- Validated against your schema
- Assigned stable IDs
- Added to the questions collection
- Available immediately in your quiz app

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
- OpenRouter model selection

### Recommended Models

- `google/gemini-2.0-flash-exp:free` - Fast, free, good quality
- `anthropic/claude-3.5-sonnet` - Higher quality, costs per token
- `meta-llama/llama-3.1-70b-instruct` - Good balance

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

```bash
# 1. Extract important sections
pnpm extract:important

# 2. Review what was found
cat data/important-sections.json | jq 'length'
# Output: 7

# 3. Generate questions (test with 2 first)
pnpm generate:important-questions --limit 2

# 4. Review generated questions
cat data/important-questions-flat.json | jq 'length'
# Output: 3-6 (depending on AI output)

# 5. Import to database
curl -X POST "http://localhost:3000/api/exams/sitecore-xmc/questions/import" \
  -H "Content-Type: application/json" \
  -d @data/important-questions-flat.json

# 6. Generate the rest
pnpm generate:important-questions

# 7. Import all
# Repeat step 5 with full dataset
```

## Integration with Existing Questions

Generated questions:
- Use the same schema as manually created questions
- Generate stable IDs based on content hash
- Support both single and multiple-select types
- Include study materials linking back to docs
- Preserve explanations on re-import

This ensures seamless integration with your existing question management workflow.
