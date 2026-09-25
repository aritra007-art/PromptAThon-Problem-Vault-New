import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './server/db.js';
import { createStorageNodeServer, DEFAULT_STORAGE_NODES } from './server/storageNode.js';
import { createCoordinatorRouter } from './server/coordinator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Parse JSON bodies for coordinator
  app.use(express.json());

  // Initialize persistent SQLite metadata database
  console.log('[Vault Server] Initializing SQLite metadata database...');
  await initDatabase();
  console.log('[Vault Server] SQLite metadata database ready.');

  // Launch the 4 Storage Node Daemons on ports 5001, 5002, 5003, 5004
  for (const nodeConfig of DEFAULT_STORAGE_NODES) {
    const { app: nodeApp } = createStorageNodeServer(nodeConfig);
    const server = nodeApp.listen(nodeConfig.port, '0.0.0.0', () => {
      console.log(`[Storage Daemon] ${nodeConfig.name} (${nodeConfig.id}) online on http://127.0.0.1:${nodeConfig.port} [dir: ${nodeConfig.storageDir}]`);
    });
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Storage Daemon] ${nodeConfig.name} port ${nodeConfig.port} already in use (assumed external daemon running).`);
      } else {
        console.error(`[Storage Daemon] Error starting ${nodeConfig.id}:`, err);
      }
    });
  }

  // Mount Coordinator API Router at /api
  const coordinatorRouter = createCoordinatorRouter();
  app.use('/api', coordinatorRouter);

  // Setup Vite middleware in dev or static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Vault Server] Coordinator & Web UI active on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[Vault Server] Failed to start cluster:', err);
  process.exit(1);
});
