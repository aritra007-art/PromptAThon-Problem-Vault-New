import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { createCoordinatorRouter } from './server/coordinator';
import { startAllStorageNodes } from './server/nodes/clusterNodes';
import { getDatabaseProvider } from './server/db';
import { getStorageProvider } from './server/storage';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const STORAGE_MODE = process.env.STORAGE_MODE || 'local';
const DATABASE_MODE = process.env.DATABASE_MODE || 'sqlite';

async function startServer() {
  const app = express();

  console.log('====================================================');
  console.log('🛡️  Aritra\'s Vault: Distributed Object Storage');
  console.log(`   DATABASE_MODE: ${DATABASE_MODE}`);
  console.log(`   STORAGE_MODE:  ${STORAGE_MODE}`);
  console.log('====================================================');

  // Initialize DB and Storage Providers
  await getDatabaseProvider();
  await getStorageProvider();

  // If in local storage mode, start the 4 independent HTTP storage nodes
  if (STORAGE_MODE === 'local') {
    try {
      await startAllStorageNodes();
    } catch (err) {
      console.warn('⚠️ Some local storage nodes could not be bound:', err);
    }
  } else {
    console.log('☁️  Cloud storage mode active. Using Supabase bucket "vault-objects" with logical replica paths (node-1..4).');
  }

  // Coordinator API Routes
  app.use('/api/vault', createCoordinatorRouter());

  // Mount Vite middlewares in development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static build
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Vault Coordinator & UI running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Fatal error starting Vault server:', err);
  process.exit(1);
});
