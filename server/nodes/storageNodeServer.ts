import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export interface StorageNodeServerOptions {
  nodeId: string;
  port: number;
  storageDir: string;
}

export function createStorageNodeServer(options: StorageNodeServerOptions) {
  const app = express();
  app.use(express.raw({ type: '*/*', limit: '100mb' }));
  app.use(express.json());

  let isOffline = false;
  let isPartitioned = false;

  const nodeDir = path.resolve(process.cwd(), options.storageDir);
  if (!fs.existsSync(nodeDir)) {
    fs.mkdirSync(nodeDir, { recursive: true });
  }

  // Middleware checking simulated fault states
  app.use((req, res, next) => {
    if (isOffline && !req.path.startsWith('/admin')) {
      return res.status(503).json({ error: `Node ${options.nodeId} is OFFLINE` });
    }
    if (isPartitioned && !req.path.startsWith('/admin')) {
      return res.status(504).json({ error: `Node ${options.nodeId} is PARTITIONED from cluster network` });
    }
    next();
  });

  // Health / Heartbeat check
  app.get('/health', (_req, res) => {
    res.json({
      nodeId: options.nodeId,
      status: 'HEALTHY',
      port: options.port,
      timestamp: new Date().toISOString(),
    });
  });

  // Put object
  app.put('/objects/:objectId', (req, res) => {
    try {
      const { objectId } = req.params;
      const filePath = path.join(nodeDir, objectId);
      const data = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || ''));
      fs.writeFileSync(filePath, data);

      const checksum = crypto.createHash('sha256').update(data).digest('hex');
      res.json({
        nodeId: options.nodeId,
        objectId,
        checksum,
        size: data.length,
        status: 'STORED',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get object
  app.get('/objects/:objectId', (req, res) => {
    try {
      const { objectId } = req.params;
      const filePath = path.join(nodeDir, objectId);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Object ${objectId} not found on node ${options.nodeId}` });
      }

      const data = fs.readFileSync(filePath);
      const checksum = crypto.createHash('sha256').update(data).digest('hex');
      res.setHeader('X-Vault-Checksum', checksum);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete object
  app.delete('/objects/:objectId', (req, res) => {
    try {
      const { objectId } = req.params;
      const filePath = path.join(nodeDir, objectId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      res.json({ nodeId: options.nodeId, objectId, status: 'DELETED' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Checksum scrubber
  app.get('/objects/:objectId/checksum', (req, res) => {
    try {
      const { objectId } = req.params;
      const filePath = path.join(nodeDir, objectId);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Object not found' });
      }

      const data = fs.readFileSync(filePath);
      const checksum = crypto.createHash('sha256').update(data).digest('hex');
      res.json({
        nodeId: options.nodeId,
        objectId,
        checksum,
        size: data.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin controls for simulating node failure / recovery / bitrot
  app.post('/admin/fail', (_req, res) => {
    isOffline = true;
    res.json({ nodeId: options.nodeId, status: 'OFFLINE' });
  });

  app.post('/admin/recover', (_req, res) => {
    isOffline = false;
    isPartitioned = false;
    res.json({ nodeId: options.nodeId, status: 'HEALTHY' });
  });

  app.post('/admin/partition', (_req, res) => {
    isPartitioned = true;
    res.json({ nodeId: options.nodeId, status: 'PARTITIONED' });
  });

  app.post('/admin/corrupt/:objectId', (req, res) => {
    try {
      const { objectId } = req.params;
      const filePath = path.join(nodeDir, objectId);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Object not found to corrupt' });
      }

      const buf = fs.readFileSync(filePath);
      const mutated = Buffer.from(buf);
      if (mutated.length > 0) {
        mutated[0] = mutated[0] ^ 0xff; // Invert bit
      } else {
        mutated.write('CORRUPTED_BYTES');
      }
      fs.writeFileSync(filePath, mutated);
      const newChecksum = crypto.createHash('sha256').update(mutated).digest('hex');

      res.json({
        nodeId: options.nodeId,
        objectId,
        corrupted: true,
        newChecksum,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}
