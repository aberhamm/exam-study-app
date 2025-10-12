'use client';

import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          success:
            'group-[.toast]:border-green-200 group-[.toast]:bg-green-50 group-[.toast]:text-green-900 dark:group-[.toast]:border-green-800 dark:group-[.toast]:bg-green-900/40 dark:group-[.toast]:text-green-200',
          error:
            'group-[.toast]:border-red-200 group-[.toast]:bg-red-50 group-[.toast]:text-red-900 dark:group-[.toast]:border-red-800 dark:group-[.toast]:bg-red-900/40 dark:group-[.toast]:text-red-200',
          info: 'group-[.toast]:border-blue-200 group-[.toast]:bg-blue-50 group-[.toast]:text-blue-900 dark:group-[.toast]:border-blue-800 dark:group-[.toast]:bg-blue-900/40 dark:group-[.toast]:text-blue-200',
        },
      }}
      duration={3000}
    />
  );
}
