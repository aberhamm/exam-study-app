// src/components/StudyPanel.tsx
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Props = {
  study?: Array<{ chunkId: string; url?: string; anchor?: string; excerpt?: string }>;
};

export function StudyPanel({ study }: Props) {
  if (!study || study.length === 0) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="font-medium">Recommended reading</div>
      <ul className="space-y-3">
        {study.map((s) => (
          <li key={s.chunkId}>
            {s.excerpt && <p className="text-sm opacity-90 text-muted-foreground">{s.excerpt}</p>}
            {s.url && (
              <Button asChild variant="link" className="px-0">
                <a href={s.url} target="_blank" rel="noreferrer">
                  Open documentation →
                </a>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
