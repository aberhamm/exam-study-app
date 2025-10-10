# Architecture Overview

## System Architecture

The SCXMCL Study Utility is built using a modern React-based architecture with Next.js 15 and the App Router pattern. The application follows a client-side state management approach with hooks and context for theme management.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Client)                         │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │ TestConfigPage  │ │    QuizApp      │ │  ThemeProvider  │ │
│ │   (Settings)    │ │   Component     │ │    (Context)    │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │ Test Settings   │ │ Question Utils  │ │   Validation    │ │
│ │ (Configuration) │ │ (Filter/Limit)  │ │     (Zod)       │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │  Data Fetching  │ │  Normalization  │ │ Session Storage │ │
│ │  (useQuestions) │ │   (normalize)   │ │   (Settings)    │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                   Next.js App Router                        │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │  Static Assets  │ │   Public API    │ │   Build Time    │ │
│ │ (questions.json)│ │   (/questions)  │ │  Optimization   │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Design Principles

### 1. Single-Page Application (SPA)
- All quiz functionality contained within a single React component tree
- Client-side routing handled by Next.js App Router
- State maintained entirely on the client side

### 2. Data-First Architecture
- Questions loaded from static JSON files
- Data validation using Zod schemas at runtime
- Normalization layer to convert external format to internal types
- Immutable data flow with functional state updates

### 3. Component Composition
- Small, focused components with single responsibilities
- Props-based communication between components
- Context used sparingly (only for theme management)
- No global state management library needed

### 4. Type Safety
- Full TypeScript coverage with strict mode enabled
- Separate type definitions for external and internal data
- Runtime validation with compile-time type checking

## Data Flow

### Application Flow
```
App Start → Test Configuration → Server Prepare → Quiz Execution
    ↓
TestConfigPage (splash screen)
    ↓
User selects question type + count
    ↓
POST /api/exams/:examId/questions/prepare (server filters + samples)
    ↓
QuizApp with prepared subset
```

### Question Loading Flow
```
API → Fetch → Zod Validation → Normalization → Component State
    ↓
POST /api/exams/:examId/questions/prepare
    ↓
usePreparedQuestions Hook
    ↓
normalizeQuestions() on server
    ↓
Client renders returned subset
```

### Quiz State Flow
```
User Action → State Update → Component Re-render → UI Update
     ↓
selectAnswer() / nextQuestion()
     ↓
setQuizState() with immutable updates
     ↓
React re-render cycle
     ↓
Conditional rendering based on new state
```

## State Management Strategy

### Local Component State
The application uses React's `useState` for all quiz-related state management:

- **QuizState**: Contains current question index, selected answers, scores, and feedback state
- **Questions**: Normalized question data with randomized order based on test settings
- **TestSettings**: Question type filter and count configuration
- **AppView**: Current view state (config vs quiz)
- **Loading/Error**: Async state for data fetching

### Session Storage State
Test configuration persistence:

- **TestSettings**: User preferences for question type and count
- **Session-based**: Settings persist within browser session
- **Automatic loading**: Settings restored on app restart

### Context-Based State
Theme management uses React Context:

- **ThemeProvider**: Manages dark/light/system theme preferences
- **localStorage**: Persists theme choice across sessions
- **MediaQuery**: Responds to system theme changes

### No Global State
- No Redux, Zustand, or other global state libraries
- State kept close to where it's used
- Props drilling avoided through component composition

## File Organization

### Directory Structure
```
src/
├── app/                 # Next.js App Router
│   ├── layout.tsx      # Root layout + ThemeProvider
│   ├── page.tsx        # Home page (renders QuizApp)
│   ├── useQuestions.ts # Data fetching hook
│   └── globals.css     # Global styles
├── components/         # React components
│   ├── ui/            # Reusable UI primitives
│   ├── QuizApp.tsx    # Main application component
│   ├── StudyPanel.tsx # Study materials display
│   ├── ThemeProvider.tsx # Theme context
│   └── ThemeToggle.tsx   # Theme switching UI
├── lib/               # Utility functions
│   ├── normalize.ts   # Data transformation
│   ├── utils.ts      # General utilities
│   └── validation.ts # Zod schemas
├── types/            # TypeScript definitions
│   ├── normalized.ts # Internal data types
│   └── external-question.ts # External data format
└── public/           # Static assets
    ├── questions.json # Main question data
    └── chunks/       # Question data chunks
```

### Separation of Concerns

1. **Data Layer** (`lib/`, `types/`)
   - Data validation and transformation
   - Type definitions
   - Pure functions with no side effects

2. **Component Layer** (`components/`)
   - UI logic and presentation
   - Event handling
   - Local state management

3. **Application Layer** (`app/`)
   - Routing and layout
   - Global providers
   - Data fetching coordination

## Performance Considerations

### Bundle Optimization
- Next.js automatic code splitting
- Tree-shaking with ES modules
- Turbopack for fast development builds

### Runtime Performance
- Questions shuffled once per quiz session (not per render)
- Immutable state updates prevent unnecessary re-renders
- Memoization through `useCallback` for event handlers
- Conditional rendering to avoid DOM manipulation

### Data Loading
- Static JSON files served from CDN
- No database queries or API calls
- Questions loaded once and cached in memory
- Chunked question files for potential future optimization

## Error Handling

### Data Validation
- Zod schemas catch malformed question data at runtime
- Graceful degradation when questions fail to load
- Error boundaries could be added for component-level errors

### User Experience
- Loading states during data fetch
- Error messages for failed question loading
- Keyboard navigation always available as fallback

## Security Considerations

### Client-Side Security
- No user authentication or sensitive data
- Static content only, no dynamic data exposure
- CSP headers can be added via Next.js config

### Data Integrity
- Zod validation prevents malformed data from reaching components
- TypeScript prevents type-related runtime errors
- Immutable state updates prevent accidental mutations

## Deployment Architecture

### Static Generation
- Next.js can generate static files for CDN deployment
- No server-side rendering required for this application
- Questions bundled at build time

### Hosting Options
- Vercel (optimized for Next.js)
- Netlify with static hosting
- AWS S3 + CloudFront
- Any static file hosting service

## Future Architecture Considerations

### Scalability
- Database integration for dynamic question management
- User authentication and progress tracking
- Question categorization and filtering
- Analytics and usage tracking

### Performance Enhancements
- Virtual scrolling for large question sets
- Progressive loading of question chunks
- Service worker for offline functionality
- Image optimization for study materials

### Feature Extensions
- Multi-quiz support with routing
- Question editor interface
- Export/import functionality
- Collaborative features
