# API & Data Structures

## Data Flow Overview

The application follows a simple data flow pattern for loading and processing quiz questions:

```
JSON File → Fetch → Validation → Normalization → Component State
```

## External Data Format

### Question JSON Structure

Questions are stored in JSON files that follow a specific schema. The main file is located at `/public/questions.json`.

```json
{
  "questions": [
    {
      "question": "What architecture does Sitecore XM Cloud utilize?",
      "options": {
        "A": "Monolithic",
        "B": "Hybrid SaaS CMS with Headless Architecture",
        "C": "Traditional CMS",
        "D": "WYSIWYG"
      },
      "answer": "B",
      "explanation": "XM Cloud uses a hybrid SaaS CMS architecture with headless delivery via Experience Edge, providing both traditional authoring capabilities and modern headless content delivery.",
      "study": [
        {
          "chunkId": "xmc-arch-1",
          "url": "https://doc.sitecore.com/.../xm-cloud-architecture.html#architecture",
          "anchor": "architecture",
          "excerpt": "XM Cloud is a hybrid SaaS CMS with headless delivery via Experience Edge…"
        }
      ]
    }
  ]
}
```

## Type Definitions

### External Question Types (`types/external-question.ts`)

These types represent the raw data format from JSON files:

```typescript
export type StudyLink = {
  chunkId: string;        // Unique identifier for the study material
  url?: string;           // Optional external documentation link
  anchor?: string;        // Optional anchor/hash for deep linking
  excerpt?: string;       // Optional excerpt from the documentation
};

export type ExternalQuestion = {
  question: string;       // The question text
  options: {              // Answer choices
    A: string;
    B: string;
    C: string;
    D: string;
  };
  answer: 'A' | 'B' | 'C' | 'D';  // Correct answer letter
  explanation?: string;   // Optional explanation of the answer
  study?: StudyLink[];    // Optional study materials
};

export type ExternalQuestionsFile = {
  questions: ExternalQuestion[];
};
```

### Internal Question Types (`types/normalized.ts`)

These types represent the processed data used within components:

```typescript
export type NormalizedQuestion = {
  id: string;                    // Generated stable ID
  prompt: string;                // Question text
  choices: [string, string, string, string]; // Answer choices as array
  answerIndex: 0 | 1 | 2 | 3;   // Correct answer index
  explanation?: string;          // Optional explanation
  study?: {                      // Optional study materials
    chunkId: string;
    url?: string;
    anchor?: string;
    excerpt?: string;
  }[];
};
```

## Data Validation

### Zod Schemas (`lib/validation.ts`)

The application uses Zod for runtime data validation:

```typescript
import { z } from 'zod';

export const StudyLinkZ = z.object({
  chunkId: z.string().min(1),
  url: z.string().url().optional(),
  anchor: z.string().optional(),
  excerpt: z.string().optional(),
});

export const ExternalQuestionZ = z.object({
  question: z.string().min(1),
  options: z.object({
    A: z.string().min(1),
    B: z.string().min(1),
    C: z.string().min(1),
    D: z.string().min(1),
  }),
  answer: z.enum(['A', 'B', 'C', 'D']),
  explanation: z.string().optional(),
  study: z.array(StudyLinkZ).optional(),
});

export const ExternalQuestionsFileZ = z.object({
  questions: z.array(ExternalQuestionZ),
});
```

### Validation Features

- **Type Safety**: Ensures data matches expected structure
- **Runtime Validation**: Catches malformed data at load time
- **Error Handling**: Provides detailed error messages for debugging
- **Optional Fields**: Supports optional explanation and study fields

## Data Normalization

### Normalization Process (`lib/normalize.ts`)

The normalization layer converts external format to internal format:

```typescript
import type { ExternalQuestion } from '@/types/external-question';
import type { NormalizedQuestion } from '@/types/normalized';

const LETTER_TO_INDEX = { A: 0, B: 1, C: 2, D: 3 } as const;

function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return 'q-' + (h >>> 0).toString(36);
}

export function normalizeQuestions(qs: ExternalQuestion[]): NormalizedQuestion[] {
  return qs.map((q) => {
    const id = hashId(q.question + '|' + q.answer);
    return {
      id,
      prompt: q.question,
      choices: [q.options.A, q.options.B, q.options.C, q.options.D],
      answerIndex: LETTER_TO_INDEX[q.answer],
      explanation: q.explanation,
      study: q.study,
    } as NormalizedQuestion;
  });
}
```

### Normalization Benefits

- **ID Generation**: Creates stable IDs for React keys and tracking
- **Index Conversion**: Converts letter answers to numeric indices
- **Array Structure**: Converts options object to indexed array
- **Type Consistency**: Ensures internal types are always consistent

## Data Loading

### useQuestions Hook (`app/useQuestions.ts`)

Custom hook that handles the entire data loading pipeline:

```typescript
export function useQuestions() {
  const [data, setData] = useState<NormalizedQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/questions.json", { cache: "no-store" });
        const json = await res.json();
        const parsed = ExternalQuestionsFileZ.parse(json);
        setData(normalizeQuestions(parsed.questions));
      } catch (e) {
        setError("Failed to load questions.");
        console.error(e);
      }
    })();
  }, []);

  return { data, error, loading: !data && !error };
}
```

### Loading States

- **Loading**: `loading: true, data: null, error: null`
- **Success**: `loading: false, data: Question[], error: null`
- **Error**: `loading: false, data: null, error: string`

## Quiz State Management

### QuizState Type

The main quiz state object used in the QuizApp component:

```typescript
type QuizState = {
  currentQuestionIndex: number;     // Current question position (0-based)
  selectedAnswers: (number | null)[]; // User's answers for each question
  showResult: boolean;              // Whether to show final results
  showFeedback: boolean;            // Whether to show answer feedback
  score: number;                    // Final score (number correct)
  incorrectAnswers: Array<{         // Details of wrong answers
    question: NormalizedQuestion;
    selectedIndex: number;
    correctIndex: number;
  }>;
};
```

### State Transitions

1. **Initial State**: All arrays empty, indices at 0
2. **Answer Selection**: Update selectedAnswers array, show feedback
3. **Next Question**: Increment index, hide feedback
4. **Quiz Completion**: Calculate score, show results
5. **Reset**: Return to initial state with new shuffled questions

## Study Materials

### StudyLink Structure

Study materials are attached to questions and displayed in the StudyPanel:

```typescript
type StudyLink = {
  chunkId: string;    // Unique identifier (required)
  url?: string;       // External documentation URL
  anchor?: string;    // URL anchor/hash for deep linking
  excerpt?: string;   // Text excerpt for context
};
```

### Usage Patterns

```json
{
  "study": [
    {
      "chunkId": "concept-1",
      "excerpt": "Brief explanation of the concept..."
    },
    {
      "chunkId": "doc-link-1",
      "url": "https://docs.example.com/feature",
      "anchor": "section-name",
      "excerpt": "Detailed documentation excerpt..."
    }
  ]
}
```

## Question Randomization

### Shuffle Algorithm

Questions are randomized using the Fisher-Yates shuffle algorithm:

```typescript
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
```

### Randomization Timing

- **Initial Load**: Questions shuffled when first loaded
- **Quiz Reset**: Questions re-shuffled for each new quiz session
- **Preservation**: Order maintained during a single quiz session

## Error Handling

### Validation Errors

When Zod validation fails, the error is caught and displayed to the user:

```typescript
try {
  const parsed = ExternalQuestionsFileZ.parse(json);
  setData(normalizeQuestions(parsed.questions));
} catch (e) {
  setError("Failed to load questions.");
  console.error(e); // Detailed error logged for debugging
}
```

### Network Errors

Fetch failures are handled gracefully with user-friendly messages:

```typescript
const res = await fetch("/questions.json", { cache: "no-store" });
if (!res.ok) {
  throw new Error(`HTTP ${res.status}: ${res.statusText}`);
}
```

## Performance Considerations

### Data Loading

- **Static Files**: Questions served as static JSON files
- **No Caching**: Cache disabled to ensure fresh data during development
- **Single Load**: Questions loaded once per session

### Memory Usage

- **Immutable Updates**: Prevent memory leaks from retained references
- **Chunked Loading**: Future support for loading question subsets
- **Garbage Collection**: Proper cleanup of event listeners

## Data File Organization

### Current Structure

```
public/
├── questions.json     # Main question file
└── chunks/           # Future chunked questions
    ├── 000.json      # Question chunk 0
    └── index.json    # Chunk index file
```

### Future Chunking Support

For large question sets, the application can be extended to support chunked loading:

```typescript
// Load specific chunk
const chunk = await fetch(`/chunks/${chunkId}.json`);

// Load chunk index
const index = await fetch('/chunks/index.json');
```

## API Extensions

### Future API Endpoints

The current static file approach could be extended with API endpoints:

- `GET /api/questions` - Load all questions
- `GET /api/questions/:category` - Load questions by category
- `GET /api/progress/:userId` - Load user progress
- `POST /api/progress/:userId` - Save user progress

### Database Integration

Future database schema could include:

```sql
CREATE TABLE questions (
  id VARCHAR PRIMARY KEY,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer CHAR(1) NOT NULL,
  explanation TEXT,
  category VARCHAR,
  difficulty INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE study_links (
  id VARCHAR PRIMARY KEY,
  question_id VARCHAR REFERENCES questions(id),
  chunk_id VARCHAR NOT NULL,
  url TEXT,
  anchor VARCHAR,
  excerpt TEXT
);
```