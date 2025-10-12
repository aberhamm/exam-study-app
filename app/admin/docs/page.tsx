'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { useHeader } from '@/contexts/HeaderContext';
import { DevNavigation } from '@/components/DevNavigation';

export default function DocsPage() {
  const { setConfig, resetConfig } = useHeader();

  useEffect(() => {
    setConfig({
      visible: true,
      variant: 'full',
      leftContent: (
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Home
        </Link>
      ),
      rightContent: <DevNavigation currentPage="docs" />,
    });
    return () => resetConfig();
  }, [resetConfig, setConfig]);

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Developer Documentation
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Command-line scripts and workflows for managing the study application
        </p>
      </div>

      {/* Question Embeddings */}
      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Generate Question Embeddings</h2>
        <p className="text-sm text-muted-foreground">
          Create vector embeddings for questions to enable semantic search and deduplication.
          Requires <code className="mx-1 bg-muted px-1 rounded">OPENAI_API_KEY</code> in your
          environment.
        </p>
        <div className="rounded-md border p-4 bg-muted/40 font-mono text-sm space-y-3">
          <div>
            <div className="font-semibold mb-1">Embed all questions</div>
            <pre className="text-xs">pnpm embed:questions</pre>
          </div>
          <div>
            <div className="font-semibold mb-1">Embed a single exam</div>
            <pre className="text-xs">pnpm embed:questions --exam sitecore-xmc</pre>
          </div>
          <div>
            <div className="font-semibold mb-1">Recompute embeddings</div>
            <pre className="text-xs">pnpm embed:questions --recompute</pre>
          </div>
          <div>
            <div className="font-semibold mb-1">Limit and batch size</div>
            <pre className="text-xs">pnpm embed:questions --limit 100 --batch 32</pre>
          </div>
        </div>
      </Card>

      {/* Competency Embeddings */}
      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Competency Management</h2>
        <p className="text-sm text-muted-foreground">
          Manage exam competencies and automatically assign them to questions using semantic
          similarity.
        </p>
        <div className="rounded-md border p-4 bg-muted/40 font-mono text-sm space-y-3">
          <div>
            <div className="font-semibold mb-1">Create vector index for competencies</div>
            <pre className="text-xs">pnpm create:competencies-index</pre>
          </div>
          <div>
            <div className="font-semibold mb-1">Embed competencies for an exam</div>
            <pre className="text-xs">pnpm embed:competencies --exam sitecore-xmc</pre>
          </div>
          <div>
            <div className="font-semibold mb-1">Auto-assign competencies to questions</div>
            <pre className="text-xs">
              pnpm assign:competencies --exam sitecore-xmc --topN 1 --threshold 0.5
            </pre>
          </div>
          <div>
            <div className="font-semibold mb-1">Recompute all embeddings</div>
            <pre className="text-xs">pnpm embed:competencies --exam sitecore-xmc --recompute</pre>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          💡 Tip: Manage competencies visually at{' '}
          <Link href="/dev/competencies" className="text-blue-600 hover:underline">
            /dev/competencies
          </Link>
        </div>
      </Card>

      {/* Vector Search Setup */}
      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Vector Search Setup</h2>
        <p className="text-sm text-muted-foreground">
          Create and manage MongoDB Atlas Vector Search indexes for semantic search capabilities.
        </p>
        <div className="rounded-md border p-4 bg-muted/40 font-mono text-sm space-y-3">
          <div>
            <div className="font-semibold mb-1">Create question embeddings index</div>
            <pre className="text-xs">pnpm create:vector-index</pre>
          </div>
          <div>
            <div className="font-semibold mb-1">Create competencies index</div>
            <pre className="text-xs">pnpm create:competencies-index</pre>
          </div>
          <div>
            <div className="font-semibold mb-1">Check vector search functionality</div>
            <pre className="text-xs">pnpm check:vector-search</pre>
          </div>
        </div>
      </Card>

      {/* Question Management */}
      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Question Management</h2>
        <p className="text-sm text-muted-foreground">Import, migrate, and manage exam questions.</p>
        <div className="rounded-md border p-4 bg-muted/40 font-mono text-sm space-y-3">
          <div>
            <div className="font-semibold mb-1">Seed exams from JSON files</div>
            <pre className="text-xs">pnpm seed:exams</pre>
          </div>
          <div>
            <div className="font-semibold mb-1">Migrate questions to collection</div>
            <pre className="text-xs">pnpm migrate:questions</pre>
          </div>
          <div>
            <div className="font-semibold mb-1">Sync questions from legacy format</div>
            <pre className="text-xs">pnpm sync:questions</pre>
          </div>
          <div>
            <div className="font-semibold mb-1">Check question status</div>
            <pre className="text-xs">pnpm status:questions</pre>
          </div>
        </div>
      </Card>

      {/* Related Tools */}
      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Related Tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/dev/search"
            className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <h3 className="font-semibold mb-1">Semantic Search</h3>
            <p className="text-sm text-muted-foreground">
              Test vector search functionality for questions
            </p>
          </Link>
          <Link
            href="/dev/dedupe"
            className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <h3 className="font-semibold mb-1">Dedupe Tool</h3>
            <p className="text-sm text-muted-foreground">
              Find and manage duplicate questions using similarity clustering
            </p>
          </Link>
          <Link
            href="/dev/competencies"
            className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <h3 className="font-semibold mb-1">Competencies Manager</h3>
            <p className="text-sm text-muted-foreground">
              Define and manage exam competency areas
            </p>
          </Link>
          <Link href="/import" className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
            <h3 className="font-semibold mb-1">Import Questions</h3>
            <p className="text-sm text-muted-foreground">
              Bulk import questions from JSON files
            </p>
          </Link>
        </div>
      </Card>
    </div>
  );
}
