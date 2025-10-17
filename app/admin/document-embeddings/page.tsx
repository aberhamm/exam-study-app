'use client';

import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHeader } from '@/contexts/HeaderContext';
import EmbeddingPipelineDemo from '@/components/embeddings/EmbeddingPipelineDemo';

type DocumentSearchResult = {
  score: number;
  document: {
    text: string;
    title?: string;
    url?: string;
    groupId?: string;
    sourceFile: string;
    sourceBasename?: string;
    sectionPath?: string;
    nearestHeading?: string;
    chunkIndex: number;
    chunkTotal: number;
    startIndex: number;
    endIndex: number;
  };
};

type SearchResponse = {
  topK: number;
  count: number;
  results: DocumentSearchResult[];
};

type GroupListResponse = { groups: string[] };

export default function DocumentEmbeddingsSearchPage() {
  const { setConfig, resetConfig } = useHeader();

  // Header with breadcrumbs
  useEffect(() => {
    setConfig({
      visible: true,
      variant: 'full',
      leftContent: (
        <Breadcrumbs
          items={[{ label: 'Home', href: '/' }, { label: 'Admin' }, { label: 'Document Embeddings' }]}
        />
      ),
      rightContent: null,
    });
    return () => resetConfig();
  }, [resetConfig, setConfig]);

  // Search state
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState<number>(10);
  const [groupId, setGroupId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DocumentSearchResult[]>([]);

  // Groups state
  const [groups, setGroups] = useState<string[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    const loadGroups = async () => {
      setGroupsLoading(true);
      setGroupsError(null);
      try {
        const resp = await fetch('/api/documents/groups', { cache: 'no-store' });
        if (!resp.ok) {
          throw new Error(`Failed to load groups (${resp.status})`);
        }
        const json = (await resp.json()) as GroupListResponse;
        if (!aborted) setGroups(Array.isArray(json.groups) ? json.groups : []);
      } catch (err) {
        if (!aborted) setGroupsError(err instanceof Error ? err.message : 'Failed to load groups');
      } finally {
        if (!aborted) setGroupsLoading(false);
      }
    };
    loadGroups();
    return () => {
      aborted = true;
    };
  }, []);

  const canSearch = useMemo(() => query.trim().length > 0 && !loading, [query, loading]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const body: Record<string, unknown> = {
        query: query.trim(),
        topK: Math.min(Math.max(Number(topK) || 10, 1), 50),
      };
      if (groupId) body.groupId = groupId;

      const resp = await fetch('/api/search/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (resp.status === 401 || resp.status === 403) {
        setError('Admin access required to use document search.');
        return;
      }
      if (!resp.ok) {
        const text = await resp.text();
        setError(`Search failed (${resp.status}). ${text || ''}`.trim());
        return;
      }

      const json = (await resp.json()) as SearchResponse;
      setResults(Array.isArray(json.results) ? json.results : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <EmbeddingPipelineDemo />
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-2xl font-semibold">Document Embeddings</h2>
        <p className="text-sm text-muted-foreground">
          Search embedded documentation chunks using semantic similarity. Admin only.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="md:col-span-2">
              <label
                className="block text-xs font-medium text-muted-foreground mb-1"
                htmlFor="query"
              >
                Query
              </label>
              <input
                id="query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. How are Sitecore XM Cloud webhooks configured?"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={loading}
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium text-muted-foreground mb-1"
                htmlFor="groupId"
              >
                Group
              </label>
              <select
                id="groupId"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={loading || groupsLoading}
              >
                <option value="">All groups</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              {groupsError && (
                <div className="mt-1 text-xs text-red-600">Failed to load groups</div>
              )}
            </div>
            <div>
              <label
                className="block text-xs font-medium text-muted-foreground mb-1"
                htmlFor="topK"
              >
                Top K
              </label>
              <input
                id="topK"
                type="number"
                min={1}
                max={50}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value) || 10)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={!canSearch}>
              {loading ? 'Searching…' : 'Search'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResults([])}
              disabled={loading}
            >
              Clear Results
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link href="/admin/developer-docs">Developer Guides</Link>
            </Button>
          </div>
        </form>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Results */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {results.length > 0
                ? `Showing ${results.length} result${results.length === 1 ? '' : 's'}${
                    groupId ? ` in group “${groupId}”` : ''
                  }`
                : 'No results yet'}
            </div>
          </div>

          {results.length === 0 && !loading && !error && query.trim().length > 0 && (
            <div className="text-sm text-muted-foreground">
              No results found. Ensure document embeddings exist and your OpenAI key is configured.
            </div>
          )}

          <div className="divide-y divide-border rounded-md border border-border">
            {results.map((r, idx) => {
              const d = r.document;
              const title = d.title || d.nearestHeading || d.text.slice(0, 64);
              const file = d.sourceBasename || d.sourceFile;
              const textPreview = d.text.length > 500 ? `${d.text.slice(0, 500)}…` : d.text;
              return (
                <div key={idx} className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium truncate" title={title}>
                      {title}
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      score {r.score.toFixed(4)}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                    {d.groupId && <span>group: {d.groupId}</span>}
                    <span>file: {file}</span>
                    {d.sectionPath && <span>section: {d.sectionPath}</span>}
                    <span>
                      chunk: {d.chunkIndex + 1}/{d.chunkTotal}
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap text-sm bg-muted/40 rounded p-2 overflow-x-auto">
                    {textPreview}
                  </pre>
                  {d.url && (
                    <div className="text-xs">
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Open source
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
