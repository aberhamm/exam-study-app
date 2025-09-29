# SCXMCL Study Utility

An interactive quiz application built with Next.js for studying Sitecore XM Cloud (SCXMCL) concepts. Features randomized questions, immediate feedback, detailed explanations, and linked study materials.

## Features

### 🎛️ **Test Configuration**
- **Question Type Filtering**: Choose between all questions, single select only, or multiple select only
- **Configurable Question Count**: Select from presets (10, 25, 50, 75, 100) or enter custom amount
- **Smart Validation**: Real-time validation ensures valid configuration based on available questions
- **Session Persistence**: Test settings automatically saved and restored

### 🎯 **Interactive Quiz Experience**
- **Mixed Question Types**: Support for both single select and multiple select questions
- **Immediate Feedback**: Instant response validation with explanations
- **Visual Question Indicators**: Clear display of question type (radio vs checkbox)
- **Randomized Questions**: Questions shuffled for each quiz session
- **Progress Tracking**: Visual progress indicator and final score

### 🎨 **User Interface**
- **Test Settings Display**: Current configuration shown throughout quiz
- **Easy Navigation**: Back to settings available at any time
- **Dark/Light Mode**: System-aware theme with manual toggle
- **Responsive Design**: Optimized for desktop and mobile devices
- **Keyboard Navigation**: Full keyboard support with dynamic instructions

### 📚 **Learning Features**
- **Study Materials**: Linked documentation and excerpts for deeper learning
- **Detailed Explanations**: Comprehensive answer explanations
- **Review Incorrect**: Review wrong answers with visual feedback after completion
- **Question Type Training**: Focus practice on specific question formats
- **Local Question Metrics**: Client-side tracking records how often each question is seen, answered correctly, or missed without hitting the server
- **Missed Question Practice**: Launch focused quizzes that contain only the questions you previously answered incorrectly

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **UI**: React 19, Tailwind CSS 4, Radix UI components
- **State**: React hooks with local state management
- **Validation**: Zod for data validation
- **Icons**: Lucide React
- **Fonts**: Geist Sans and Geist Mono

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd scxmcl-study-util

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Scripts

```bash
npm run dev       # Start development server with Turbopack
npm run build     # Build for production with Turbopack
npm start         # Start production server
npm run lint      # Run ESLint
```

### Environment Variables

Copy `.env.example` to `.env.local` (or update your preferred dotenv file) and set the MongoDB connection details used by the API routes and seeding scripts:

```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=scxmcl-study-util
MONGODB_EXAMS_COLLECTION=exams
MONGODB_QUESTIONS_COLLECTION=questions

# For embeddings (optional)
OPENAI_API_KEY=your-openai-key
QUESTIONS_EMBEDDING_MODEL=text-embedding-3-small
# QUESTIONS_EMBEDDING_DIMENSIONS=1536
MONGODB_QUESTION_EMBEDDINGS_COLLECTION=question_embeddings
```

When running against MongoDB Atlas, supply the SRV connection string (e.g. `mongodb+srv://user:pass@cluster.mongodb.net`) and ensure your IP is allow-listed.

### Seeding Exam Data

Populate your MongoDB collection with the bundled JSON exams using:

```bash
pnpm seed:exams
```

The seeder loads JSON files from `data/exams/`, validates them with the shared Zod schema, and upserts documents keyed by `examId`. Ensure your environment variables point at the desired database/collection before running.

### Migrating Questions to Their Own Collection

To move embedded questions from each exam document into a dedicated `questions` collection while keeping backward compatibility:

```bash
pnpm migrate:questions
```

This script iterates all exams, upserts each embedded question into `MONGODB_QUESTIONS_COLLECTION` with a stable `id`, and marks the exam with `legacyQuestionsMigrated: true`. The API now prefers reading from the `questions` collection but falls back to the embedded array if none are present. Writes mirror to the legacy array to ease transition.

### Generating Question Embeddings

Embed each question (with its answer and optional explanation) into a vector for semantic search or retrieval workflows:

```bash
# Embed all questions to `question_embeddings`
pnpm embed:questions

# Target a single exam and recompute existing embeddings
pnpm embed:questions --exam sitecore-xmc --recompute

# Limit and batch-size (defaults: limit = all, batch = 16)
pnpm embed:questions --limit 100 --batch 32
```

Environment:

- `OPENAI_API_KEY` – API key for embeddings
- `QUESTIONS_EMBEDDING_MODEL` – defaults to `text-embedding-3-small`
- `QUESTIONS_EMBEDDING_DIMENSIONS` – optional; set to model dims (e.g., 1536)

MongoDB Atlas Vector Search (optional): create a vector index on `question_embeddings.embedding` with cosine similarity and the chosen dimensions. Name it via `MONGODB_QUESTION_EMBEDDINGS_VECTOR_INDEX`.

### Semantic Search (optional)

A development search endpoint is available to retrieve similar questions by semantic meaning:

```bash
curl -X POST "http://localhost:3000/api/exams/sitecore-xmc/search" \
  -H "Content-Type: application/json" \
  -d '{ "query": "experience edge publishing" , "topK": 5 }'
```

Requirements:
- Populate `question_embeddings` (see Embeddings above)
- Create a MongoDB Atlas Vector Search index on `question_embeddings.embedding`
- Set `OPENAI_API_KEY` and `MONGODB_QUESTION_EMBEDDINGS_VECTOR_INDEX`

### Importing Additional Questions

You can use the in-app importer at [`/import`](http://localhost:3000/import) to paste question JSON, preview validation, and submit it to a selected exam.

Alternatively, call the authenticated API (or run locally) to append multiple questions to an existing exam in one request:

```bash
curl -X POST "http://localhost:3000/api/exams/sitecore-xmc/questions/import" \
  -H "Content-Type: application/json" \
  -d '{
    "questions": [
      {
        "question": "Sample prompt?",
        "options": {
          "A": "Option A",
          "B": "Option B",
          "C": "Option C",
          "D": "Option D"
        },
        "answer": "A",
        "explanation": "Optional explanation.",
        "question_type": "single"
      }
    ]
  }'
```

The endpoint validates each question, generates stable `id` values, and returns the inserted records. If a generated `id` collides with an existing question, the API responds with HTTP 409 and a list of duplicate IDs so you can adjust the payload.

### Question Metrics Storage

Every time you run a quiz, the client records per-question metrics (seen, correct, incorrect) in `localStorage` under `scxmcl-question-metrics`. This avoids extra database load and keeps progress tracking lightweight and local. Resetting the browser storage clears these counters.

On the main configuration page you can use these metrics to spin up a “Review missed questions” session, which builds a quiz from just the questions with one or more incorrect attempts.

## Project Structure

```
scxmcl-study-util/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout with theme provider
│   ├── page.tsx           # Main app with view state management
│   ├── useQuestions.ts    # Questions data fetching hook
│   └── globals.css        # Global styles
├── components/             # React components
│   ├── ui/                # Reusable UI components
│   │   ├── button.tsx     # Button component
│   │   └── card.tsx       # Card component
│   ├── QuizApp.tsx        # Main quiz application
│   ├── TestConfigPage.tsx # Test configuration splash page
│   ├── StudyPanel.tsx     # Study materials display
│   ├── ThemeProvider.tsx  # Theme context provider
│   └── ThemeToggle.tsx    # Theme toggle button
├── lib/                   # Utility libraries
│   ├── test-settings.ts   # Test configuration constants and utilities
│   ├── question-utils.ts  # Question filtering and preparation utilities
│   ├── normalize.ts       # Question data normalization
│   ├── utils.ts          # General utility functions
│   └── validation.ts     # Zod schemas
├── types/                 # TypeScript type definitions
│   ├── normalized.ts      # Internal question types
│   └── external-question.ts # External question format
├── public/                # Static assets
│   ├── questions.json     # Main questions data
│   └── chunks/           # Question data chunks
└── docs/                 # Documentation (see /docs for details)
```

## Question Format

Questions are stored in JSON format and validated using Zod schemas. The application supports both single select and multiple select question types:

### Single Select Question
```json
{
  "question": "What architecture does Sitecore XM Cloud utilize?",
  "question_type": "single",
  "options": {
    "A": "Monolithic",
    "B": "Hybrid SaaS CMS with Headless Architecture",
    "C": "Traditional CMS",
    "D": "WYSIWYG"
  },
  "answer": "B",
  "explanation": "XM Cloud uses a hybrid SaaS CMS architecture...",
  "study": [
    {
      "chunkId": "xmc-arch-1",
      "url": "https://doc.sitecore.com/...",
      "excerpt": "XM Cloud is a hybrid SaaS CMS..."
    }
  ]
}
```

### Multiple Select Question
```json
{
  "question": "Which of the following are benefits of using Sitecore XM Cloud? (Select all that apply)",
  "question_type": "multiple",
  "options": {
    "A": "Automatic scaling and performance optimization",
    "B": "Reduced infrastructure management overhead",
    "C": "Built-in security updates and patches",
    "D": "Limited customization options"
  },
  "answer": ["A", "B", "C"],
  "explanation": "XM Cloud provides automatic scaling, reduces infrastructure management overhead, and includes built-in security updates. However, it actually offers extensive customization options, making option D incorrect.",
  "study": [
    {
      "chunkId": "xmc-benefits-1",
      "url": "https://doc.sitecore.com/...",
      "excerpt": "XM Cloud delivers automatic scaling, managed infrastructure..."
    }
  ]
}
```

### Question Format Notes
- `question_type`: Optional field, defaults to "single" for backward compatibility
- `answer`: Single letter (A-D) for single select, array of letters for multiple select
- All other fields remain the same for both question types

## Documentation

Detailed documentation is available in the `/docs` directory:

- [Architecture Overview](./docs/architecture.md)
- [Component Documentation](./docs/components.md)
- [API & Data Structures](./docs/api-data.md)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is private and not licensed for public use.
