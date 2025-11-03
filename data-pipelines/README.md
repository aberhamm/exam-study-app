# Data Pipelines

This workspace contains data processing pipelines for converting various formats to the question format used by the quiz application.

## Setup

1. Install dependencies:
```bash
cd data-pipelines
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env and add your API keys and MongoDB connection details
```
   The pipeline will automatically load variables from the `.env` file using dotenv. See `.env.example` for all available configuration options.

## Available Pipelines

### Markdown to JSON

Converts markdown quiz files to JSON format compatible with the quiz application.

**Usage:**
```bash
# Process single file
pnpm markdown-to-json data/input/quiz.md

# Process all files in directory (batch processing)
pnpm markdown-to-json data/input/

# With custom output directory
pnpm markdown-to-json data/input/ --output-dir data/output/

# Single file with metadata
pnpm markdown-to-json quiz.md --exam-title "Math Quiz" --exam-id "math-101"

# Help
pnpm markdown-to-json --help
```

**Environment Variables:**
- `OPENROUTER_API_KEY` (required): Your OpenRouter API key
- `OPENROUTER_MODEL` (optional): Model to use (default: `anthropic/claude-3.5-sonnet`)

**Input Format:**
The pipeline can process:
- **Single file**: Pass a path to a `.md` or `.markdown` file
- **Directory**: Pass a directory path to process all markdown files sequentially

The pipeline expects markdown files with questions in this format:

```markdown
# Quiz Title

## Question 1
What is 2 + 2?
- A) 3
- B) 4
- C) 5
- D) 6

**Answer: B**

## Question 2
Which are prime numbers? (Select all that apply)
- A) 2
- B) 4
- C) 7
- D) 9

**Answer: A, C**

**Explanation: Prime numbers have no divisors other than 1 and themselves.**
```

**Output Format:**
- **Single file**: Generates one JSON file with optional metadata (examId, examTitle)
- **Directory processing**: Generates one JSON file per input markdown file (metadata ignored)

The pipeline generates JSON files with this structure:

```json
{
  "examId": "optional-exam-id",
  "examTitle": "Optional Exam Title",
  "questions": [
    {
      "question": "What is 2 + 2?",
      "options": {
        "A": "3",
        "B": "4",
        "C": "5",
        "D": "6"
      },
      "answer": "B",
      "question_type": "single"
    }
  ]
}
```

### Markdown to Embeddings (Markdown/JSON + LangChain)

Converts markdown content from either JSON files (with a `markdown` field) or native markdown files into chunked embeddings and stores them in MongoDB.

Usage:
```bash
# Process all files in the default input directory
pnpm markdown-to-embeddings

# Process a specific JSON file
pnpm markdown-to-embeddings data/markdown-to-embeddings/input/document.json

# Process a markdown file with custom base URL
pnpm markdown-to-embeddings pages/learn/guide.md --base-url https://docs.example.com

# Specify a different JSON field and group identifier
pnpm markdown-to-embeddings --json-field body --group production-docs

# Help
pnpm markdown-to-embeddings --help
```
If `--group` is omitted, the pipeline generates a run-scoped group id like `run_k3x9b2-1a2bcd` and prints it at start; all documents from that invocation share it.

Environment Variables:
- `OPENAI_API_KEY` (required): API key for embeddings
- `OPENAI_EMBEDDING_MODEL` (optional): defaults to `text-embedding-3-small`
- `EMBEDDING_DIMENSIONS` (optional): defaults to `1536`
- `MONGODB_URI` (required): MongoDB connection string
- `MONGODB_DB` (required): Database name

Collection:
- Documents are stored in the `document_embeddings` collection (configured in `lib/env-config.ts`)

Input Format:
- **JSON files** (`.json`): Must include a top-level `markdown` string field (configurable via `--json-field`). Other top-level keys are preserved as `metadata.sourceMeta`.
- **Markdown files** (`.md`, `.markdown`): Native markdown with optional frontmatter for metadata (title, description, tags, etc.). URLs are auto-generated from file paths relative to `--base-url`.

Behavior:
- The pipeline uses LangChain's `RecursiveCharacterTextSplitter` in markdown mode with chunk size 1500 and overlap 200 to create structure-aware chunks, preserving code fences and inline code content.
- Embeddings are generated with `@langchain/openai` and upserted as one MongoDB document per chunk (recommended for vector search). Each chunk document has a top-level `embedding` vector and top-level metadata fields suitable for vector indexing and filters.
- Each chunk carries a `sectionPath` (e.g., `H1 > H2 > H3`) and `nearestHeading` computed from the nearest preceding markdown headings in the original source. You can also add a group identifier to all docs with `--group <name>`.

Chunk document fields (high level):
- `embedding: number[]`, `text: string`, `groupId`, `sourceFile`, `sourceBasename`, `title`, `description`, `url`, `tags[]`
- `sectionPath`, `nearestHeading`, `chunkIndex`, `chunkTotal`, `startIndex`, `endIndex`, `model`, `dimensions`
- `contentHash` (file-level), `chunkContentHash` (chunk-level), `sourceMeta`

## Directory Structure

```
data-pipelines/
├── src/
│   ├── pipelines/           # Individual pipeline implementations
│   ├── shared/             # Shared utilities and types
│   └── schemas/            # Validation schemas
├── data/
│   ├── input/              # Source files
│   ├── output/             # Generated files
│   ├── intermediate/       # Temporary processing files
│   └── logs/               # Pipeline execution logs
└── package.json
```

## Adding New Pipelines

1. Create a new directory under `src/pipelines/`
2. Implement the pipeline following the established patterns
3. Add appropriate validation schemas
4. Update this README with usage instructions
