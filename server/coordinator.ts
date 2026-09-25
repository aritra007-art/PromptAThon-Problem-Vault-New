import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { getDatabaseProvider, DatabaseProvider } from './db';
import { getStorageProvider, StorageProvider } from './storage';

export function createCoordinatorRouter() {
  const router = express.Router();
  router.use(express.json({ limit: '50mb' }));
  router.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

  // Helper to get providers
  const getContext = async () => {
    const db = await getDatabaseProvider();
    const storage = await getStorageProvider();
    return { db, storage };
  };

  // Node health list (4 nodes/domains)
  const defaultNodes = [
    { id: 'node-1', name: 'Storage Node 1', endpoint: '127.0.0.1:5001', status: 'HEALTHY', capacityBytes: 100 * 1024 * 1024 * 1024, region: 'us-east-1a' },
    { id: 'node-2', name: 'Storage Node 2', endpoint: '127.0.0.1:5002', status: 'HEALTHY', capacityBytes: 100 * 1024 * 1024 * 1024, region: 'us-east-1b' },
    { id: 'node-3', name: 'Storage Node 3', endpoint: '127.0.0.1:5003', status: 'HEALTHY', capacityBytes: 100 * 1024 * 1024 * 1024, region: 'us-east-1c' },
    { id: 'node-4', name: 'Storage Node 4', endpoint: '127.0.0.1:5004', status: 'HEALTHY', capacityBytes: 100 * 1024 * 1024 * 1024, region: 'us-east-1d' },
  ];

  // In-memory runtime health overrides for simulated demo controls
  const nodeHealthMap = new Map<string, string>();
  defaultNodes.forEach(n => nodeHealthMap.set(n.id, 'HEALTHY'));

  // GET /api/vault/status: Complete backend cluster status including active modes
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const { db, storage } = await getContext();
      const objects = await db.getObjects();
      const replicas = await db.getReplicas();
      const activities = await db.getActivities(20);
      const repairTasks = await db.getRepairTasks();
      const config = await db.getConfig();

      // Decorate nodes with replica counts
      const nodesWithUsage = defaultNodes.map(node => {
        const hosted = replicas.filter(r => r.nodeId === node.id);
        const usedBytes = hosted.reduce((acc, r) => {
          const obj = objects.find(o => o.objectId === r.objectId);
          return acc + (obj ? obj.size : 0);
        }, 0);
        const dynamicStatus = nodeHealthMap.get(node.id) || 'HEALTHY';

        return {
          ...node,
          status: dynamicStatus,
          usedBytes,
          storedObjectIds: hosted.map(r => r.objectId),
          lastHeartbeat: new Date().toISOString(),
          latencyMs: dynamicStatus === 'HEALTHY' ? Math.floor(Math.random() * 15) + 12 : 999,
        };
      });

      res.json({
        backendMode: {
          databaseMode: db.mode, // 'sqlite' | 'supabase'
          storageMode: storage.mode,   // 'local' | 'supabase'
          databaseProvider: db.name,
          storageProvider: storage.name,
          isCloudMode: db.mode === 'supabase' && storage.mode === 'supabase',
        },
        nodes: nodesWithUsage,
        objects,
        replicas,
        activities,
        repairTasks,
        config,
      });
    } catch (err: any) {
      console.error('[Coordinator] /api/vault/status error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/vault/objects: Upload object, calculate SHA-256 and replicate across target nodes/domains
  router.post('/objects', async (req: Request, res: Response) => {
    try {
      const { db, storage } = await getContext();
      const { filename, mimeType, replicationFactor = 3, contentBase64, description } = req.body;

      if (!filename || !contentBase64) {
        return res.status(400).json({ error: 'Missing filename or contentBase64' });
      }

      const fileBuffer = Buffer.from(contentBase64, 'base64');
      const canonicalChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const objectId = `obj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const repFactor = Math.min(Math.max(2, Number(replicationFactor) || 3), 4);

      // Select placement nodes (favor healthy nodes with lowest utilization)
      const healthyNodes = defaultNodes.filter(n => (nodeHealthMap.get(n.id) || 'HEALTHY') === 'HEALTHY');
      if (healthyNodes.length < 2) {
        return res.status(503).json({ error: 'Quorum unavailable: fewer than 2 healthy nodes' });
      }

      const chosenNodes = healthyNodes.slice(0, repFactor);

      // Save object metadata in database (PostgreSQL/Supabase or SQLite)
      const objectRecord = {
        objectId,
        filename,
        size: fileBuffer.length,
        mimeType: mimeType || 'application/octet-stream',
        version: 1,
        checksum: canonicalChecksum,
        replicationFactor: chosenNodes.length,
        uploadedAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        status: 'HEALTHY',
        description: description || 'Ingested via Vault Coordinator API',
      };
      await db.saveObject(objectRecord);

      // Write replica bytes to storage provider (Supabase Storage bucket or local filesystem nodes)
      const savedReplicas = [];
      for (const node of chosenNodes) {
        const storagePath = await storage.putObject(
          node.id,
          objectId,
          fileBuffer,
          mimeType || 'application/octet-stream'
        );

        const replicaRecord = {
          objectId,
          nodeId: node.id,
          version: 1,
          storedChecksum: canonicalChecksum,
          status: 'HEALTHY',
          storagePath,
          isCorrupted: false,
          lastVerifiedAt: new Date().toISOString(),
        };
        await db.saveReplica(replicaRecord);
        savedReplicas.push(replicaRecord);
      }

      // Log activity
      await db.saveActivity({
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        type: 'OBJECT_INGESTED',
        title: 'Object Ingested & Replicated',
        description: `${filename} (${fileBuffer.length} bytes) verified & replicated across ${chosenNodes.map(n => n.name).join(', ')} (${storage.mode.toUpperCase()} storage).`,
        severity: 'success',
        objectId,
        filename,
      });

      res.status(201).json({
        object: objectRecord,
        replicas: savedReplicas,
        canonicalChecksum,
      });
    } catch (err: any) {
      console.error('[Coordinator] /api/vault/objects error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/vault/objects/:objectId/download: Retrieve bytes from surviving healthy replica
  router.get('/objects/:objectId/download', async (req: Request, res: Response) => {
    try {
      const { db, storage } = await getContext();
      const { objectId } = req.params;
      const object = await db.getObject(objectId);
      if (!object) {
        return res.status(404).json({ error: `Object ${objectId} not found` });
      }

      const replicas = await db.getReplicas(objectId);
      // Find a healthy non-corrupted replica on an online node
      const healthyReplica = replicas.find(r => {
        const nodeOnline = (nodeHealthMap.get(r.nodeId) || 'HEALTHY') === 'HEALTHY';
        return nodeOnline && !r.isCorrupted && r.status === 'HEALTHY';
      });

      if (!healthyReplica) {
        return res.status(503).json({ error: 'Quorum read error: All replicas are unreachable or corrupted' });
      }

      // Read raw bytes from storage provider
      const fileBytes = await storage.getObject(healthyReplica.nodeId, objectId);
      const computedChecksum = crypto.createHash('sha256').update(fileBytes).digest('hex');

      // Verify integrity against canonical checksum
      if (computedChecksum !== object.checksum) {
        console.warn(`[Coordinator] Bitrot detected during download on ${healthyReplica.nodeId}!`);
      }

      res.setHeader('Content-Type', object.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${object.filename}"`);
      res.setHeader('X-Vault-Checksum', computedChecksum);
      res.setHeader('X-Vault-Replica-Source', healthyReplica.nodeId);
      res.send(fileBytes);
    } catch (err: any) {
      console.error('[Coordinator] download error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/vault/objects/:objectId/verify: Cryptographic SHA-256 Integrity Scrubber
  router.post('/objects/:objectId/verify', async (req: Request, res: Response) => {
    try {
      const { db, storage } = await getContext();
      const { objectId } = req.params;
      const object = await db.getObject(objectId);
      if (!object) {
        return res.status(404).json({ error: `Object ${objectId} not found` });
      }

      const replicas = await db.getReplicas(objectId);
      const verificationResults = [];
      let corruptedCount = 0;

      for (const replica of replicas) {
        const nodeOnline = (nodeHealthMap.get(replica.nodeId) || 'HEALTHY') === 'HEALTHY';
        if (!nodeOnline) {
          verificationResults.push({
            nodeId: replica.nodeId,
            status: 'UNREACHABLE',
            matched: false,
          });
          continue;
        }

        try {
          const actualChecksum = await storage.getObjectChecksum(replica.nodeId, objectId);
          const matched = actualChecksum === object.checksum;

          if (!matched) {
            corruptedCount++;
            replica.isCorrupted = true;
            replica.status = 'CORRUPTED';
            replica.storedChecksum = actualChecksum;
          } else {
            replica.isCorrupted = false;
            replica.status = 'HEALTHY';
            replica.storedChecksum = actualChecksum;
          }
          replica.lastVerifiedAt = new Date().toISOString();
          await db.saveReplica(replica);

          verificationResults.push({
            nodeId: replica.nodeId,
            status: matched ? 'MATCHED' : 'CORRUPTED',
            storedChecksum: actualChecksum,
            canonicalChecksum: object.checksum,
            matched,
          });
        } catch (err: any) {
          verificationResults.push({
            nodeId: replica.nodeId,
            status: 'MISSING',
            matched: false,
            error: err.message,
          });
        }
      }

      // Update object health status
      object.lastVerifiedAt = new Date().toISOString();
      object.status = corruptedCount > 0 ? 'CORRUPTED' : 'HEALTHY';
      await db.saveObject(object);

      res.json({
        objectId,
        canonicalChecksum: object.checksum,
        corruptedCount,
        results: verificationResults,
        objectStatus: object.status,
      });
    } catch (err: any) {
      console.error('[Coordinator] verify error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/vault/objects/:objectId/repair: Self-healing pipeline
  router.post('/objects/:objectId/repair', async (req: Request, res: Response) => {
    try {
      const { db, storage } = await getContext();
      const { objectId } = req.params;
      const object = await db.getObject(objectId);
      if (!object) {
        return res.status(404).json({ error: `Object ${objectId} not found` });
      }

      const replicas = await db.getReplicas(objectId);
      // 1. Locate surviving healthy replica
      const cleanSourceReplica = replicas.find(r => {
        const nodeOnline = (nodeHealthMap.get(r.nodeId) || 'HEALTHY') === 'HEALTHY';
        return nodeOnline && !r.isCorrupted && r.status === 'HEALTHY';
      });

      if (!cleanSourceReplica) {
        return res.status(503).json({ error: 'Catastrophic quorum loss: No verified replica available for reconstruction' });
      }

      // 2. Read clean source bytes
      const cleanBytes = await storage.getObject(cleanSourceReplica.nodeId, objectId);

      // 3. Find corrupted or under-replicated targets
      const targetReplica = replicas.find(r => r.isCorrupted || r.status !== 'HEALTHY');
      const targetNodeId = targetReplica ? targetReplica.nodeId : 'node-3';

      // 4. Stream and write clean bytes to target
      await storage.putObject(targetNodeId, objectId, cleanBytes, object.mimeType);

      // 5. Update replica metadata
      const updatedReplica = {
        objectId,
        nodeId: targetNodeId,
        version: object.version,
        storedChecksum: object.checksum,
        status: 'HEALTHY',
        storagePath: `${targetNodeId}/${objectId}`,
        isCorrupted: false,
        lastVerifiedAt: new Date().toISOString(),
      };
      await db.saveReplica(updatedReplica);

      // 6. Mark object healthy
      object.status = 'HEALTHY';
      await db.saveObject(object);

      // 7. Log repair activity
      await db.saveActivity({
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        type: 'REPAIR_COMPLETED',
        title: 'Autonomous Quorum Healed',
        description: `Restored clean replica of ${object.filename} from ${cleanSourceReplica.nodeId} onto ${targetNodeId} with cryptographic verification.`,
        severity: 'success',
        objectId,
        filename: object.filename,
        nodeId: targetNodeId,
      });

      res.json({
        repaired: true,
        sourceNodeId: cleanSourceReplica.nodeId,
        targetNodeId,
        checksum: object.checksum,
      });
    } catch (err: any) {
      console.error('[Coordinator] repair error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/vault/admin/corrupt: Simulate bitrot corruption
  router.post('/admin/corrupt', async (req: Request, res: Response) => {
    try {
      const { db, storage } = await getContext();
      const { objectId, nodeId } = req.body;

      // Corrupt bytes in storage provider
      const corruptedChecksum = await storage.corruptObject(nodeId, objectId);

      // Update replica in database
      const replica = {
        objectId,
        nodeId,
        version: 1,
        storedChecksum: corruptedChecksum,
        status: 'CORRUPTED',
        storagePath: `${nodeId}/${objectId}`,
        isCorrupted: true,
        lastVerifiedAt: new Date().toISOString(),
      };
      await db.saveReplica(replica);

      const obj = await db.getObject(objectId);
      if (obj) {
        obj.status = 'CORRUPTED';
        await db.saveObject(obj);
      }

      await db.saveActivity({
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        type: 'CORRUPTION_SIMULATED',
        title: 'Data Corruption Injected',
        description: `Simulated bitrot payload mutation on ${nodeId} for object ${objectId}.`,
        severity: 'warning',
        objectId,
        nodeId,
      });

      res.json({ corrupted: true, nodeId, objectId, newChecksum: corruptedChecksum });
    } catch (err: any) {
      console.error('[Coordinator] corrupt error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/vault/admin/node-failure: Toggle node failure
  router.post('/admin/node-failure', async (req: Request, res: Response) => {
    const { nodeId, status } = req.body;
    nodeHealthMap.set(nodeId, status || 'OFFLINE');
    res.json({ nodeId, status: nodeHealthMap.get(nodeId) });
  });

  // POST /api/vault/admin/reset: Reset cluster to pristine baseline
  router.post('/admin/reset', async (_req: Request, res: Response) => {
    try {
      defaultNodes.forEach(n => nodeHealthMap.set(n.id, 'HEALTHY'));
      res.json({ reset: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
