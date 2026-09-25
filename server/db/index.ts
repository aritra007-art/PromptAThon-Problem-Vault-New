import { DatabaseProvider } from './types';
import { SQLiteProvider } from './sqlite';
import { SupabaseProvider } from './supabase';

let activeDatabaseProvider: DatabaseProvider | null = null;

export async function getDatabaseProvider(): Promise<DatabaseProvider> {
  if (activeDatabaseProvider) {
    return activeDatabaseProvider;
  }

  const mode = (process.env.DATABASE_MODE || 'sqlite').toLowerCase();

  if (mode === 'supabase') {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      console.log('⚡ [Database] Initializing Supabase PostgreSQL Provider (Cloud Mode)...');
      const provider = new SupabaseProvider(supabaseUrl, supabaseKey);
      await provider.init();
      activeDatabaseProvider = provider;
      return provider;
    } else {
      console.warn(
        '⚠️ [Database] DATABASE_MODE=supabase requested, but SUPABASE_URL / key not provided. Falling back to local SQLite provider.'
      );
    }
  }

  console.log('📁 [Database] Initializing SQLite / Local File Metadata Provider (Local Mode)...');
  const provider = new SQLiteProvider();
  await provider.init();
  activeDatabaseProvider = provider;
  return provider;
}

export * from './types';
export * from './sqlite';
export * from './supabase';
