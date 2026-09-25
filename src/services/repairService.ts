import { StorageNode } from '../types/node';
import { StoredObject, ObjectReplica } from '../types/object';
import { RepairTask } from '../types/cluster';

/**
 * Plan repair tasks for an object needing restoration
 */
export function planObjectRepair(
  object: StoredObject,
  nodes: StorageNode[]
): RepairTask | null {
  const healthyReplicas = object.replicas.filter(r => {
    const node = nodes.find(n => n.id === r.nodeId);
    return node && node.status === 'HEALTHY' && r.status === 'HEALTHY' && !r.isCorrupted;
  });

  if (healthyReplicas.length === 0) {
    // Critical: No healthy source available!
    return null;
  }

  const sourceReplica = healthyReplicas[0];
  const occupiedNodeIds = object.replicas.map(r => r.nodeId);

  // Check 1: Is there a corrupted replica that can be repaired in-place?
  const corruptedReplica = object.replicas.find(r => {
    const node = nodes.find(n => n.id === r.nodeId);
    return node && node.status === 'HEALTHY' && (r.status === 'CORRUPTED' || r.isCorrupted);
  });

  if (corruptedReplica) {
    return {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      objectId: object.objectId,
      filename: object.filename,
      sourceNodeId: sourceReplica.nodeId,
      targetNodeId: corruptedReplica.nodeId,
      progress: 0,
      status: 'PENDING',
      startedAt: new Date().toISOString(),
      reason: 'CORRUPTED_REPLICA',
    };
  }

  // Check 2: Is there a stale replica that can be synchronized?
  const staleReplica = object.replicas.find(r => {
    const node = nodes.find(n => n.id === r.nodeId);
    return node && node.status === 'HEALTHY' && r.status === 'STALE';
  });

  if (staleReplica) {
    return {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      objectId: object.objectId,
      filename: object.filename,
      sourceNodeId: sourceReplica.nodeId,
      targetNodeId: staleReplica.nodeId,
      progress: 0,
      status: 'PENDING',
      startedAt: new Date().toISOString(),
      reason: 'STALE_VERSION',
    };
  }

  // Check 3: Is the object under-replicated due to offline nodes?
  if (healthyReplicas.length < object.replicationFactor) {
    // Find an online node that does NOT have a replica yet
    const candidateNodes = nodes.filter(
      n => n.status === 'HEALTHY' && !occupiedNodeIds.includes(n.id)
    );

    if (candidateNodes.length > 0) {
      // Pick node with lowest utilization
      const targetNode = candidateNodes.sort(
        (a, b) => a.usedBytes / a.capacityBytes - b.usedBytes / b.capacityBytes
      )[0];

      return {
        id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        objectId: object.objectId,
        filename: object.filename,
        sourceNodeId: sourceReplica.nodeId,
        targetNodeId: targetNode.id,
        progress: 0,
        status: 'PENDING',
        startedAt: new Date().toISOString(),
        reason: 'UNDER_REPLICATED',
      };
    }
  }

  return null;
}

/**
 * Apply the outcome of a successful repair to the object
 */
export function applyRepairToReplica(
  object: StoredObject,
  targetNodeId: string,
  reason: RepairTask['reason']
): StoredObject {
  let updatedReplicas = [...object.replicas];
  const existingIndex = updatedReplicas.findIndex(r => r.nodeId === targetNodeId);

  const freshReplica: ObjectReplica = {
    nodeId: targetNodeId,
    version: object.version,
    storedChecksum: object.checksum,
    status: 'HEALTHY',
    lastVerifiedAt: new Date().toISOString(),
    isCorrupted: false,
  };

  if (existingIndex >= 0) {
    // In-place repair (e.g. corruption fixed or stale version synced)
    updatedReplicas[existingIndex] = freshReplica;
  } else {
    // New replica added to a healthy node
    // Check if we should replace an offline replica or append
    // Filter out offline replicas if length would exceed replicationFactor
    const hasOfflineReplica = updatedReplicas.some(r => r.status === 'OFFLINE');
    if (hasOfflineReplica && updatedReplicas.length >= object.replicationFactor) {
      const offlineIdx = updatedReplicas.findIndex(r => r.status === 'OFFLINE');
      if (offlineIdx >= 0) {
        updatedReplicas.splice(offlineIdx, 1);
      }
    }
    updatedReplicas.push(freshReplica);
  }

  return {
    ...object,
    status: 'HEALTHY',
    lastVerifiedAt: new Date().toISOString(),
    replicas: updatedReplicas,
  };
}
