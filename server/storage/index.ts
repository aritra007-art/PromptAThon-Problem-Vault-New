import { StorageProvider } from './storageProvider';
import { LocalStorageProvider } from './localStorageProvider';
import { SupabaseStorageProvider } from './supabaseStorageProvider';

let activeStorageProvider: StorageProvider | null = null;

export async function getStorageProvider(): Promise<StorageProvider> {
  if (activeStorageProvider) {
    return activeStorageProvider;
  }

  const mode = (process.env.STORAGE_MODE || 'local').toLowerCase();

  if (mode === 'supabase') {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      console.log('☁️ [Storage] Initializing Supabase Storage Provider (Bucket: vault-objects)...');
      const provider = new SupabaseStorageProvider(supabaseUrl, supabaseKey);
      await provider.init();
      activeStorageProvider = provider;
      return provider;
    } else {
      console.warn(
        '⚠️ [Storage] STORAGE_MODE=supabase requested, but credentials not provided. Falling back to local filesystem storage.'
      );
    }
  }

  console.log('📂 [Storage] Initializing Local Filesystem Storage Provider (storage/node1..node4)...');
  const provider = new LocalStorageProvider();
  await provider.init();
  activeStorageProvider = provider;
  return provider;
}

export * from './storageProvider';
export * from './localStorageProvider';
export * from './supabaseStorageProvider';
