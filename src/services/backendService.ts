export interface BackendModeInfo {
  databaseMode: 'sqlite' | 'supabase';
  storageMode: 'local' | 'supabase';
  databaseProvider: string;
  storageProvider: string;
  isCloudMode: boolean;
}

// Client-side detection: checks if server responds with backend mode info, or falls back to client environment
let cachedBackendMode: BackendModeInfo | null = null;

export async function fetchBackendStatus(): Promise<BackendModeInfo> {
  if (cachedBackendMode) return cachedBackendMode;

  try {
    const res = await fetch('/api/vault/status');
    if (res.ok) {
      const data = await res.json();
      if (data.backendMode) {
        cachedBackendMode = data.backendMode;
        return data.backendMode;
      }
    }
  } catch (err) {
    // If running in pure Vite dev mode without server.ts proxy
  }

  // Fallback defaults
  cachedBackendMode = {
    databaseMode: 'sqlite',
    storageMode: 'local',
    databaseProvider: 'SQLite Embedded / Local File',
    storageProvider: 'Local Filesystem (4 Nodes)',
    isCloudMode: false,
  };
  return cachedBackendMode;
}
