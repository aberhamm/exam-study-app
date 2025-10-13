'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHeader } from '@/contexts/HeaderContext';
import { DevNavigation } from '@/components/DevNavigation';

type ApiDocumentResult = {
  score: number;
  document: {
    text: string;
    sourceFile?: string;
    sourceBasename?: string;
    groupId?: string;
    title?: string;
    description?: string;
    url?: string;
    tags?: string[];
    sectionPath?: string;
    nearestHeading?: string;
    chunkIndex?: number;
    chunkTotal?: number;
  };
};

export default function SearchDevPage() {
  const { setConfig, resetConfig } = useHeader();
  const [groupId, setGroupId] = useState('');
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentResults, setDocumentResults] = useState<ApiDocumentResult[]>([]);

  useEffect(() => {
    setConfig({
      visible: true,
      variant: 'full',
      leftContent: (
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Home
        </Link>
      ),
      rightContent: <DevNavigation currentPage="search" />,
    });
    return () => {
      resetConfig();
    };
  }, [resetConfig, setConfig]);

  const canSubmit = useMemo(() => {
    return query.trim().length > 0 && !submitting;
  }, [query, submitting]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setDocumentResults([]);

    try {
      const resp = await fetch('/api/search/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, topK, groupId: groupId || undefined }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(
          typeof json?.error === 'string' ? json.error : `Search failed (${resp.status})`
        );
      }
      const items = Array.isArray(json?.results) ? (json.results as ApiDocumentResult[]) : [];
      setDocumentResults(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrySample = () => {
    if (!query) {
      setQuery('experience edge publishing pipeline');
    }
  };


  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-2">Document Semantic Search</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Search documentation via vector similarity. Requires populated embeddings and a MongoDB Atlas
          vector index.
        </p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="group-input">
                Group ID <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                id="group-input"
                type="text"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Filter by group ID…"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium" htmlFor="query">
                Query
              </label>
              <input
                id="query"
                type="text"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Describe what you're looking for…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <label className="text-sm" htmlFor="topk">
                  Top K
                </label>
                <input
                  id="topk"
                  type="number"
                  min={1}
                  max={100}
                  value={topK}
                  onChange={(e) => setTopK(Math.min(100, Math.max(1, Number(e.target.value))))}
                  className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button type="button" variant="ghost" onClick={handleTrySample}>
                  Try sample
                </Button>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Searching…' : 'Search'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-2">Results</h3>
        {submitting && (
          <ul className="space-y-4">
            {Array.from({ length: topK }).map((_, idx) => (
              <li key={idx} className="rounded-md border border-border p-4 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-4 w-24 bg-muted rounded" />
                </div>
                <div className="mt-2 h-5 w-3/4 bg-muted rounded" />
                <div className="mt-2 space-y-2">
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-full bg-muted rounded" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {!submitting && documentResults.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No results yet. Submit a query to see matches.
          </p>
        )}
        {!submitting && documentResults.length > 0 && (
          <ul className="space-y-4">
            {documentResults.map((item, idx) => (
              <li key={`${item.document.sourceFile}-${item.document.chunkIndex}-${idx}`} className="rounded-md border border-border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {item.document.sourceBasename || item.document.sourceFile}
                    {item.document.chunkIndex !== undefined && ` (chunk ${item.document.chunkIndex}/${item.document.chunkTotal})`}
                  </p>
                  <p className="text-sm">
                    Score: <span className="font-mono">{item.score.toFixed(4)}</span>
                  </p>
                </div>
                {item.document.title && (
                  <h4 className="mt-2 font-semibold">{item.document.title}</h4>
                )}
                {item.document.sectionPath && (
                  <p className="text-sm text-muted-foreground">
                    Section: {item.document.sectionPath}
                  </p>
                )}
                {item.document.nearestHeading && (
                  <p className="text-sm text-muted-foreground">
                    Heading: {item.document.nearestHeading}
                  </p>
                )}
                <p className="mt-2 text-sm whitespace-pre-wrap">{item.document.text}</p>
                {item.document.url && (
                  <p className="mt-2 text-sm">
                    <a href={item.document.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {item.document.url}
                    </a>
                  </p>
                )}
                {item.document.tags && item.document.tags.length > 0 && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {item.document.tags.map((tag) => (
                      <span key={tag} className="text-xs bg-muted px-2 py-1 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {item.document.groupId && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Group: <span className="font-mono">{item.document.groupId}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
