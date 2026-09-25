import { createStorageNodeServer } from './storageNodeServer';

const NODES_CONFIG = [
  { nodeId: 'node-1', port: 5001, storageDir: 'storage/node1' },
  { nodeId: 'node-2', port: 5002, storageDir: 'storage/node2' },
  { nodeId: 'node-3', port: 5003, storageDir: 'storage/node3' },
  { nodeId: 'node-4', port: 5004, storageDir: 'storage/node4' },
];

export function startAllStorageNodes(): Promise<void[]> {
  console.log('🚀 Starting 4 Independent Vault Storage Nodes...');
  return Promise.all(
    NODES_CONFIG.map(cfg => {
      return new Promise<void>((resolve, reject) => {
        const app = createStorageNodeServer(cfg);
        const server = app.listen(cfg.port, () => {
          console.log(`  [Storage Node] ${cfg.nodeId} listening on http://127.0.0.1:${cfg.port} (Dir: ${cfg.storageDir})`);
          resolve();
        });
        server.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`  [Storage Node] Port ${cfg.port} already in use, reusing existing instance.`);
            resolve();
          } else {
            reject(err);
          }
        });
      });
    })
  );
}

// Standalone execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  startAllStorageNodes().catch(err => {
    console.error('Failed to start storage nodes:', err);
    process.exit(1);
  });
}
