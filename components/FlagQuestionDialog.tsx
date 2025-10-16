'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Flag } from 'lucide-react';
import SpinnerButton from '@/components/ui/SpinnerButton';

type FlagQuestionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
  currentReason?: string;
  isFlagged?: boolean;
};

export function FlagQuestionDialog({
  open,
  onOpenChange,
  onConfirm,
  currentReason,
  isFlagged = false,
}: FlagQuestionDialogProps) {
  const [reason, setReason] = useState(currentReason || '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(currentReason || '');
    }
  }, [open, currentReason]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onConfirm(reason);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to flag question:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              {isFlagged ? 'Update Flag' : 'Flag Question for Review'}
            </DialogTitle>
            <DialogDescription>
              {isFlagged
                ? 'Update the reason for flagging this question or remove the flag.'
                : 'Mark this question for review. Optionally provide a reason to help with the review process.'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <label htmlFor="reason" className="text-sm font-medium text-foreground block mb-2">
              Reason (Optional)
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Unclear wording, potential error in answer, needs better explanation..."
              className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={submitting}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <SpinnerButton type="submit" disabled={false} loading={submitting} loadingText={isFlagged ? 'Updating...' : 'Flagging...'}>
              <span className="inline-flex items-center">
                <Flag className="h-4 w-4 mr-2" />
                {isFlagged ? 'Update Flag' : 'Flag Question'}
              </span>
            </SpinnerButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
