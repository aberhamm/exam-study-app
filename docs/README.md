# Documentation

Welcome to the study-util documentation.

## Quick Links

### Getting Started
- **[Quick Start: Competency Sync](guides/QUICKSTART-COMPETENCY-SYNC.md)** - Get started with automatic competency-question syncing

### Features
- **[Competency Sync Implementation](features/competency-sync-implementation.md)** - Full implementation details for competency denormalization
- **[Test Summary](features/TEST-SUMMARY.md)** - Test coverage and results for competency sync

### Architecture & Reference
- **[Architecture](architecture.md)** - System architecture overview
- **[API Data](api-data.md)** - API data structures and endpoints
- **[Components](components.md)** - UI component documentation
- **[Scripts](scripts.md)** - Available scripts and utilities

## Project Overview

This is a study utility application for Sitecore XM Cloud certification exam preparation.

### Key Features

- ✅ **Question Management** - Browse, edit, and manage exam questions
- ✅ **Competency Tracking** - Map questions to exam competencies with automatic sync
- ✅ **Quiz Mode** - Interactive quiz interface with timer and scoring
- ✅ **Vector Search** - Find similar questions using embeddings
- ✅ **Deduplication** - Detect and merge duplicate questions
- ✅ **MongoDB Integration** - Scalable data storage with indexes

## Documentation Structure

```
docs/
├── README.md                          # This file
├── guides/                            # Getting started guides
│   └── QUICKSTART-COMPETENCY-SYNC.md # Quick start for competency sync
├── features/                          # Feature documentation
│   ├── competency-sync-implementation.md
│   └── TEST-SUMMARY.md
├── architecture.md                    # System architecture
├── api-data.md                       # API reference
├── components.md                     # UI components
└── scripts.md                        # Scripts reference
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- __tests__/lib/server/competency-sync.test.ts

# Run tests in watch mode
npm test:watch
```

### Database Scripts

```bash
# Sync competency references (one-time setup)
pnpm sync:competencies --exam sitecore-xmc --fix

# Assign competencies to questions
pnpm assign:competencies --exam sitecore-xmc

# Embed questions for vector search
pnpm embed:questions
```

## Need Help?

- Check the relevant documentation section above
- Review the [Architecture](architecture.md) for system overview
- See [Components](components.md) for UI component details
- Check [Scripts](scripts.md) for available utilities
