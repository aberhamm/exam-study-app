'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import TypewriterText from '@/components/ui/TypewriterText';

type Props = {
  className?: string;
};

type Step = 0 | 1 | 2 | 3 | 4;

const STEP_TITLES: Record<Step, string> = {
  0: 'Parse Markdown → sections',
  1: 'Chunk sections into passages',
  2: 'Generate vector embeddings',
  3: 'Store vectors in the index',
  4: 'Search: embed query and retrieve top‑K',
};

export default function EmbeddingPipelineDemo({ className }: Props) {
  const [step, setStep] = useState<Step>(0);
  const timerRef = useRef<number | null>(null);
  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    // advance steps every 1.8s
    timerRef.current = window.setInterval(() => {
      setStep((s) => ((s + 1) % 5) as Step);
    }, 1800) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [reducedMotion]);

  const restart = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setStep(0);
    if (!reducedMotion) {
      timerRef.current = window.setInterval(() => {
        setStep((s) => ((s + 1) % 5) as Step);
      }, 1800) as unknown as number;
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">How document embeddings work</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">{STEP_TITLES[step]}</span>
          <button
            type="button"
            onClick={restart}
            className="rounded border border-border bg-background px-2 py-1 hover:bg-muted"
            aria-label="Replay animation"
          >
            Replay
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Visual flow */}
        <div className="lg:col-span-3">
          <div className="relative rounded-lg border border-border bg-muted/20 p-4 overflow-hidden">
            {/* 1) Markdown document */}
            <StageContainer active={step === 0} label="Markdown">
              <div className="rounded-md border bg-background p-3 text-xs leading-relaxed">
                <TypewriterText
                  enabled={!reducedMotion}
                  text={`# Webhooks
When content is published, XM Cloud emits webhook events.

## Configure
- Create an endpoint
- Add a secret
- Verify signatures
`}
                  className="whitespace-pre-wrap"
                />
              </div>
            </StageContainer>

            <Arrow hidden={reducedMotion} />

            {/* 2) Chunking */}
            <StageContainer active={step === 1} label="Chunking">
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-14 rounded border bg-background p-2 text-[10px] text-muted-foreground ${
                      step === 1 ? 'animate-pulse' : ''
                    }`}
                  >
                    Chunk {i + 1}
                  </div>
                ))}
              </div>
            </StageContainer>

            <Arrow hidden={reducedMotion} />

            {/* 3) Embedding */}
            <StageContainer active={step === 2} label="Embeddings">
              <div className="grid grid-cols-6 gap-1">
                {Array.from({ length: 36 }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 w-2 rounded-full ${dotColor(i)} ${
                      step === 2 ? 'animate-[pulse_1.6s_ease-in-out_infinite]' : ''
                    }`}
                    aria-hidden
                  />
                ))}
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">Vector space (d ≈ 1536)</div>
            </StageContainer>

            <Arrow hidden={reducedMotion} />

            {/* 4) Vector index */}
            <StageContainer active={step === 3} label="Vector Index">
              <IndexCylinder active={step === 3} />
            </StageContainer>

            <Arrow hidden={reducedMotion} />

            {/* 5) Query + retrieval */}
            <StageContainer active={step === 4} label="Search">
              <div className="flex items-center gap-2">
                <div className={`flex-1 rounded-md border bg-background px-3 py-2 text-xs ${!reducedMotion ? 'animate-[fade-in_0.4s_ease_0s_forwards] opacity-0' : ''}`}>
                  Query: How are XM Cloud webhooks configured?
                </div>
                <span className="text-[10px] text-muted-foreground">→ embed</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {['Top 1', 'Top 2', 'Top 3'].map((t, i) => (
                  <div
                    key={t}
                    className={`rounded-md border p-2 text-[10px] ${
                      step === 4 && !reducedMotion ? `animate-[fade-in_0.3s_ease_${i * 0.15}s_forwards] opacity-0` : ''
                    }`}
                  >
                    {t}: Matching chunk
                  </div>
                ))}
              </div>
            </StageContainer>
          </div>
        </div>

        {/* Step legend */}
        <div className="lg:col-span-2">
          <ol className="space-y-3">
            {(Object.keys(STEP_TITLES).map((x) => Number(x)) as Step[]).map((k) => (
              <li key={k} className={`rounded-md border p-3 text-sm ${step === k ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'bg-muted/20'}`}>
                <div className="font-medium">{STEP_TITLES[k]}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {k === 0 && 'Markdown is parsed into headings and sections.'}
                  {k === 1 && 'Sections are split into overlapping chunks for better recall.'}
                  {k === 2 && 'Each chunk is converted into a dense vector representation.'}
                  {k === 3 && 'Vectors are stored in a searchable index with metadata.'}
                  {k === 4 && 'The query is embedded; nearest neighbors (top‑K) are returned.'}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* local keyframes for small, focused effects */}
      <style jsx>{`
        @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  );
}

function StageContainer({ active, label, children }: { active: boolean; label: string; children: React.ReactNode }) {
  return (
    <div className={`relative mb-6 rounded-lg border p-4 ${active ? 'ring-2 ring-primary/60' : ''}`}>
      <div className="absolute -top-2 left-3 rounded bg-background px-2 text-[10px] text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function Arrow({ hidden }: { hidden?: boolean }) {
  if (hidden) return <div className="h-4" />;
  return (
    <div className="flex items-center justify-center my-1">
      <div className="h-4 w-4 rotate-90 text-muted-foreground">↓</div>
    </div>
  );
}

function dotColor(i: number): string {
  const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-fuchsia-500'];
  return colors[i % colors.length] ?? 'bg-gray-400';
}

function IndexCylinder({ active }: { active: boolean }) {
  return (
    <div className="relative">
      <div className="mx-auto h-2 w-40 rounded-full bg-gradient-to-r from-muted to-muted-foreground/20" />
      <div className={`mx-auto mt-1 h-16 w-40 rounded-b-lg rounded-t-[40%] border bg-background ${active ? 'animate-pulse' : ''}`} />
    </div>
  );
}
