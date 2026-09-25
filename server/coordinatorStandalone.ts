import express from 'express';
import { initDatabase } from './db.js';
import { createCoordinatorRouter } from './coordinator.js';

async function main() {
  const app = express();
  const PORT = parseInt(process.env.COORDINATOR_PORT || '4000', 10);
  app.use(express.json());

  console.log('[Standalone Coordinator] Initializing database...');
  await initDatabase();

  const router = createCoordinatorRouter();
  app.use('/api', router);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Standalone Coordinator] Listening on http://0.0.0.0:${PORT}/api`);
  });
}

main().catch(console.error);
