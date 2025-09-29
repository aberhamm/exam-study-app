"use client";

import Link from 'next/link';
import { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHeader } from '@/contexts/HeaderContext';
import { APP_CONFIG } from '@/lib/app-config';

export default function EmbeddingsDevPage() {
  const DEV = APP_CONFIG.DEV_FEATURES_ENABLED;
  const { setConfig, resetConfig } = useHeader();

  useEffect(() => {
    setConfig({
      visible: true,
      variant: 'full',
      leftContent: (
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Quiz
        </Link>
      ),
    });
    return () => resetConfig();
  }, [resetConfig, setConfig]);

  if (!DEV) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-2xl font-semibold mb-2">Embeddings Disabled</h2>
          <p className="text-sm text-muted-foreground">This tool is available only in development.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Generate Question Embeddings</h2>
        <p className="text-sm text-muted-foreground">
          Use the following commands to generate and store embeddings for questions. Ensure
          <code className="mx-1">OPENAI_API_KEY</code> is configured in your environment and you have created a
          vector index on <code className="mx-1">questions.embedding</code> if using MongoDB Atlas Vector Search.
        </p>
        <div className="rounded-md border p-4 bg-muted/40 font-mono text-sm space-y-2">
          <div>
            <div className="font-semibold">Embed all questions</div>
            <pre className="mt-1">pnpm embed:questions</pre>
          </div>
          <div>
            <div className="font-semibold">Embed a single exam</div>
            <pre className="mt-1">pnpm embed:questions --exam sitecore-xmc</pre>
          </div>
          <div>
            <div className="font-semibold">Recompute embeddings</div>
            <pre className="mt-1">pnpm embed:questions --recompute</pre>
          </div>
          <div>
            <div className="font-semibold">Limit and batch size</div>
            <pre className="mt-1">pnpm embed:questions --limit 100 --batch 32</pre>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/dev/search">
            <Button variant="outline">Go to Semantic Search</Button>
          </Link>
          <Link href="/import" className="text-sm text-muted-foreground hover:text-foreground">
            Import Questions
          </Link>
        </div>
      </Card>
    </div>
  );
}

