import { StorageNode } from '../types/node';
import { StoredObject, ObjectReplica, UploadOptions } from '../types/object';
import { ActivityEvent, EventType } from '../types/activity';
import { ClusterStats, RepairTask, ClusterConfig } from '../types/cluster';
import {
  loadClusterState,
  saveClusterState,
  clearClusterState,
  INITIAL_NODES,
  INITIAL_OBJECTS,
  INITIAL_ACTIVITIES,
  INITIAL_CONFIG,
} from './storageService';
import { computeSHA256, formatBytes } from './cryptoService';
import { selectPlacementNodes, assessObjectHealth } from './replicationService';
import { verifyObjectIntegrity, corruptReplica, makeReplicaStale, VerificationResult } from './integrityService';
import { planObjectRepair, applyRepairToReplica } from './repairService';

type Listener = () => void;

class ClusterCoordinator {
  private nodes: StorageNode[] = [];
  private objects: StoredObject[] = [];
  private activities: ActivityEvent[] = [];
  private config: ClusterConfig = INITIAL_CONFIG;
  private repairQueue: RepairTask[] = [];
  private listeners: Set<Listener> = new Set();
  private heartbeatTimer: number | null = null;
  private isProcessingRepair = false;

  constructor() {
    this.init();
  }

  private init() {
    const loaded = loadClusterState();
    this.nodes = loaded.nodes;
    this.objects = loaded.objects;
    this.activities = loaded.activities;
    this.config = loaded.config || INITIAL_CONFIG;

    this.recalculateObjectStatuses();
    this.startHeartbeatLoop();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.persist();
    this.listeners.forEach(fn => fn());
  }

  private persist() {
    saveClusterState({
      nodes: this.nodes,
      objects: this.objects,
      activities: this.activities.slice(0, 100), // Retain latest 100 events
      config: this.config,
    });
  }

  // Activity logger helper
  public logEvent(
    type: EventType,
    title: string,
    description: string,
    severity: ActivityEvent['severity'] = 'info',
    extra?: { nodeId?: string; objectId?: string; filename?: string }
  ) {
    const event: ActivityEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      type,
      title,
      description,
      severity,
      nodeId: extra?.nodeId,
      objectId: extra?.objectId,
      filename: extra?.filename,
    };
    this.activities = [event, ...this.activities];
    this.notify();
  }

  // Getters
  public getNodes(): StorageNode[] {
    return [...this.nodes];
  }

  public getObjects(): StoredObject[] {
    return [...this.objects];
  }

  public getActivities(): ActivityEvent[] {
    return [...this.activities];
  }

  public getConfig(): ClusterConfig {
    return { ...this.config };
  }

  public getRepairQueue(): RepairTask[] {
    return [...this.repairQueue];
  }

  public getStats(): ClusterStats {
    let totalStorageBytes = 0;
    let usedStorageBytes = 0;
    let healthyNodesCount = 0;

    for (const node of this.nodes) {
      totalStorageBytes += node.capacityBytes;
      usedStorageBytes += node.usedBytes;
      if (node.status === 'HEALTHY') {
        healthyNodesCount++;
      }
    }

    let healthyReplicasCount = 0;
    let totalExpectedReplicas = 0;

    for (const obj of this.objects) {
      totalExpectedReplicas += obj.replicationFactor;
      const assessment = assessObjectHealth(obj, this.nodes);
      healthyReplicasCount += assessment.healthyReplicasCount;
    }

    let clusterHealth: ClusterStats['clusterHealth'] = 'HEALTHY';
    if (healthyNodesCount <= 1 || healthyReplicasCount < totalExpectedReplicas * 0.5) {
      clusterHealth = 'CRITICAL';
    } else if (healthyNodesCount < this.nodes.length || healthyReplicasCount < totalExpectedReplicas) {
      clusterHealth = 'DEGRADED';
    }

    return {
      totalStorageBytes,
      usedStorageBytes,
      totalObjects: this.objects.length,
      healthyReplicasCount,
      totalExpectedReplicas,
      healthyNodesCount,
      totalNodesCount: this.nodes.length,
      clusterHealth,
      pendingRepairsCount: this.repairQueue.filter(t => t.status !== 'COMPLETED').length,
    };
  }

  public updateConfig(newConfig: Partial<ClusterConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.notify();
  }

  // Recalculate status of all objects against current nodes
  private recalculateObjectStatuses() {
    this.objects = this.objects.map(obj => {
      const assessment = assessObjectHealth(obj, this.nodes);
      // Mark replica statuses if node is offline
      const replicas: ObjectReplica[] = obj.replicas.map(r => {
        const node = this.nodes.find(n => n.id === r.nodeId);
        if (!node || node.status !== 'HEALTHY') {
          return { ...r, status: 'OFFLINE' };
        }
        if (r.status === 'OFFLINE') {
          return { ...r, status: 'HEALTHY' };
        }
        return r;
      });

      return {
        ...obj,
        status: assessment.status,
        replicas,
      };
    });
  }

  // Heartbeat loop
  private startHeartbeatLoop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = window.setInterval(() => {
      let changed = false;
      const now = new Date().toISOString();

      this.nodes = this.nodes.map(node => {
        if (node.status === 'HEALTHY') {
          // Fluctuate latency slightly
          const latencyDelta = Math.floor(Math.random() * 7) - 3;
          const latencyMs = Math.max(12, Math.min(45, node.latencyMs + latencyDelta));
          changed = true;
          return {
            ...node,
            lastHeartbeat: now,
            latencyMs,
          };
        }
        return node;
      });

      if (changed) {
        this.notify();
      }
    }, this.config.heartbeatIntervalMs || 3000);
  }

  // Object Ingestion / Upload
  public async uploadObject(options: UploadOptions): Promise<StoredObject> {
    const { file, replicationFactor } = options;
    const isNativeFile = file instanceof File;
    const filename = isNativeFile ? file.name : file.name;
    const size = isNativeFile ? file.size : file.size;
    const mimeType = isNativeFile ? file.type || 'application/octet-stream' : file.type;

    let payloadString = '';
    let checksum = '';

    if (isNativeFile) {
      const buffer = await file.arrayBuffer();
      checksum = await computeSHA256(buffer);
      // Store small sample or base64
      if (file.size <= 2 * 1024 * 1024) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        payloadString = btoa(binary);
      } else {
        payloadString = `[VAULT_STORED_BLOB_SHA256_${checksum.slice(0, 16)}]`;
      }
    } else {
      payloadString = file.content;
      checksum = await computeSHA256(file.content);
    }

    // Select target nodes for replication
    const selectedNodes = selectPlacementNodes(this.nodes, replicationFactor);
    if (selectedNodes.length === 0) {
      throw new Error('No healthy storage nodes available for replica placement!');
    }

    const objectId = `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const replicas: ObjectReplica[] = selectedNodes.map(node => ({
      nodeId: node.id,
      version: 1,
      storedChecksum: checksum,
      status: 'HEALTHY',
      lastVerifiedAt: now,
      isCorrupted: false,
    }));

    const newObject: StoredObject = {
      objectId,
      filename,
      size,
      mimeType,
      version: 1,
      checksum,
      replicationFactor,
      replicas,
      uploadedAt: now,
      lastVerifiedAt: now,
      status: 'HEALTHY',
      dataPayload: payloadString,
    };

    // Update node metrics
    const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
    this.nodes = this.nodes.map(node => {
      if (selectedNodeIds.has(node.id)) {
        return {
          ...node,
          usedBytes: node.usedBytes + Math.round(size * 0.1), // Proportional simulated storage increment
          storedObjectIds: [...node.storedObjectIds, objectId],
        };
      }
      return node;
    });

    this.objects = [newObject, ...this.objects];

    this.logEvent(
      'OBJECT_UPLOADED',
      `File Ingestion: ${filename}`,
      `Uploaded ${formatBytes(size)}. Placed replicas across nodes: ${selectedNodes.map(n => n.name).join(', ')}.`,
      'success',
      { objectId, filename }
    );

    this.logEvent(
      'REPLICATION_COMPLETED',
      `Replication Quorum Settled`,
      `${filename} replicated with factor ${replicationFactor} (${selectedNodes.length}/${replicationFactor} nodes).`,
      'success',
      { objectId, filename }
    );

    this.notify();
    return newObject;
  }

  // Object Retrieval / Download with Automatic Failover
  public downloadObject(objectId: string): {
    success: boolean;
    retrievedFromNodeId: string;
    wasFailover: boolean;
    offlineReplicaNode?: string;
    message: string;
  } {
    const obj = this.objects.find(o => o.objectId === objectId);
    if (!obj) {
      throw new Error(`Object with ID ${objectId} not found`);
    }

    // Examine replicas
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    let selectedReplica: ObjectReplica | null = null;
    let selectedNode: StorageNode | null = null;
    let wasFailover = false;
    let offlineReplicaNode: string | undefined;

    // Check primary replica first
    const primaryReplica = obj.replicas[0];
    const primaryNode = primaryReplica ? nodeMap.get(primaryReplica.nodeId) : null;

    if (primaryNode && primaryNode.status === 'HEALTHY' && primaryReplica.status === 'HEALTHY' && !primaryReplica.isCorrupted) {
      selectedReplica = primaryReplica;
      selectedNode = primaryNode;
    } else {
      // Primary unavailable or corrupted! Failover to healthy secondary replica
      wasFailover = true;
      offlineReplicaNode = primaryNode ? primaryNode.name : (primaryReplica ? primaryReplica.nodeId : 'Primary node');

      for (const replica of obj.replicas) {
        const node = nodeMap.get(replica.nodeId);
        if (node && node.status === 'HEALTHY' && replica.status === 'HEALTHY' && !replica.isCorrupted) {
          selectedReplica = replica;
          selectedNode = node;
          break;
        }
      }
    }

    if (!selectedReplica || !selectedNode) {
      this.logEvent(
        'SYSTEM_ALERT',
        `Retrieval Failed: ${obj.filename}`,
        `No reachable healthy replica found for ${obj.filename}. All host nodes are offline or corrupted.`,
        'error',
        { objectId, filename: obj.filename }
      );
      throw new Error(`Cannot retrieve ${obj.filename}: all replica nodes are offline or corrupted.`);
    }

    // Trigger browser file download
    const filename = obj.filename;
    let blob: Blob;
    if (obj.dataPayload && obj.dataPayload.startsWith('[VAULT_STORED_BLOB')) {
      blob = new Blob([`Fault-Tolerant Distributed Object Storage Payload: ${filename}\nVersion: ${obj.version}\nChecksum: ${obj.checksum}\nNode: ${selectedNode.name}`], { type: obj.mimeType || 'text/plain' });
    } else if (obj.dataPayload) {
      try {
        const decoded = atob(obj.dataPayload);
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) {
          bytes[i] = decoded.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: obj.mimeType });
      } catch {
        blob = new Blob([obj.dataPayload], { type: obj.mimeType || 'text/plain' });
      }
    } else {
      blob = new Blob([`Vault Simulated Content for ${filename}`], { type: 'text/plain' });
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const message = wasFailover
      ? `${offlineReplicaNode} unavailable — retrieved from ${selectedNode.name} (Failover)`
      : `Retrieved from ${selectedNode.name}`;

    this.logEvent(
      'OBJECT_DOWNLOADED',
      `File Retrieved: ${filename}`,
      message,
      wasFailover ? 'warning' : 'success',
      { objectId, filename, nodeId: selectedNode.id }
    );

    return {
      success: true,
      retrievedFromNodeId: selectedNode.id,
      wasFailover,
      offlineReplicaNode,
      message,
    };
  }

  // Simulate Node Failure
  public simulateNodeFailure(nodeId: string) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;

    this.nodes = this.nodes.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          status: 'OFFLINE',
          failureReason: 'Simulated hardware/network partition failure',
        };
      }
      return n;
    });

    this.logEvent(
      'NODE_FAILURE',
      `${node.name} Marked OFFLINE`,
      `Heartbeat lost. Node halted and removed from active read/write quorum.`,
      'error',
      { nodeId }
    );

    this.recalculateObjectStatuses();

    // Identify affected objects
    const affected = this.objects.filter(obj =>
      obj.replicas.some(r => r.nodeId === nodeId)
    );

    if (affected.length > 0) {
      this.logEvent(
        'SYSTEM_ALERT',
        `${affected.length} Objects Under-Replicated`,
        `Failure of ${node.name} reduced replica counts below configured quorum for ${affected.map(o => o.filename).slice(0, 3).join(', ')}${affected.length > 3 ? '...' : ''}.`,
        'warning'
      );

      if (this.config.autoRepairEnabled) {
        this.triggerAutonomousRepairs();
      }
    }

    this.notify();
  }

  // Recover Node
  public async recoverNode(nodeId: string) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Transition to RECOVERING
    this.nodes = this.nodes.map(n =>
      n.id === nodeId ? { ...n, status: 'RECOVERING' } : n
    );
    this.notify();

    this.logEvent(
      'NODE_RECOVERY',
      `${node.name} Initiating Recovery`,
      `Reconnecting socket, checking journal logs and verifying stored replica hashes...`,
      'info',
      { nodeId }
    );

    // Simulate recovery synchronization delay
    await new Promise(resolve => setTimeout(resolve, 1400));

    this.nodes = this.nodes.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          status: 'HEALTHY',
          failureReason: undefined,
          lastHeartbeat: new Date().toISOString(),
        };
      }
      return n;
    });

    this.recalculateObjectStatuses();

    this.logEvent(
      'NODE_ONLINE',
      `${node.name} Fully Restored`,
      `Storage node re-entered cluster quorum. Replicas reconciled and validated.`,
      'success',
      { nodeId }
    );

    this.notify();
  }

  // Simulate Corruption on a specific replica
  public simulateCorruption(objectId: string, nodeId: string) {
    const obj = this.objects.find(o => o.objectId === objectId);
    if (!obj) return;
    const node = this.nodes.find(n => n.id === nodeId);
    const nodeName = node ? node.name : nodeId;

    const corruptedObj = corruptReplica(obj, nodeId);
    this.objects = this.objects.map(o => (o.objectId === objectId ? corruptedObj : o));

    this.logEvent(
      'CORRUPTION_SIMULATED',
      `Data Corruption Injected: ${obj.filename}`,
      `Simulated bitrot / bit-flip corruption on replica stored on ${nodeName}. Actual checksum diverged from canonical hash.`,
      'error',
      { objectId, filename: obj.filename, nodeId }
    );

    this.notify();
  }

  // Simulate Inconsistent / Stale Version on a replica
  public simulateStaleVersion(objectId: string, nodeId: string) {
    const obj = this.objects.find(o => o.objectId === objectId);
    if (!obj) return;
    const node = this.nodes.find(n => n.id === nodeId);
    const nodeName = node ? node.name : nodeId;

    const staleObj = makeReplicaStale(obj, nodeId);
    this.objects = this.objects.map(o => (o.objectId === objectId ? staleObj : o));

    this.logEvent(
      'INCONSISTENCY_DETECTED',
      `Replica Inconsistency Injected: ${obj.filename}`,
      `Replica on ${nodeName} downgraded to stale version v${obj.version - 1}. Quorum version mismatch flagged.`,
      'warning',
      { objectId, filename: obj.filename, nodeId }
    );

    this.notify();
  }

  // Integrity Verification
  public async verifyIntegrity(objectId?: string): Promise<VerificationResult[]> {
    const targetObjects = objectId
      ? this.objects.filter(o => o.objectId === objectId)
      : this.objects;

    const results: VerificationResult[] = [];

    for (const obj of targetObjects) {
      const res = verifyObjectIntegrity(obj, this.nodes);
      results.push(res);

      if (res.corruptedReplicas > 0) {
        this.logEvent(
          'INTEGRITY_MISMATCH',
          `Integrity Violation Detected: ${obj.filename}`,
          `Checksum mismatch detected on ${res.corruptedReplicas} replica(s). Stored hash differed from canonical hash ${obj.checksum.slice(0, 12)}...`,
          'error',
          { objectId: obj.objectId, filename: obj.filename }
        );

        if (this.config.autoRepairEnabled) {
          this.triggerAutonomousRepairs();
        }
      } else if (res.staleReplicas > 0) {
        this.logEvent(
          'INCONSISTENCY_DETECTED',
          `Stale Version Detected: ${obj.filename}`,
          `${res.staleReplicas} replica(s) are behind the latest version v${obj.version}.`,
          'warning',
          { objectId: obj.objectId, filename: obj.filename }
        );

        if (this.config.autoRepairEnabled) {
          this.triggerAutonomousRepairs();
        }
      } else {
        this.logEvent(
          'INTEGRITY_CHECK',
          `Integrity Verified: ${obj.filename}`,
          `All ${res.healthyReplicas} reachable replicas matched SHA-256 canonical hash ${obj.checksum.slice(0, 10)}...`,
          'success',
          { objectId: obj.objectId, filename: obj.filename }
        );
      }
    }

    // Update object lastVerifiedAt
    const now = new Date().toISOString();
    this.objects = this.objects.map(o => {
      if (targetObjects.some(t => t.objectId === o.objectId)) {
        return { ...o, lastVerifiedAt: now };
      }
      return o;
    });

    this.notify();
    return results;
  }

  // Trigger Autonomous Repairs for all degraded/under-replicated/corrupted objects
  public async triggerAutonomousRepairs() {
    if (this.isProcessingRepair) return;
    this.isProcessingRepair = true;

    try {
      for (const obj of this.objects) {
        const assessment = assessObjectHealth(obj, this.nodes);
        if (assessment.isUnderReplicated || assessment.isCorrupted || assessment.isStale) {
          const task = planObjectRepair(obj, this.nodes);
          if (task) {
            await this.executeRepairTask(task);
          }
        }
      }
    } finally {
      this.isProcessingRepair = false;
    }
  }

  // Single Object Repair
  public async repairObject(objectId: string): Promise<boolean> {
    const obj = this.objects.find(o => o.objectId === objectId);
    if (!obj) return false;

    const task = planObjectRepair(obj, this.nodes);
    if (!task) {
      this.logEvent(
        'SYSTEM_ALERT',
        `Cannot Repair ${obj.filename}`,
        `No eligible healthy target node or source replica available.`,
        'error',
        { objectId, filename: obj.filename }
      );
      return false;
    }

    await this.executeRepairTask(task);
    return true;
  }

  // Repair execution with progress
  public async executeRepairTask(task: RepairTask) {
    const sourceNode = this.nodes.find(n => n.id === task.sourceNodeId);
    const targetNode = this.nodes.find(n => n.id === task.targetNodeId);
    const sourceName = sourceNode ? sourceNode.name : task.sourceNodeId;
    const targetName = targetNode ? targetNode.name : task.targetNodeId;

    this.repairQueue = [task, ...this.repairQueue];
    this.logEvent(
      'REPAIR_STARTED',
      `Auto-Repair Initiated: ${task.filename}`,
      `Reconstructing replica from ${sourceName} → ${targetName} (Reason: ${task.reason}).`,
      'info',
      { objectId: task.objectId, filename: task.filename }
    );
    this.notify();

    // Progress updates (0% -> 35% -> 70% -> 100%)
    const steps = [35, 70, 100];
    for (const step of steps) {
      await new Promise(r => setTimeout(r, 400));
      task.progress = step;
      task.status = step === 100 ? 'COMPLETED' : 'IN_PROGRESS';
      this.notify();
    }

    // Apply repair
    const obj = this.objects.find(o => o.objectId === task.objectId);
    if (obj) {
      const repairedObj = applyRepairToReplica(obj, task.targetNodeId, task.reason);
      this.objects = this.objects.map(o => (o.objectId === task.objectId ? repairedObj : o));

      // Update target node stats
      this.nodes = this.nodes.map(n => {
        if (n.id === task.targetNodeId && !n.storedObjectIds.includes(task.objectId)) {
          return {
            ...n,
            usedBytes: n.usedBytes + Math.round(obj.size * 0.1),
            storedObjectIds: [...n.storedObjectIds, task.objectId],
          };
        }
        return n;
      });

      this.recalculateObjectStatuses();
    }

    task.completedAt = new Date().toISOString();

    this.logEvent(
      'REPAIR_COMPLETED',
      `Replica Restored: ${task.filename}`,
      `Successfully copied and validated replica onto ${targetName}. Replication factor restored.`,
      'success',
      { objectId: task.objectId, filename: task.filename, nodeId: task.targetNodeId }
    );

    this.notify();
  }

  // Cluster Rebalance
  public async rebalanceCluster(): Promise<boolean> {
    // Find node with highest utilization and node with lowest utilization
    const healthyNodes = this.nodes.filter(n => n.status === 'HEALTHY');
    if (healthyNodes.length < 2) {
      this.logEvent(
        'SYSTEM_ALERT',
        'Rebalance Aborted',
        'At least two healthy nodes are required to balance cluster load.',
        'warning'
      );
      return false;
    }

    healthyNodes.sort((a, b) => b.usedBytes / b.capacityBytes - a.usedBytes / a.capacityBytes);
    const highest = healthyNodes[0];
    const lowest = healthyNodes[healthyNodes.length - 1];

    const highestUsagePct = Math.round((highest.usedBytes / highest.capacityBytes) * 100);
    const lowestUsagePct = Math.round((lowest.usedBytes / lowest.capacityBytes) * 100);

    // Find candidate object on highest node that is NOT already replicated on lowest node
    const candidateObj = this.objects.find(
      obj =>
        obj.replicas.some(r => r.nodeId === highest.id) &&
        !obj.replicas.some(r => r.nodeId === lowest.id)
    );

    if (!candidateObj) {
      this.logEvent(
        'SYSTEM_ALERT',
        'Cluster Already Optimized',
        `Replica distribution is already balanced across available nodes (${highest.name}: ${highestUsagePct}%, ${lowest.name}: ${lowestUsagePct}%).`,
        'info'
      );
      return false;
    }

    this.logEvent(
      'REBALANCE_TRIGGERED',
      `Cluster Load Rebalancing Initiated`,
      `Migrating replica of ${candidateObj.filename} from overloaded ${highest.name} (${highestUsagePct}%) to underutilized ${lowest.name} (${lowestUsagePct}%).`,
      'info'
    );

    // Migrate replica
    await new Promise(r => setTimeout(r, 800));

    const updatedReplicas = candidateObj.replicas.map(r => {
      if (r.nodeId === highest.id) {
        return {
          ...r,
          nodeId: lowest.id,
          lastVerifiedAt: new Date().toISOString(),
        };
      }
      return r;
    });

    const shiftBytes = Math.round(candidateObj.size * 0.1);

    this.objects = this.objects.map(o =>
      o.objectId === candidateObj.objectId ? { ...o, replicas: updatedReplicas } : o
    );

    this.nodes = this.nodes.map(n => {
      if (n.id === highest.id) {
        return {
          ...n,
          usedBytes: Math.max(0, n.usedBytes - shiftBytes),
          storedObjectIds: n.storedObjectIds.filter(id => id !== candidateObj.objectId),
        };
      }
      if (n.id === lowest.id) {
        return {
          ...n,
          usedBytes: n.usedBytes + shiftBytes,
          storedObjectIds: [...n.storedObjectIds, candidateObj.objectId],
        };
      }
      return n;
    });

    this.logEvent(
      'REBALANCE_TRIGGERED',
      `Cluster Rebalance Complete`,
      `${candidateObj.filename} migrated successfully. Load balanced across all nodes.`,
      'success'
    );

    this.notify();
    return true;
  }

  // Delete Object
  public deleteObject(objectId: string) {
    const obj = this.objects.find(o => o.objectId === objectId);
    if (!obj) return;

    this.objects = this.objects.filter(o => o.objectId !== objectId);
    this.nodes = this.nodes.map(n => ({
      ...n,
      storedObjectIds: n.storedObjectIds.filter(id => id !== objectId),
    }));

    this.logEvent(
      'OBJECT_DELETED',
      `Object Purged: ${obj.filename}`,
      `Deleted metadata and released replicas across all host nodes.`,
      'info',
      { objectId, filename: obj.filename }
    );

    this.notify();
  }

  // Reset to pristine state
  public resetCluster() {
    clearClusterState();
    this.nodes = INITIAL_NODES;
    this.objects = INITIAL_OBJECTS;
    this.activities = INITIAL_ACTIVITIES;
    this.config = INITIAL_CONFIG;
    this.repairQueue = [];
    this.recalculateObjectStatuses();
    this.logEvent(
      'NODE_ONLINE',
      'Cluster Reset to Default State',
      'All 4 nodes initialized with factory test objects and baseline replication.',
      'info'
    );
    this.notify();
  }
}

export const coordinator = new ClusterCoordinator();
