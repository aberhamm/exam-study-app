# SCXMCL Study Utility

An interactive quiz application built with Next.js for studying Sitecore XM Cloud (SCXMCL) concepts. Features randomized questions, immediate feedback, detailed explanations, and linked study materials.

## Features

- 🎯 **Interactive Quiz**: Multiple-choice questions with immediate feedback
- 🔀 **Randomized Questions**: Questions are shuffled for each quiz session
- 📚 **Study Materials**: Linked documentation and excerpts for deeper learning
- 🌙 **Dark/Light Mode**: System-aware theme with manual toggle
- ⌨️ **Keyboard Navigation**: Use keys 1-4 for answers, Enter/Space to continue
- 📊 **Progress Tracking**: Visual progress indicator and final score
- 🔄 **Review Incorrect**: Review wrong answers with explanations after completion

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

## Project Structure

```
scxmcl-study-util/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout with theme provider
│   ├── page.tsx           # Main page (renders QuizApp)
│   ├── useQuestions.ts    # Questions data fetching hook
│   └── globals.css        # Global styles
├── components/             # React components
│   ├── ui/                # Reusable UI components
│   │   ├── button.tsx     # Button component
│   │   └── card.tsx       # Card component
│   ├── QuizApp.tsx        # Main quiz application
│   ├── StudyPanel.tsx     # Study materials display
│   ├── ThemeProvider.tsx  # Theme context provider
│   └── ThemeToggle.tsx    # Theme toggle button
├── lib/                   # Utility libraries
│   ├── normalize.ts       # Question data normalization
│   ├── utils.ts          # Utility functions
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

Questions are stored in JSON format and validated using Zod schemas:

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
      "explanation": "XM Cloud uses a hybrid SaaS CMS architecture...",
      "study": [
        {
          "chunkId": "xmc-arch-1",
          "url": "https://doc.sitecore.com/...",
          "excerpt": "XM Cloud is a hybrid SaaS CMS..."
        }
      ]
    }
  ]
}
```

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
