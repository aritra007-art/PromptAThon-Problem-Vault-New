import express, { Request, Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { query, queryOne, run, seedDemoData } from './db.js';
import { DEFAULT_STORAGE_NODES, NodeConfig } from './storageNode.js';

export interface CoordinatorNodeState extends NodeConfig {
  status: 'HEALTHY' | 'OFFLINE' | 'DEGRADED' | 'RECOVERING' | 'PARTITIONED';
  usedBytes: number;
  objectCount: number;
  lastHeartbeat: string;
  latencyMs: number;
  failureReason?: string;
}

export function createCoordinatorRouter() {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

  // In-memory node states updated via polling
  let nodeStates: Map<string, CoordinatorNodeState> = new Map(
    DEFAULT_STORAGE_NODES.map(n => [
      n.id,
      {
        ...n,
        status: 'HEALTHY',
        usedBytes: 25 * 1024 * 1024 * 1024,
        objectCount: 0,
        lastHeartbeat: new Date().toISOString(),
        latencyMs: 18,
      },
    ])
  );

  let isAutoRepairing = false;

  // Helper: log activity
  async function logActivity(
    type: string,
    title: string,
    description: string,
    severity: 'info' | 'warning' | 'error' | 'success' = 'info',
    extra?: { nodeId?: string; objectId?: string; filename?: string }
  ) {
    const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();
    await run(
      `INSERT INTO activities (id, timestamp, type, title, description, severity, nodeId, objectId, filename)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        timestamp,
        type,
        title,
        description,
        severity,
        extra?.nodeId || null,
        extra?.objectId || null,
        extra?.filename || null,
      ]
    );
  }

  // Helper: poll single node health
  async function checkNodeHealth(nodeId: string): Promise<CoordinatorNodeState> {
    const nodeDef = DEFAULT_STORAGE_NODES.find(n => n.id === nodeId);
    const existing = nodeStates.get(nodeId) || {
      ...nodeDef!,
      status: 'OFFLINE',
      usedBytes: 0,
      objectCount: 0,
      lastHeartbeat: new Date().toISOString(),
      latencyMs: 999,
    };

    if (!nodeDef) return existing;

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);

      const resp = await fetch(`http://127.0.0.1:${nodeDef.port}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - start;

      if (resp.ok) {
        const data = await resp.json();
        const updated: CoordinatorNodeState = {
          ...nodeDef,
          status: data.status || 'HEALTHY',
          usedBytes: data.usedBytes || existing.usedBytes,
          objectCount: data.objectCount || 0,
          lastHeartbeat: new Date().toISOString(),
          latencyMs,
          failureReason: data.failureReason,
        };
        nodeStates.set(nodeId, updated);
        return updated;
      } else {
        const errorData = await resp.json().catch(() => ({}));
        const status = resp.status === 504 ? 'PARTITIONED' : 'OFFLINE';
        const updated: CoordinatorNodeState = {
          ...existing,
          status,
          failureReason: errorData.reason || `HTTP ${resp.status} status from storage daemon`,
          latencyMs: 999,
        };
        nodeStates.set(nodeId, updated);
        return updated;
      }
    } catch (err: any) {
      const updated: CoordinatorNodeState = {
        ...existing,
        status: 'OFFLINE',
        failureReason: err.name === 'AbortError' ? 'Heartbeat timeout (>1200ms)' : 'Connection refused / process halted',
        latencyMs: 999,
      };
      nodeStates.set(nodeId, updated);
      return updated;
    }
  }

  // Periodic heartbeat poller
  async function pollAllNodes() {
    for (const node of DEFAULT_STORAGE_NODES) {
      await checkNodeHealth(node.id);
    }
    await reconcileQuorums();
  }

  setInterval(pollAllNodes, 3000);
  pollAllNodes(); // immediate initial check

  // Reconcile object health in SQLite based on current node statuses
  async function reconcileQuorums() {
    const objects = await query('SELECT * FROM objects');
    for (const obj of objects) {
      const replicas = await query('SELECT * FROM replicas WHERE objectId = ?', [obj.objectId]);
      let healthyCount = 0;
      let hasCorrupted = false;
      let hasStale = false;

      for (const r of replicas) {
        const node = nodeStates.get(r.nodeId);
        const isOnline = node && node.status === 'HEALTHY';
        if (isOnline) {
          if (r.isCorrupted || r.status === 'CORRUPTED') {
            hasCorrupted = true;
          } else if (r.status === 'STALE') {
            hasStale = true;
          } else if (r.status === 'HEALTHY') {
            healthyCount++;
          }
        }
      }

      let newStatus = 'HEALTHY';
      if (hasCorrupted) {
        newStatus = 'CORRUPTED';
      } else if (healthyCount < obj.replicationFactor) {
        newStatus = 'REPAIR_REQUIRED';
      } else if (hasStale) {
        newStatus = 'DEGRADED';
      }

      if (newStatus !== obj.status) {
        await run('UPDATE objects SET status = ? WHERE objectId = ?', [newStatus, obj.objectId]);
        if (newStatus === 'REPAIR_REQUIRED') {
          // Check auto repair setting
          const cfg = await queryOne('SELECT value FROM cluster_config WHERE key = ?', ['autoRepairEnabled']);
          if (cfg && cfg.value === 'true') {
            triggerAutoRepairForObject(obj.objectId);
          }
        }
      }
    }
  }

  // Auto repair execution
  async function triggerAutoRepairForObject(objectId: string): Promise<boolean> {
    const obj = await queryOne('SELECT * FROM objects WHERE objectId = ?', [objectId]);
    if (!obj) return false;

    const replicas = await query('SELECT * FROM replicas WHERE objectId = ?', [objectId]);

    // Find healthy source node
    const healthyReplica = replicas.find(r => {
      const node = nodeStates.get(r.nodeId);
      return node && node.status === 'HEALTHY' && !r.isCorrupted && r.status === 'HEALTHY';
    });

    if (!healthyReplica) {
      console.warn(`[Coordinator AutoRepair] Cannot repair ${obj.filename}: no healthy source replica found.`);
      return false;
    }

    const sourceNode = nodeStates.get(healthyReplica.nodeId)!;

    // Check case 1: In-place repair of corrupted replica
    const corruptedReplica = replicas.find(r => {
      const node = nodeStates.get(r.nodeId);
      return node && node.status === 'HEALTHY' && (r.isCorrupted || r.status === 'CORRUPTED');
    });

    if (corruptedReplica) {
      const targetNode = nodeStates.get(corruptedReplica.nodeId)!;
      return await executeRepair(obj, sourceNode, targetNode, 'CORRUPTED_REPLICA');
    }

    // Check case 2: In-place repair of stale replica
    const staleReplica = replicas.find(r => {
      const node = nodeStates.get(r.nodeId);
      return node && node.status === 'HEALTHY' && r.status === 'STALE';
    });

    if (staleReplica) {
      const targetNode = nodeStates.get(staleReplica.nodeId)!;
      return await executeRepair(obj, sourceNode, targetNode, 'STALE_VERSION');
    }

    // Check case 3: Under-replicated because a node went offline
    const occupiedNodeIds = replicas.map(r => r.nodeId);
    const candidateNodes = Array.from(nodeStates.values()).filter(
      n => n.status === 'HEALTHY' && !occupiedNodeIds.includes(n.id)
    );

    if (candidateNodes.length > 0) {
      // Pick node with lowest utilization
      candidateNodes.sort((a, b) => a.usedBytes / a.capacityBytes - b.usedBytes / b.capacityBytes);
      const targetNode = candidateNodes[0];
      return await executeRepair(obj, sourceNode, targetNode, 'UNDER_REPLICATED');
    }

    return false;
  }

  // Real HTTP data stream repair
  async function executeRepair(
    obj: any,
    sourceNode: CoordinatorNodeState,
    targetNode: CoordinatorNodeState,
    reason: string
  ): Promise<boolean> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await run(
      `INSERT INTO repair_tasks (id, objectId, filename, sourceNodeId, targetNodeId, progress, status, startedAt, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, obj.objectId, obj.filename, sourceNode.id, targetNode.id, 10, 'IN_PROGRESS', new Date().toISOString(), reason]
    );

    await logActivity(
      'REPAIR_STARTED',
      `Auto-Repair Initiated: ${obj.filename}`,
      `Streaming byte replica from ${sourceNode.name} to ${targetNode.name} (Reason: ${reason.replace('_', ' ')}).`,
      'info',
      { objectId: obj.objectId, filename: obj.filename, nodeId: targetNode.id }
    );

    try {
      // Step 1: Download actual bytes from source node
      const fetchResp = await fetch(`http://127.0.0.1:${sourceNode.port}/objects/${obj.objectId}`);
      if (!fetchResp.ok) {
        throw new Error(`Failed to fetch clean replica bytes from ${sourceNode.name}`);
      }
      const dataBuffer = Buffer.from(await fetchResp.arrayBuffer());

      await run('UPDATE repair_tasks SET progress = 50 WHERE id = ?', [taskId]);

      // Step 2: Upload actual bytes to target node
      const putResp = await fetch(
        `http://127.0.0.1:${targetNode.port}/objects/${obj.objectId}?filename=${encodeURIComponent(
          obj.filename
        )}&version=${obj.version}&checksum=${obj.checksum}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': obj.mimeType || 'application/octet-stream',
          },
          body: new Uint8Array(dataBuffer),
        }
      );

      if (!putResp.ok) {
        throw new Error(`Failed to write replica bytes to ${targetNode.name}`);
      }

      await run('UPDATE repair_tasks SET progress = 85 WHERE id = ?', [taskId]);

      // Step 3: Verify target node on-disk checksum
      const verifyResp = await fetch(`http://127.0.0.1:${targetNode.port}/objects/${obj.objectId}/checksum`);
      const verifyData = await verifyResp.json();

      if (verifyData.actualChecksum !== obj.checksum) {
        throw new Error(`Integrity verification failed on target ${targetNode.name}`);
      }

      // Step 4: Update SQLite metadata
      // Replace existing replica record or insert new one
      const existingReplica = await queryOne(
        'SELECT * FROM replicas WHERE objectId = ? AND nodeId = ?',
        [obj.objectId, targetNode.id]
      );

      if (existingReplica) {
        await run(
          `UPDATE replicas SET version = ?, storedChecksum = ?, status = 'HEALTHY', isCorrupted = 0, lastVerifiedAt = ?
           WHERE objectId = ? AND nodeId = ?`,
          [obj.version, obj.checksum, new Date().toISOString(), obj.objectId, targetNode.id]
        );
      } else {
        // If replacing an offline node's replica to maintain exact replication factor
        const offlineReplica = await queryOne(
          `SELECT r.* FROM replicas r
           JOIN objects o ON o.objectId = r.objectId
           WHERE r.objectId = ?`,
          [obj.objectId]
        );

        await run(
          `INSERT INTO replicas (objectId, nodeId, version, storedChecksum, status, lastVerifiedAt, isCorrupted)
           VALUES (?, ?, ?, ?, 'HEALTHY', ?, 0)`,
          [obj.objectId, targetNode.id, obj.version, obj.checksum, new Date().toISOString()]
        );
      }

      // Step 5: Mark task complete
      await run(
        `UPDATE repair_tasks SET progress = 100, status = 'COMPLETED', completedAt = ? WHERE id = ?`,
        [new Date().toISOString(), taskId]
      );

      await run(`UPDATE objects SET status = 'HEALTHY', lastVerifiedAt = ? WHERE objectId = ?`, [
        new Date().toISOString(),
        obj.objectId,
      ]);

      await logActivity(
        'REPAIR_COMPLETED',
        `Replica Restored: ${obj.filename}`,
        `Successfully replicated and verified on ${targetNode.name}. Durability restored.`,
        'success',
        { objectId: obj.objectId, filename: obj.filename, nodeId: targetNode.id }
      );

      return true;
    } catch (err: any) {
      await run(`UPDATE repair_tasks SET status = 'FAILED' WHERE id = ?`, [taskId]);
      await logActivity(
        'SYSTEM_ALERT',
        `Repair Failed: ${obj.filename}`,
        err.message || 'Unknown repair error',
        'error',
        { objectId: obj.objectId, filename: obj.filename }
      );
      return false;
    }
  }

  // ==========================================
  // API ROUTES
  // ==========================================

  // 1. GET /api/cluster/status
  router.get('/cluster/status', async (req: Request, res: Response) => {
    const rawNodes = Array.from(nodeStates.values());
    const objects = await query('SELECT * FROM objects');
    const replicas = await query('SELECT * FROM replicas');
    const activeRepairs = await query("SELECT * FROM repair_tasks WHERE status != 'COMPLETED' ORDER BY startedAt DESC");
    const autoRepairCfg = await queryOne('SELECT value FROM cluster_config WHERE key = ?', ['autoRepairEnabled']);

    let totalStorageBytes = 0;
    let usedStorageBytes = 0;
    let healthyNodesCount = 0;

    for (const node of rawNodes) {
      totalStorageBytes += node.capacityBytes;
      usedStorageBytes += node.usedBytes;
      if (node.status === 'HEALTHY') healthyNodesCount++;
    }

    let healthyReplicasCount = 0;
    let totalExpectedReplicas = 0;

    for (const obj of objects) {
      totalExpectedReplicas += obj.replicationFactor;
      const objReplicas = replicas.filter(r => r.objectId === obj.objectId);
      for (const r of objReplicas) {
        const node = nodeStates.get(r.nodeId);
        if (node && node.status === 'HEALTHY' && !r.isCorrupted && r.status === 'HEALTHY') {
          healthyReplicasCount++;
        }
      }
    }

    let clusterHealth = 'HEALTHY';
    if (healthyNodesCount <= 1 || healthyReplicasCount < totalExpectedReplicas * 0.5) {
      clusterHealth = 'CRITICAL';
    } else if (healthyNodesCount < rawNodes.length || healthyReplicasCount < totalExpectedReplicas) {
      clusterHealth = 'DEGRADED';
    }

    res.json({
      backend: 'LOCAL DISTRIBUTED NODES',
      coordinatorConnected: true,
      clusterHealth,
      totalStorageBytes,
      usedStorageBytes,
      totalObjects: objects.length,
      healthyReplicasCount,
      totalExpectedReplicas,
      healthyNodesCount,
      totalNodesCount: rawNodes.length,
      pendingRepairsCount: activeRepairs.length,
      autoRepairEnabled: autoRepairCfg?.value === 'true',
      nodes: rawNodes.map(n => ({
        id: n.id,
        name: n.name,
        endpoint: `127.0.0.1:${n.port}`,
        status: n.status,
        capacityBytes: n.capacityBytes,
        usedBytes: n.usedBytes,
        storedObjectIds: replicas.filter(r => r.nodeId === n.id).map(r => r.objectId),
        lastHeartbeat: n.lastHeartbeat,
        latencyMs: n.latencyMs,
        region: n.region,
        failureReason: n.failureReason,
      })),
    });
  });

  // 2. GET /api/objects
  router.get('/objects', async (req: Request, res: Response) => {
    const objects = await query('SELECT * FROM objects ORDER BY uploadedAt DESC');
    const replicas = await query('SELECT * FROM replicas');

    const result = objects.map(obj => ({
      ...obj,
      isDemo: !!obj.isDemo,
      replicas: replicas
        .filter(r => r.objectId === obj.objectId)
        .map(r => ({
          nodeId: r.nodeId,
          version: r.version,
          storedChecksum: r.storedChecksum,
          status: r.status,
          lastVerifiedAt: r.lastVerifiedAt,
          isCorrupted: !!r.isCorrupted,
        })),
    }));

    res.json(result);
  });

  // 3. GET /api/objects/:objectId
  router.get('/objects/:objectId', async (req: Request, res: Response) => {
    const { objectId } = req.params;
    const obj = await queryOne('SELECT * FROM objects WHERE objectId = ?', [objectId]);
    if (!obj) {
      return res.status(404).json({ error: 'Object not found' });
    }

    const replicas = await query('SELECT * FROM replicas WHERE objectId = ?', [objectId]);
    res.json({
      ...obj,
      isDemo: !!obj.isDemo,
      replicas: replicas.map(r => ({
        nodeId: r.nodeId,
        version: r.version,
        storedChecksum: r.storedChecksum,
        status: r.status,
        lastVerifiedAt: r.lastVerifiedAt,
        isCorrupted: !!r.isCorrupted,
      })),
    });
  });

  // 4. POST /api/objects/upload (Multipart or Raw File Upload)
  router.post('/objects/upload', upload.single('file'), async (req: Request, res: Response) => {
    let fileBuffer: Buffer;
    let filename: string;
    let mimeType: string;

    if (req.file) {
      fileBuffer = req.file.buffer;
      filename = req.file.originalname;
      mimeType = req.file.mimetype;
    } else if (req.body && (req.body.content || typeof req.body === 'string')) {
      const content = req.body.content || req.body;
      fileBuffer = Buffer.from(content);
      filename = req.body.filename || 'uploaded-file.bin';
      mimeType = req.body.type || 'text/plain';
    } else {
      return res.status(400).json({ error: 'No file content uploaded' });
    }

    const replicationFactor = parseInt(req.body.replicationFactor || req.query.replicationFactor || '3', 10);
    const objectId = `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const now = new Date().toISOString();

    // Select healthy placement nodes with lowest storage utilization
    const healthyNodes = Array.from(nodeStates.values()).filter(n => n.status === 'HEALTHY');
    if (healthyNodes.length === 0) {
      return res.status(503).json({ error: 'No healthy storage nodes available for replica placement' });
    }

    healthyNodes.sort((a, b) => a.usedBytes / a.capacityBytes - b.usedBytes / b.capacityBytes);
    const selectedNodes = healthyNodes.slice(0, Math.min(replicationFactor, healthyNodes.length));

    // Upload actual file bytes to each storage node via HTTP PUT
    const successfulReplicas: { nodeId: string; checksum: string }[] = [];

    for (const node of selectedNodes) {
      try {
        const putResp = await fetch(
          `http://127.0.0.1:${node.port}/objects/${objectId}?filename=${encodeURIComponent(
            filename
          )}&version=1&checksum=${checksum}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': mimeType,
            },
            body: new Uint8Array(fileBuffer),
          }
        );

        if (putResp.ok) {
          const putData = await putResp.json();
          successfulReplicas.push({ nodeId: node.id, checksum: putData.checksum || checksum });
        }
      } catch (err) {
        console.error(`Failed to store replica on ${node.name}:`, err);
      }
    }

    if (successfulReplicas.length === 0) {
      return res.status(500).json({ error: 'Failed to write replicas to any storage node' });
    }

    // Insert into SQLite database (Marked as REAL DATA, isDemo = 0)
    await run(
      `INSERT INTO objects (objectId, filename, size, mimeType, version, checksum, replicationFactor, status, uploadedAt, lastVerifiedAt, description, isDemo)
       VALUES (?, ?, ?, ?, 1, ?, ?, 'HEALTHY', ?, ?, ?, 0)`,
      [objectId, filename, fileBuffer.length, mimeType, checksum, replicationFactor, now, now, 'User uploaded object']
    );

    for (const replica of successfulReplicas) {
      await run(
        `INSERT INTO replicas (objectId, nodeId, version, storedChecksum, status, lastVerifiedAt, isCorrupted)
         VALUES (?, ?, 1, ?, 'HEALTHY', ?, 0)`,
        [objectId, replica.nodeId, replica.checksum, now]
      );
    }

    await logActivity(
      'OBJECT_UPLOADED',
      `File Ingestion: ${filename}`,
      `Uploaded ${fileBuffer.length} bytes. Stored real bytes across nodes: ${successfulReplicas
        .map(r => r.nodeId)
        .join(', ')}.`,
      'success',
      { objectId, filename }
    );

    res.status(201).json({
      success: true,
      objectId,
      filename,
      size: fileBuffer.length,
      checksum,
      replicationFactor,
      isDemo: false,
      replicas: successfulReplicas.map(r => ({
        nodeId: r.nodeId,
        version: 1,
        storedChecksum: r.checksum,
        status: 'HEALTHY',
        lastVerifiedAt: now,
      })),
    });
  });

  // 5. GET /api/objects/:objectId/download (Failover retrieval with real bytes)
  router.get('/objects/:objectId/download', async (req: Request, res: Response) => {
    const { objectId } = req.params;
    const obj = await queryOne('SELECT * FROM objects WHERE objectId = ?', [objectId]);
    if (!obj) {
      return res.status(404).json({ error: 'Object not found in metadata' });
    }

    const replicas = await query('SELECT * FROM replicas WHERE objectId = ?', [objectId]);

    let successfulBuffer: Buffer | null = null;
    let retrievedFromNode: CoordinatorNodeState | null = null;
    let wasFailover = false;
    let offlineNodeName: string | undefined;

    // Check replicas in priority order
    for (let i = 0; i < replicas.length; i++) {
      const replica = replicas[i];
      const node = nodeStates.get(replica.nodeId);

      if (!node || node.status !== 'HEALTHY' || replica.isCorrupted || replica.status === 'CORRUPTED') {
        if (!offlineNodeName && node) {
          offlineNodeName = node.name;
        }
        wasFailover = true;
        continue;
      }

      try {
        const fetchResp = await fetch(`http://127.0.0.1:${node.port}/objects/${objectId}`);
        if (fetchResp.ok) {
          const buf = Buffer.from(await fetchResp.arrayBuffer());
          // Verify checksum
          const actualHash = crypto.createHash('sha256').update(buf).digest('hex');
          if (actualHash === obj.checksum) {
            successfulBuffer = buf;
            retrievedFromNode = node;
            break;
          } else {
            console.warn(`Node ${node.name} returned corrupted bytes! Trying next replica...`);
            wasFailover = true;
          }
        } else {
          wasFailover = true;
        }
      } catch (err) {
        wasFailover = true;
      }
    }

    if (!successfulBuffer || !retrievedFromNode) {
      return res.status(503).json({
        error: `Cannot retrieve ${obj.filename}: all host nodes are offline, partitioned, or corrupted.`,
      });
    }

    const message = wasFailover
      ? `${offlineNodeName || 'Primary node'} unavailable — retrieved from ${retrievedFromNode.name} (Failover)`
      : `Retrieved from ${retrievedFromNode.name}`;

    await logActivity(
      'OBJECT_DOWNLOADED',
      `File Retrieved: ${obj.filename}`,
      message,
      wasFailover ? 'warning' : 'success',
      { objectId, filename: obj.filename, nodeId: retrievedFromNode.id }
    );

    res.setHeader('Content-Type', obj.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${obj.filename}"`);
    res.setHeader('X-Retrieved-From-Node', retrievedFromNode.name);
    res.setHeader('X-Retrieved-From-Node-Id', retrievedFromNode.id);
    res.setHeader('X-Failover', wasFailover ? 'true' : 'false');
    if (offlineNodeName) {
      res.setHeader('X-Offline-Replica-Node', offlineNodeName);
    }
    res.send(successfulBuffer);
  });

  // 6. DELETE /api/objects/:objectId
  router.delete('/objects/:objectId', async (req: Request, res: Response) => {
    const { objectId } = req.params;
    const obj = await queryOne('SELECT * FROM objects WHERE objectId = ?', [objectId]);
    if (!obj) return res.status(404).json({ error: 'Object not found' });

    const replicas = await query('SELECT * FROM replicas WHERE objectId = ?', [objectId]);

    for (const r of replicas) {
      const node = nodeStates.get(r.nodeId);
      if (node) {
        fetch(`http://127.0.0.1:${node.port}/objects/${objectId}`, { method: 'DELETE' }).catch(() => {});
      }
    }

    await run('DELETE FROM replicas WHERE objectId = ?', [objectId]);
    await run('DELETE FROM objects WHERE objectId = ?', [objectId]);

    await logActivity(
      'OBJECT_DELETED',
      `Object Purged: ${obj.filename}`,
      `Deleted metadata and purged replicas across host nodes.`,
      'info',
      { objectId, filename: obj.filename }
    );

    res.json({ success: true, objectId, filename: obj.filename });
  });

  // 7. POST /api/nodes/:nodeId/fail (Simulate Node Failure)
  router.post('/nodes/:nodeId/fail', async (req: Request, res: Response) => {
    const { nodeId } = req.params;
    const node = nodeStates.get(nodeId);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    try {
      await fetch(`http://127.0.0.1:${node.port}/simulate/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Hardware failure simulated by operator' }),
      });
    } catch (e) {}

    await checkNodeHealth(nodeId);
    await reconcileQuorums();

    await logActivity(
      'NODE_FAILURE',
      `${node.name} Marked OFFLINE`,
      `Daemon halted and removed from active read/write quorum. Under-replicated objects flagged.`,
      'error',
      { nodeId }
    );

    res.json({ success: true, nodeId, status: 'OFFLINE' });
  });

  // 8. POST /api/nodes/:nodeId/partition (Simulate Network Partition)
  router.post('/nodes/:nodeId/partition', async (req: Request, res: Response) => {
    const { nodeId } = req.params;
    const node = nodeStates.get(nodeId);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    try {
      await fetch(`http://127.0.0.1:${node.port}/simulate/partition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Network partition isolate' }),
      });
    } catch (e) {}

    await checkNodeHealth(nodeId);
    await reconcileQuorums();

    await logActivity(
      'NODE_FAILURE',
      `${node.name} Network Partitioned`,
      `Simulated packet drop / network isolate. Node local data intact but unreachable from coordinator.`,
      'warning',
      { nodeId }
    );

    res.json({ success: true, nodeId, status: 'PARTITIONED' });
  });

  // 9. POST /api/nodes/:nodeId/recover (Recover Node)
  router.post('/nodes/:nodeId/recover', async (req: Request, res: Response) => {
    const { nodeId } = req.params;
    const node = nodeStates.get(nodeId);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    node.status = 'RECOVERING';

    await logActivity(
      'NODE_RECOVERY',
      `${node.name} Initiating Recovery`,
      `Reconnecting socket, checking disk journals and validating replicas...`,
      'info',
      { nodeId }
    );

    try {
      await fetch(`http://127.0.0.1:${node.port}/simulate/recover`, { method: 'POST' });
    } catch (e) {}

    // Simulated short reconcile window
    await new Promise(r => setTimeout(r, 600));

    await checkNodeHealth(nodeId);
    await reconcileQuorums();

    await logActivity(
      'NODE_ONLINE',
      `${node.name} Fully Restored`,
      `Storage node re-entered cluster quorum. Replicas reconciled.`,
      'success',
      { nodeId }
    );

    res.json({ success: true, nodeId, status: 'HEALTHY' });
  });

  // 10. POST /api/objects/:objectId/nodes/:nodeId/corrupt (Simulate Corruption on disk)
  router.post('/objects/:objectId/nodes/:nodeId/corrupt', async (req: Request, res: Response) => {
    const { objectId, nodeId } = req.params;
    const node = nodeStates.get(nodeId);
    const obj = await queryOne('SELECT * FROM objects WHERE objectId = ?', [objectId]);

    if (!node || !obj) return res.status(404).json({ error: 'Node or object not found' });

    try {
      const resp = await fetch(`http://127.0.0.1:${node.port}/objects/${objectId}/corrupt`, { method: 'POST' });
      const data = await resp.json();

      await run(
        `UPDATE replicas SET isCorrupted = 1, status = 'CORRUPTED', storedChecksum = ?, lastVerifiedAt = ?
         WHERE objectId = ? AND nodeId = ?`,
        [data.corruptedChecksum || 'corrupted_hash', new Date().toISOString(), objectId, nodeId]
      );

      await run(`UPDATE objects SET status = 'CORRUPTED' WHERE objectId = ?`, [objectId]);

      await logActivity(
        'CORRUPTION_SIMULATED',
        `Data Corruption Injected: ${obj.filename}`,
        `Altered actual file bytes on disk for ${node.name}. Checksum diverged from canonical hash.`,
        'error',
        { objectId, filename: obj.filename, nodeId }
      );

      res.json({ success: true, objectId, nodeId, corruptedChecksum: data.corruptedChecksum });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 11. POST /api/objects/:objectId/nodes/:nodeId/stale (Simulate Stale Version)
  router.post('/objects/:objectId/nodes/:nodeId/stale', async (req: Request, res: Response) => {
    const { objectId, nodeId } = req.params;
    const node = nodeStates.get(nodeId);
    const obj = await queryOne('SELECT * FROM objects WHERE objectId = ?', [objectId]);

    if (!node || !obj) return res.status(404).json({ error: 'Node or object not found' });

    try {
      await fetch(`http://127.0.0.1:${node.port}/objects/${objectId}/stale`, { method: 'POST' });

      await run(
        `UPDATE replicas SET version = version - 1, status = 'STALE', lastVerifiedAt = ?
         WHERE objectId = ? AND nodeId = ?`,
        [new Date().toISOString(), objectId, nodeId]
      );

      await run(`UPDATE objects SET status = 'DEGRADED' WHERE objectId = ?`, [objectId]);

      await logActivity(
        'INCONSISTENCY_DETECTED',
        `Replica Inconsistency Injected: ${obj.filename}`,
        `Replica on ${node.name} downgraded to older version.`,
        'warning',
        { objectId, filename: obj.filename, nodeId }
      );

      res.json({ success: true, objectId, nodeId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 12. POST /api/verify (Integrity Verification)
  router.post('/verify', async (req: Request, res: Response) => {
    const { objectId } = req.body || {};
    const objects = objectId
      ? await query('SELECT * FROM objects WHERE objectId = ?', [objectId])
      : await query('SELECT * FROM objects');

    const results = [];
    const autoRepairCfg = await queryOne('SELECT value FROM cluster_config WHERE key = ?', ['autoRepairEnabled']);
    const autoRepair = autoRepairCfg?.value === 'true';

    for (const obj of objects) {
      const replicas = await query('SELECT * FROM replicas WHERE objectId = ?', [obj.objectId]);
      const details = [];
      let healthy = 0;
      let corrupted = 0;
      let stale = 0;
      let offline = 0;

      for (const r of replicas) {
        const node = nodeStates.get(r.nodeId);
        if (!node || node.status !== 'HEALTHY') {
          offline++;
          details.push({
            nodeId: r.nodeId,
            nodeName: node ? node.name : r.nodeId,
            status: 'OFFLINE',
            expectedChecksum: obj.checksum,
            actualChecksum: '--- [NODE UNREACHABLE] ---',
          });
          continue;
        }

        try {
          const checkResp = await fetch(`http://127.0.0.1:${node.port}/objects/${obj.objectId}/checksum`);
          if (checkResp.ok) {
            const data = await checkResp.json();
            if (data.actualChecksum !== obj.checksum || data.isCorrupted) {
              corrupted++;
              await run(
                `UPDATE replicas SET isCorrupted = 1, status = 'CORRUPTED', storedChecksum = ?, lastVerifiedAt = ?
                 WHERE objectId = ? AND nodeId = ?`,
                [data.actualChecksum, new Date().toISOString(), obj.objectId, r.nodeId]
              );
              details.push({
                nodeId: r.nodeId,
                nodeName: node.name,
                status: 'MISMATCH',
                expectedChecksum: obj.checksum,
                actualChecksum: data.actualChecksum,
              });
            } else if (r.status === 'STALE' || (r.version < obj.version)) {
              stale++;
              details.push({
                nodeId: r.nodeId,
                nodeName: node.name,
                status: 'STALE',
                expectedChecksum: obj.checksum,
                actualChecksum: data.actualChecksum,
              });
            } else {
              healthy++;
              details.push({
                nodeId: r.nodeId,
                nodeName: node.name,
                status: 'MATCHED',
                expectedChecksum: obj.checksum,
                actualChecksum: data.actualChecksum,
              });
            }
          }
        } catch (e) {
          offline++;
        }
      }

      await run(`UPDATE objects SET lastVerifiedAt = ? WHERE objectId = ?`, [
        new Date().toISOString(),
        obj.objectId,
      ]);

      if (corrupted > 0) {
        await run(`UPDATE objects SET status = 'CORRUPTED' WHERE objectId = ?`, [obj.objectId]);
        await logActivity(
          'INTEGRITY_MISMATCH',
          `Integrity Violation: ${obj.filename}`,
          `Calculated SHA-256 diverged from expected hash on ${corrupted} replica(s).`,
          'error',
          { objectId: obj.objectId, filename: obj.filename }
        );
        if (autoRepair) {
          triggerAutoRepairForObject(obj.objectId);
        }
      } else if (stale > 0) {
        await run(`UPDATE objects SET status = 'DEGRADED' WHERE objectId = ?`, [obj.objectId]);
        if (autoRepair) {
          triggerAutoRepairForObject(obj.objectId);
        }
      } else {
        await logActivity(
          'INTEGRITY_CHECK',
          `Integrity Verified: ${obj.filename}`,
          `All ${healthy} reachable replicas matched canonical SHA-256 hash.`,
          'success',
          { objectId: obj.objectId, filename: obj.filename }
        );
      }

      results.push({
        objectId: obj.objectId,
        filename: obj.filename,
        healthyReplicas: healthy,
        corruptedReplicas: corrupted,
        staleReplicas: stale,
        offlineReplicas: offline,
        details,
      });
    }

    res.json(results);
  });

  // 13. POST /api/repair/:objectId (Manual Repair)
  router.post('/repair/:objectId', async (req: Request, res: Response) => {
    const { objectId } = req.params;
    const ok = await triggerAutoRepairForObject(objectId);
    res.json({ success: ok });
  });

  // 14. POST /api/repair/all (Repair All)
  router.post('/repair/all', async (req: Request, res: Response) => {
    const objects = await query('SELECT * FROM objects');
    let repairedCount = 0;
    for (const obj of objects) {
      const ok = await triggerAutoRepairForObject(obj.objectId);
      if (ok) repairedCount++;
    }
    res.json({ success: true, repairedCount });
  });

  // 15. POST /api/rebalance (Cluster Rebalance)
  router.post('/rebalance', async (req: Request, res: Response) => {
    const healthyNodes = Array.from(nodeStates.values()).filter(n => n.status === 'HEALTHY');
    if (healthyNodes.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 healthy nodes to rebalance' });
    }

    healthyNodes.sort((a, b) => b.usedBytes / b.capacityBytes - a.usedBytes / a.capacityBytes);
    const highest = healthyNodes[0];
    const lowest = healthyNodes[healthyNodes.length - 1];

    // Find candidate object on highest that is NOT on lowest
    const replicas = await query('SELECT * FROM replicas');
    const objects = await query('SELECT * FROM objects');

    const candidateObj = objects.find(obj => {
      const nodeIds = replicas.filter(r => r.objectId === obj.objectId).map(r => r.nodeId);
      return nodeIds.includes(highest.id) && !nodeIds.includes(lowest.id);
    });

    if (!candidateObj) {
      return res.json({
        success: false,
        message: 'Replica distribution is already balanced across available nodes.',
      });
    }

    await logActivity(
      'REBALANCE_TRIGGERED',
      `Cluster Load Rebalancing Initiated`,
      `Migrating real bytes of ${candidateObj.filename} from overloaded ${highest.name} to ${lowest.name}.`,
      'info'
    );

    // Stream bytes from highest to lowest
    try {
      const fetchResp = await fetch(`http://127.0.0.1:${highest.port}/objects/${candidateObj.objectId}`);
      const buf = Buffer.from(await fetchResp.arrayBuffer());

      const putResp = await fetch(
        `http://127.0.0.1:${lowest.port}/objects/${candidateObj.objectId}?filename=${encodeURIComponent(
          candidateObj.filename
        )}&version=${candidateObj.version}&checksum=${candidateObj.checksum}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': candidateObj.mimeType || 'application/octet-stream' },
          body: new Uint8Array(buf),
        }
      );

      if (!putResp.ok) throw new Error('Failed to write replica to target during rebalance');

      // Verify lowest
      const verifyResp = await fetch(`http://127.0.0.1:${lowest.port}/objects/${candidateObj.objectId}/checksum`);
      const verifyData = await verifyResp.json();
      if (verifyData.actualChecksum !== candidateObj.checksum) {
        throw new Error('Verification failed on target node');
      }

      // Safe deletion from old node now that new replica is verified
      await fetch(`http://127.0.0.1:${highest.port}/objects/${candidateObj.objectId}`, { method: 'DELETE' });

      // Update SQLite
      await run(`DELETE FROM replicas WHERE objectId = ? AND nodeId = ?`, [candidateObj.objectId, highest.id]);
      await run(
        `INSERT INTO replicas (objectId, nodeId, version, storedChecksum, status, lastVerifiedAt, isCorrupted)
         VALUES (?, ?, ?, ?, 'HEALTHY', ?, 0)`,
        [candidateObj.objectId, lowest.id, candidateObj.version, candidateObj.checksum, new Date().toISOString()]
      );

      await logActivity(
        'REBALANCE_TRIGGERED',
        `Cluster Rebalance Complete`,
        `${candidateObj.filename} migrated successfully from ${highest.name} to ${lowest.name}.`,
        'success'
      );

      res.json({ success: true, objectId: candidateObj.objectId, fromNode: highest.id, toNode: lowest.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 16. GET /api/activities
  router.get('/activities', async (req: Request, res: Response) => {
    const activities = await query('SELECT * FROM activities ORDER BY timestamp DESC LIMIT 100');
    res.json(activities);
  });

  // 17. GET /api/repairs
  router.get('/repairs', async (req: Request, res: Response) => {
    const tasks = await query('SELECT * FROM repair_tasks ORDER BY startedAt DESC LIMIT 20');
    res.json(tasks);
  });

  // 18. POST /api/config
  router.post('/config', async (req: Request, res: Response) => {
    const { autoRepairEnabled } = req.body;
    if (typeof autoRepairEnabled === 'boolean') {
      await run('INSERT OR REPLACE INTO cluster_config (key, value) VALUES (?, ?)', [
        'autoRepairEnabled',
        String(autoRepairEnabled),
      ]);
    }
    res.json({ success: true });
  });

  // 19. POST /api/reset
  router.post('/reset', async (req: Request, res: Response) => {
    await seedDemoData();
    for (const node of DEFAULT_STORAGE_NODES) {
      fetch(`http://127.0.0.1:${node.port}/simulate/recover`, { method: 'POST' }).catch(() => {});
    }
    await pollAllNodes();
    await logActivity(
      'NODE_ONLINE',
      'Cluster Reset to Initial State',
      'All 4 nodes initialized with factory test objects and baseline replication.',
      'info'
    );
    res.json({ success: true });
  });

  return router;
}
