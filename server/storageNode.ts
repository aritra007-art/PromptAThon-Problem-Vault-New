import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface NodeConfig {
  id: string;
  name: string;
  port: number;
  storageDir: string;
  region: string;
  capacityBytes: number;
}

export type StorageNodeSimState = 'HEALTHY' | 'OFFLINE' | 'PARTITIONED' | 'RECOVERING';

export function createStorageNodeServer(config: NodeConfig) {
  const app = express();
  const absoluteStorageDir = path.resolve(process.cwd(), config.storageDir);

  if (!fs.existsSync(absoluteStorageDir)) {
    fs.mkdirSync(absoluteStorageDir, { recursive: true });
  }

  let simState: StorageNodeSimState = 'HEALTHY';
  let failureReason: string | undefined;

  // Raw body parser for binary object streams up to 100MB
  app.use(express.raw({ type: '*/*', limit: '100mb' }));

  // Middleware to simulate network partition or offline state for coordinator calls
  app.use((req: Request, res: Response, next) => {
    // Admin management endpoints always respond
    if (req.path.startsWith('/admin') || req.path.startsWith('/simulate')) {
      return next();
    }

    if (simState === 'OFFLINE') {
      return res.status(503).json({
        error: 'Node Offline',
        nodeId: config.id,
        reason: failureReason || 'Hardware or daemon process halted',
      });
    }

    if (simState === 'PARTITIONED') {
      return res.status(504).json({
        error: 'Network Partition',
        nodeId: config.id,
        reason: 'Network isolate partition: node unreachable from coordinator',
      });
    }

    next();
  });

  // Helper to get on-disk objects
  function getDiskObjects(): { objectId: string; size: number; meta: any }[] {
    if (!fs.existsSync(absoluteStorageDir)) return [];
    const files = fs.readdirSync(absoluteStorageDir);
    const objectFiles = files.filter(f => !f.endsWith('.meta.json'));

    const list: { objectId: string; size: number; meta: any }[] = [];
    for (const f of objectFiles) {
      const filePath = path.join(absoluteStorageDir, f);
      const metaPath = path.join(absoluteStorageDir, `${f}.meta.json`);
      try {
        const stat = fs.statSync(filePath);
        let meta: any = {};
        if (fs.existsSync(metaPath)) {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        }
        list.push({
          objectId: f,
          size: stat.size,
          meta,
        });
      } catch (e) {
        // Skip unreadable files
      }
    }
    return list;
  }

  // 1. GET /health
  app.get('/health', (req: Request, res: Response) => {
    const diskObjs = getDiskObjects();
    const diskUsedBytes = diskObjs.reduce((acc, curr) => acc + curr.size, 0);

    // Baseline storage allocation
    const baseUsedBytes = 20 * 1024 * 1024 * 1024; // 20GB baseline
    const totalUsedBytes = baseUsedBytes + diskUsedBytes;

    res.json({
      id: config.id,
      name: config.name,
      port: config.port,
      status: simState,
      region: config.region,
      storageDir: config.storageDir,
      capacityBytes: config.capacityBytes,
      usedBytes: totalUsedBytes,
      storedObjects: diskObjs.map(d => d.objectId),
      objectCount: diskObjs.length,
      lastHeartbeat: new Date().toISOString(),
      latencyMs: Math.floor(Math.random() * 12) + 14,
      failureReason,
    });
  });

  // 2. GET /objects
  app.get('/objects', (req: Request, res: Response) => {
    const list = getDiskObjects();
    res.json({
      nodeId: config.id,
      count: list.length,
      objects: list.map(item => ({
        objectId: item.objectId,
        filename: item.meta.filename || item.objectId,
        size: item.size,
        version: item.meta.version || 1,
        checksum: item.meta.storedChecksum || '',
        isCorrupted: !!item.meta.isCorrupted,
        isStale: !!item.meta.isStale,
        storedAt: item.meta.storedAt,
      })),
    });
  });

  // 3. GET /objects/:objectId
  app.get('/objects/:objectId', (req: Request, res: Response) => {
    const { objectId } = req.params;
    const filePath = path.join(absoluteStorageDir, objectId);
    const metaPath = path.join(absoluteStorageDir, `${objectId}.meta.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `Object ${objectId} not found on ${config.id}` });
    }

    let meta: any = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (err) {}
    }

    const fileBuffer = fs.readFileSync(filePath);
    const actualChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${meta.filename || objectId}"`);
    res.setHeader('X-Object-Id', objectId);
    res.setHeader('X-Object-Checksum', actualChecksum);
    res.setHeader('X-Object-Version', String(meta.version || 1));
    res.setHeader('X-Node-Id', config.id);
    if (meta.isCorrupted || actualChecksum !== meta.expectedChecksum) {
      res.setHeader('X-Replica-Corrupted', 'true');
    }

    res.send(fileBuffer);
  });

  // 4. PUT /objects/:objectId (Store file bytes)
  app.put('/objects/:objectId', (req: Request, res: Response) => {
    const { objectId } = req.params;
    const filename = (req.query.filename as string) || (req.headers['x-filename'] as string) || objectId;
    const mimeType = (req.headers['content-type'] as string) || 'application/octet-stream';
    const version = parseInt((req.query.version as string) || (req.headers['x-version'] as string) || '1', 10);
    const expectedChecksum = (req.query.checksum as string) || (req.headers['x-checksum'] as string) || '';

    let dataBuffer: Buffer;
    if (Buffer.isBuffer(req.body)) {
      dataBuffer = req.body;
    } else if (typeof req.body === 'string') {
      dataBuffer = Buffer.from(req.body);
    } else {
      dataBuffer = Buffer.from('');
    }

    const filePath = path.join(absoluteStorageDir, objectId);
    const metaPath = path.join(absoluteStorageDir, `${objectId}.meta.json`);

    fs.writeFileSync(filePath, dataBuffer);

    const actualChecksum = crypto.createHash('sha256').update(dataBuffer).digest('hex');

    const meta = {
      objectId,
      filename,
      mimeType,
      size: dataBuffer.length,
      version,
      expectedChecksum: expectedChecksum || actualChecksum,
      storedChecksum: actualChecksum,
      isCorrupted: false,
      isStale: false,
      storedAt: new Date().toISOString(),
    };

    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    res.status(201).json({
      success: true,
      nodeId: config.id,
      objectId,
      filename,
      size: dataBuffer.length,
      version,
      checksum: actualChecksum,
      storedAt: meta.storedAt,
    });
  });

  // 5. DELETE /objects/:objectId
  app.delete('/objects/:objectId', (req: Request, res: Response) => {
    const { objectId } = req.params;
    const filePath = path.join(absoluteStorageDir, objectId);
    const metaPath = path.join(absoluteStorageDir, `${objectId}.meta.json`);

    let deleted = false;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      deleted = true;
    }
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
    }

    res.json({ success: true, nodeId: config.id, objectId, deleted });
  });

  // 6. GET /objects/:objectId/checksum (On-disk verification)
  app.get('/objects/:objectId/checksum', (req: Request, res: Response) => {
    const { objectId } = req.params;
    const filePath = path.join(absoluteStorageDir, objectId);
    const metaPath = path.join(absoluteStorageDir, `${objectId}.meta.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `Object ${objectId} not found on disk` });
    }

    let meta: any = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (err) {}
    }

    const fileBuffer = fs.readFileSync(filePath);
    const actualChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const isCorrupted = !!meta.isCorrupted || (meta.expectedChecksum && actualChecksum !== meta.expectedChecksum);

    res.json({
      nodeId: config.id,
      objectId,
      actualChecksum,
      expectedChecksum: meta.expectedChecksum || actualChecksum,
      isCorrupted,
      size: fileBuffer.length,
      version: meta.version || 1,
      lastVerifiedAt: new Date().toISOString(),
    });
  });

  // 7. POST /objects/:objectId/corrupt (Simulate bitrot/corruption on disk)
  app.post('/objects/:objectId/corrupt', (req: Request, res: Response) => {
    const { objectId } = req.params;
    const filePath = path.join(absoluteStorageDir, objectId);
    const metaPath = path.join(absoluteStorageDir, `${objectId}.meta.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `Object ${objectId} not found on disk` });
    }

    const buffer = fs.readFileSync(filePath);
    // Flip bytes or inject corrupting string
    if (buffer.length > 0) {
      buffer[0] = buffer[0] ^ 0xff; // Invert first byte
      if (buffer.length > 4) {
        buffer[4] = buffer[4] ^ 0xaa;
      }
    } else {
      fs.writeFileSync(filePath, Buffer.from('CORRUPTED_BITROT_BYTE_INJECTION'));
    }
    fs.writeFileSync(filePath, buffer);

    const newActualChecksum = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

    let meta: any = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (e) {}
    }
    meta.storedChecksum = newActualChecksum;
    meta.isCorrupted = true;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    res.json({
      success: true,
      nodeId: config.id,
      objectId,
      corruptedChecksum: newActualChecksum,
      expectedChecksum: meta.expectedChecksum,
      message: `Bitrot simulated: altered stored bytes for ${objectId}`,
    });
  });

  // 8. POST /objects/:objectId/stale (Simulate stale version)
  app.post('/objects/:objectId/stale', (req: Request, res: Response) => {
    const { objectId } = req.params;
    const metaPath = path.join(absoluteStorageDir, `${objectId}.meta.json`);

    if (!fs.existsSync(metaPath)) {
      return res.status(404).json({ error: `Object ${objectId} not found on disk` });
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.version = Math.max(1, (meta.version || 1) - 1);
    meta.isStale = true;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    res.json({
      success: true,
      nodeId: config.id,
      objectId,
      version: meta.version,
      message: `Replica downgraded to stale version v${meta.version}`,
    });
  });

  // Admin/Simulation controls
  app.post('/simulate/fail', (req: Request, res: Response) => {
    simState = 'OFFLINE';
    failureReason = req.body?.reason || 'Hardware daemon stopped / power outage';
    res.json({ success: true, nodeId: config.id, status: simState, reason: failureReason });
  });

  app.post('/simulate/partition', (req: Request, res: Response) => {
    simState = 'PARTITIONED';
    failureReason = req.body?.reason || 'Network partition isolate';
    res.json({ success: true, nodeId: config.id, status: simState, reason: failureReason });
  });

  app.post('/simulate/recover', (req: Request, res: Response) => {
    simState = 'HEALTHY';
    failureReason = undefined;
    res.json({ success: true, nodeId: config.id, status: simState });
  });

  return { app, config };
}

// Default storage nodes definitions
export const DEFAULT_STORAGE_NODES: NodeConfig[] = [
  {
    id: 'node-1',
    name: 'Storage Node 1',
    port: 5001,
    storageDir: 'storage/node1',
    region: 'us-east-1a',
    capacityBytes: 100 * 1024 * 1024 * 1024,
  },
  {
    id: 'node-2',
    name: 'Storage Node 2',
    port: 5002,
    storageDir: 'storage/node2',
    region: 'us-east-1b',
    capacityBytes: 100 * 1024 * 1024 * 1024,
  },
  {
    id: 'node-3',
    name: 'Storage Node 3',
    port: 5003,
    storageDir: 'storage/node3',
    region: 'us-east-1c',
    capacityBytes: 100 * 1024 * 1024 * 1024,
  },
  {
    id: 'node-4',
    name: 'Storage Node 4',
    port: 5004,
    storageDir: 'storage/node4',
    region: 'us-east-1d',
    capacityBytes: 100 * 1024 * 1024 * 1024,
  },
];

// CLI runner if executed directly via tsx server/storageNode.ts --id=node-1 --port=5001
const isMain = process.argv[1] && (process.argv[1].endsWith('storageNode.ts') || process.argv[1].endsWith('storageNode.js'));
if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (name: string, fallback: string) => {
    const prefix = `--${name}=`;
    const found = args.find(a => a.startsWith(prefix));
    return found ? found.replace(prefix, '') : fallback;
  };

  const id = getArg('id', 'node-1');
  const port = parseInt(getArg('port', '5001'), 10);
  const dir = getArg('dir', `storage/${id.replace('-', '')}`);
  const nodeDef = DEFAULT_STORAGE_NODES.find(n => n.id === id) || {
    id,
    name: `Storage Node (${id})`,
    port,
    storageDir: dir,
    region: 'us-east-1',
    capacityBytes: 100 * 1024 * 1024 * 1024,
  };

  const { app } = createStorageNodeServer(nodeDef);
  app.listen(port, '0.0.0.0', () => {
    console.log(`[Storage Node] ${nodeDef.name} (${nodeDef.id}) online on http://127.0.0.1:${port}`);
    console.log(`[Storage Node] Root directory: ${path.resolve(process.cwd(), dir)}`);
  });
}
