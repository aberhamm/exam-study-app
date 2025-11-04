'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type ExitIntent = 'navigate' | 'manual';

type Props = {
  open: boolean;
  intent: ExitIntent;
  onOpenChange: (open: boolean) => void;
  onConfirm: (action: 'pause' | 'quit') => void;
};

const COPY: Record<ExitIntent, { title: string; description: string; quitLabel: string }> = {
  navigate: {
    title: 'Leave the exam?',
    description:
      'You have an active exam in progress. Pause to resume later with your progress saved, or quit to discard your current attempt.',
    quitLabel: 'Quit and leave',
  },
  manual: {
    title: 'Quit this exam?',
    description:
      'You can pause to keep your progress and resume later, or quit to abandon this attempt entirely.',
    quitLabel: 'Quit exam',
  },
};

export function QuitDialog({ open, onOpenChange, onConfirm, intent }: Props) {
  const copy = COPY[intent];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => onConfirm('pause')}
          >
            Pause and leave
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm('quit')}
            className="bg-red-600 hover:bg-red-700"
          >
            {copy.quitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
