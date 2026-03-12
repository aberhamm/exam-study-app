import { createClient } from '@supabase/supabase-js';

/**
 * Minimal database type stub that satisfies the Supabase client's `.schema()`
 * constraint (`DynamicSchema extends string & keyof Omit<Database, '__InternalSupabase'>`).
 *
 * Without a generated Database type, `keyof Omit<Database, '__InternalSupabase'>` resolves
 * to `never`, making `.schema('quiz')` a type error. Providing this stub unblocks the
 * constraint so TypeScript accepts the schema name at compile time.
 *
 * Replace this with a proper generated type (via `supabase gen types typescript --schema quiz`)
 * for full type safety on table queries.
 */
type QuizDatabase = {
  quiz: Record<string, unknown>;
};

const globalForSupabase = globalThis as typeof globalThis & {
  __supabaseAdminClient?: ReturnType<typeof createClient<QuizDatabase>>;
};

function getAdminClient() {
  if (!globalForSupabase.__supabaseAdminClient) {
    globalForSupabase.__supabaseAdminClient = createClient<QuizDatabase>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return globalForSupabase.__supabaseAdminClient;
}

/**
 * Returns a Supabase admin client scoped to the quiz schema.
 * Use this for all server-side reads and writes to quiz.* tables.
 */
export function getDb() {
  return getAdminClient().schema('quiz');
}
