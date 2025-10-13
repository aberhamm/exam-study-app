import NextAuth, { DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyCredentials } from './server/users';
import type { User } from '@/types/user';
import {
  isRateLimited,
  recordFailedAttempt,
  recordSuccessfulAttempt,
} from './rate-limit';
import { authConfig } from './env-config';

// Extend NextAuth types
declare module 'next-auth' {
  interface Session {
    user: User & DefaultSession['user'];
  }

  interface User {
    id: string;
    username: string;
    role: 'admin' | 'user';
  }
}


export const { handlers, signIn, signOut, auth } = NextAuth({
  basePath: '/api/auth',
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const username = credentials.username as string;

        // Check rate limiting
        const rateLimitCheck = isRateLimited(username);
        if (rateLimitCheck.limited) {
          console.warn(`Rate limit exceeded for user: ${username}`);
          // Return null to indicate failed authentication
          // The error message will be generic to prevent user enumeration
          return null;
        }

        // Verify credentials
        const user = await verifyCredentials(
          username,
          credentials.password as string
        );

        if (user) {
          // Successful login - clear rate limit
          recordSuccessfulAttempt(username);
          return user;
        } else {
          // Failed login - record attempt
          recordFailedAttempt(username);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.role = token.role as 'admin' | 'user';
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    // Session expiration configured via SESSION_MAX_AGE environment variable
    // Default: 8 hours. Set to 0 or "never" for sessions that never expire.
    maxAge: authConfig.sessionMaxAge,
    // Session activity update interval configured via SESSION_UPDATE_AGE
    // Default: 1 hour
    updateAge: authConfig.sessionUpdateAge,
  },
  trustHost: true,
});

/**
 * Get the current session
 */
export async function getSession() {
  return await auth();
}

/**
 * Get the current user
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Check if current user is admin
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === 'admin';
}

/**
 * Require admin role (throw error if not admin)
 */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('Unauthorized: No user session');
  }

  if (user.role !== 'admin') {
    throw new Error('Forbidden: Admin role required');
  }

  return user;
}
