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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmQuit: () => void;
};

export function QuitDialog({ open, onOpenChange, onConfirmQuit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quit Exam</DialogTitle>
          <DialogDescription>
            Are you sure you want to quit and go home? This will lose your current progress.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirmQuit();
            }}
            className="bg-red-600 hover:bg-red-700"
          >
            Quit and go Home
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}