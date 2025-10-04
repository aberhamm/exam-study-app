"use client";

import Link from 'next/link';
import { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHeader } from '@/contexts/HeaderContext';
import { APP_CONFIG } from '@/lib/app-config';
import { DevNavigation } from '@/components/DevNavigation';

export default function DocumentEmbeddingsDevPage() {
  const DEV = APP_CONFIG.DEV_FEATURES_ENABLED;
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
      rightContent: <DevNavigation currentPage="document-embeddings" />,
    });
    return () => resetConfig();
  }, [resetConfig, setConfig]);

  if (!DEV) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-2xl font-semibold mb-2">Document Embeddings Disabled</h2>
          <p className="text-sm text-muted-foreground">This tool is available only in development.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Document Embeddings Management</h2>
        <p className="text-sm text-muted-foreground">
          Tools for managing document embeddings used in AI explanation generation. This collection stores chunks of documentation with vector embeddings for semantic search.
        </p>
        <div className="rounded-md border p-4 bg-muted/40 font-mono text-sm space-y-2">
          <div>
            <div className="font-semibold">Process markdown documentation</div>
            <pre className="mt-1">cd data-pipelines && pnpm markdown-to-embeddings</pre>
          </div>
          <div>
            <div className="font-semibold">Create vector index</div>
            <pre className="mt-1">cd data-pipelines && pnpm tsx scripts/create-embeddings-index.ts</pre>
          </div>
          <div>
            <div className="font-semibold">Test document search</div>
            <pre className="mt-1">cd data-pipelines && pnpm tsx scripts/test-embeddings-search.ts --query &quot;your text&quot;</pre>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/dev/docs">
            <Button variant="outline">Browse Documents</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
