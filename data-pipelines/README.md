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
# Edit .env and add your OpenRouter API key
```
   The pipeline will automatically load variables from the `.env` file using dotenv.

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