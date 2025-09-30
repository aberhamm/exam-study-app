# Component Documentation

## Component Architecture

The SCXMCL Study Utility follows a component-based architecture with clear separation of concerns. Each component has a specific responsibility and communicates through props and context.

## Component Tree Structure

```
App Layout (layout.tsx)
├── ThemeProvider
    ├── TestConfigPage (splash screen)
    │   ├── ThemeToggle
    │   ├── Question Type Selection
    │   ├── Question Count Configuration
    │   └── Configuration Summary
    └── QuizApp (main quiz)
        ├── ThemeToggle
        ├── Settings Display
        ├── Progress Indicator
        ├── Question Card
        │   ├── Answer Buttons (single/multiple)
        │   └── Feedback Panel
        │       ├── Explanation
        │       └── StudyPanel
        └── Results Screen
            ├── Score Display
            ├── Action Buttons
            └── Review Section
                └── StudyPanel
```

## Core Components

### TestConfigPage (`components/TestConfigPage.tsx`)

**Purpose**: Test configuration splash screen that allows users to customize their quiz experience.

**Props**:
```typescript
type Props = {
  questions: NormalizedQuestion[] | null;
  onStartTest: (settings: TestSettings, options?: { overrideQuestions?: NormalizedQuestion[] }) => void;
  loading: boolean;
  error: string | null;
};
```

**Responsibilities**:
- Displays question type selection (all, single, multiple)
- Provides question count configuration (presets + custom)
- Shows real-time question availability counts
- Validates configuration before allowing test start
- Manages session storage for test settings

**Key Features**:
- Question type filtering with live counts
- Configurable question count (5-100, defaults to 50)
- Smart validation preventing invalid configurations
- Responsive design with mobile-specific layouts
- Session persistence for user preferences
- Missed-question shortcut to launch a quiz composed only of previously incorrect items

**Test Configuration Flow**:
1. Load saved settings from session storage
2. Display available question counts per type
3. Allow user to select question type and count
4. Validate configuration against available questions
5. Save settings and proceed to quiz

---

### QuizApp (`components/QuizApp.tsx`)

**Purpose**: Main quiz application component that runs the configured test.

**Props**:
```typescript
type Props = {
  questions: NormalizedQuestion[];
  testSettings: TestSettings;
  onBackToSettings: () => void;
};
```

**Responsibilities**:
- Manages quiz state for prepared questions
- Handles both single and multiple select questions
- Provides keyboard navigation with dynamic instructions
- Displays test settings throughout quiz experience
- Coordinates scoring for mixed question types

**Key State**:
```typescript
type QuizState = {
  currentQuestionIndex: number;
  selectedAnswers: (number | number[] | null)[];
  showResult: boolean;
  showFeedback: boolean;
  score: number;
  incorrectAnswers: Array<{
    question: NormalizedQuestion;
    selectedIndex: number | number[];
    correctIndex: number | number[];
  }>;
};
```

**Key Methods**:
- `selectAnswer(answerIndex: number)`: Handles both single/multiple selection
- `submitMultipleAnswer()`: Submits multiple select answers
- `nextQuestion()`: Advances to next question or finishes quiz
- `finishQuiz()`: Calculates final score with mixed question support
- `resetQuiz()`: Starts new quiz with same settings

**Features**:
- Question randomization on load and reset
- Real-time progress tracking
- Keyboard accessibility
- Responsive design with Tailwind CSS

---

### StudyPanel (`components/StudyPanel.tsx`)

**Purpose**: Displays linked study materials and documentation excerpts.

**Props**:
```typescript
type Props = {
  study?: Array<{
    chunkId: string;
    url?: string;
    anchor?: string;
    excerpt?: string;
  }>;
};
```

**Responsibilities**:
- Renders study material excerpts
- Provides external links to documentation
- Handles optional study data gracefully

**Features**:
- Conditional rendering (only shows if study data exists)
- External link support with proper security attributes
- Styled excerpts for readability

---

### ThemeProvider (`components/ThemeProvider.tsx`)

**Purpose**: Manages application theme state and persistence.

**Context Type**:
```typescript
type ThemeProviderContextType = {
  theme: "dark" | "light" | "system";
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light";
};
```

**Responsibilities**:
- Provides theme context to entire application
- Persists theme preference in localStorage
- Responds to system theme changes
- Applies theme classes to document root

**Features**:
- System theme detection via `prefers-color-scheme`
- Automatic theme switching based on system changes
- Persistent theme selection across sessions

---

### ThemeToggle (`components/ThemeToggle.tsx`)

**Purpose**: UI control for switching between light, dark, and system themes.

**Props**: None (uses `useTheme` context)

**Responsibilities**:
- Provides theme switching interface
- Shows current theme state with appropriate icons
- Cycles through theme options on click

**Features**:
- Icon-based theme indication (Sun, Moon, Monitor)
- Accessible button with proper labeling
- Smooth transitions between theme states

## UI Components

### Button (`components/ui/button.tsx`)

**Purpose**: Reusable button component with consistent styling.

**Features**:
- Multiple variants (default, secondary, outline, ghost, link)
- Size variants (default, sm, lg, icon)
- Built with Radix UI Slot for composition
- Class variance authority for type-safe variant props

**Usage**:
```typescript
<Button variant="outline" size="lg">
  Click me
</Button>
```

---

### Card (`components/ui/card.tsx`)

**Purpose**: Container component for grouped content.

**Components**:
- `Card`: Main container
- `CardHeader`: Header section
- `CardContent`: Main content area
- `CardFooter`: Footer section

**Usage**:
```typescript
<Card>
  <CardHeader>Title</CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

## Hooks

### useQuestions (`app/useQuestions.ts`)

**Purpose**: Custom hook for fetching and validating question data.

**Return Type**:
```typescript
{
  data: NormalizedQuestion[] | null;
  error: string | null;
  loading: boolean;
}
```

**Responsibilities**:
- Fetches questions from `/questions.json`
- Validates data using Zod schemas
- Normalizes external format to internal types
- Handles loading and error states

**Features**:
- Automatic data validation
- Error handling with user-friendly messages
- Loading state management

---

### usePreparedQuestions (`app/usePreparedQuestions.ts`)

**Purpose**: Fetch only the number of questions needed to start an exam. The server filters and randomly samples matching questions, returning a normalized subset.

**Return Type**:
```typescript
{
  data: NormalizedQuestion[] | null;
  error: string | null;
  loading: boolean;
}
```

**Responsibilities**:
- POST to `/api/exams/:examId/questions/prepare` with `{ questionType, explanationFilter, questionCount }`
- Receive and expose server-normalized `questions`
- Handle loading and error states

**Features**:
- Avoids downloading full datasets on exam start
- Aligns server/client selection logic for consistency
- Plays well with resume flows (client bypasses when a saved state exists)

---

### useTheme (from ThemeProvider)

**Purpose**: Hook for accessing theme context.

**Return Type**:
```typescript
{
  theme: "dark" | "light" | "system";
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light";
}
```

**Usage**:
```typescript
const { theme, setTheme, resolvedTheme } = useTheme();
```

## Data Flow Patterns

### Props Down, Events Up
- Parent components pass data down via props
- Child components communicate up via callback props
- No prop drilling beyond 2-3 levels

### Context for Cross-Cutting Concerns
- Theme management uses React Context
- Avoids prop drilling for theme state
- Provides centralized theme logic

### Immutable State Updates
- All state updates create new objects/arrays
- Prevents accidental mutations
- Enables React optimization strategies

## Event Handling

### Keyboard Navigation
```typescript
const handleKeyDown = useCallback((e: KeyboardEvent) => {
  if (e.key >= "1" && e.key <= "4") {
    // Select answer
  } else if (e.key === "Enter" || e.key === " ") {
    // Continue to next question
  }
}, [dependencies]);
```

### Answer Selection
```typescript
const selectAnswer = useCallback((answerIndex: number) => {
  const newSelectedAnswers = [...selectedAnswers];
  newSelectedAnswers[currentQuestionIndex] = answerIndex;
  setQuizState(prev => ({
    ...prev,
    selectedAnswers: newSelectedAnswers,
    showFeedback: true
  }));
}, [dependencies]);
```

## Styling Strategy

### Tailwind CSS Classes
- Utility-first CSS approach
- Responsive design with breakpoint prefixes
- Dark mode support with `dark:` variants
- Component-specific styling in JSX

### CSS Custom Properties
- Theme colors managed via CSS variables
- Consistent spacing and typography scales
- Support for system theme preferences

### Conditional Styling
```typescript
className={`p-4 rounded-lg ${
  isCorrect
    ? "bg-green-50 dark:bg-green-950"
    : "bg-red-50 dark:bg-red-950"
}`}
```

## Accessibility Features

### Keyboard Navigation
- Tab order follows logical flow
- Enter/Space for primary actions
- Number keys for quick answer selection
- Focus management during transitions

### ARIA Attributes
- `role="radiogroup"` for answer choices
- `aria-checked` for selected states
- `aria-describedby` for feedback messages
- Proper heading hierarchy

### Screen Reader Support
- Semantic HTML elements
- Descriptive button labels
- Status announcements for feedback
- Progress indicators with proper labeling

## Component Testing Strategy

### Unit Testing Approach
- Test component behavior, not implementation
- Mock external dependencies (fetch, localStorage)
- Test user interactions and state changes
- Verify accessibility requirements

### Integration Testing
- Test component composition
- Verify data flow between components
- Test context provider functionality
- Validate keyboard navigation flows

## Performance Optimizations

### React.memo and useCallback
- Memoize expensive calculations
- Prevent unnecessary re-renders
- Optimize event handler functions

### Conditional Rendering
- Render only necessary DOM elements
- Use early returns for loading/error states
- Minimize DOM manipulation

### Image and Asset Optimization
- Next.js automatic image optimization
- Lazy loading for study materials
- Efficient icon libraries (Lucide React)

## Component Composition Patterns

### Compound Components
```typescript
<Card>
  <Card.Header>Question</Card.Header>
  <Card.Content>
    <AnswerChoices />
  </Card.Content>
</Card>
```

### Render Props (future consideration)
```typescript
<QuizState>
  {({ question, selectAnswer }) => (
    <QuestionDisplay
      question={question}
      onSelect={selectAnswer}
    />
  )}
</QuizState>
```

### Higher-Order Components (avoided)
- Prefer hooks and composition over HOCs
- Use context for cross-cutting concerns
- Keep component hierarchy flat and predictable
