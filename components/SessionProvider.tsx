'use client';

import type { ReactNode } from 'react';

/**
 * Session provider for Supabase auth
 * Note: Supabase handles sessions automatically, so this is just a passthrough
 * for compatibility with existing code structure
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
