import { StoredObject, ObjectReplica } from '../types/object';
import { StorageNode } from '../types/node';
import { generateCorruptedChecksum } from './cryptoService';

export interface VerificationResult {
  objectId: string;
  filename: string;
  totalReplicas: number;
  healthyReplicas: number;
  corruptedReplicas: number;
  staleReplicas: number;
  offlineReplicas: number;
  details: {
    nodeId: string;
    nodeName: string;
    status: 'MATCHED' | 'MISMATCH' | 'STALE' | 'OFFLINE';
    expectedChecksum: string;
    actualChecksum: string;
    expectedVersion: number;
    actualVersion: number;
  }[];
}

/**
 * Perform verification on all replicas of a specific object
 */
export function verifyObjectIntegrity(
  object: StoredObject,
  nodes: StorageNode[]
): VerificationResult {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const details: VerificationResult['details'] = [];
  let healthy = 0;
  let corrupted = 0;
  let stale = 0;
  let offline = 0;

  for (const replica of object.replicas) {
    const node = nodeMap.get(replica.nodeId);
    const nodeName = node ? node.name : replica.nodeId;
    const isOnline = node && node.status === 'HEALTHY';

    if (!isOnline) {
      offline++;
      details.push({
        nodeId: replica.nodeId,
        nodeName,
        status: 'OFFLINE',
        expectedChecksum: object.checksum,
        actualChecksum: '--- [NODE UNREACHABLE] ---',
        expectedVersion: object.version,
        actualVersion: replica.version,
      });
      continue;
    }

    if (replica.storedChecksum !== object.checksum || replica.status === 'CORRUPTED') {
      corrupted++;
      details.push({
        nodeId: replica.nodeId,
        nodeName,
        status: 'MISMATCH',
        expectedChecksum: object.checksum,
        actualChecksum: replica.storedChecksum,
        expectedVersion: object.version,
        actualVersion: replica.version,
      });
    } else if (replica.version < object.version || replica.status === 'STALE') {
      stale++;
      details.push({
        nodeId: replica.nodeId,
        nodeName,
        status: 'STALE',
        expectedChecksum: object.checksum,
        actualChecksum: replica.storedChecksum,
        expectedVersion: object.version,
        actualVersion: replica.version,
      });
    } else {
      healthy++;
      details.push({
        nodeId: replica.nodeId,
        nodeName,
        status: 'MATCHED',
        expectedChecksum: object.checksum,
        actualChecksum: replica.storedChecksum,
        expectedVersion: object.version,
        actualVersion: replica.version,
      });
    }
  }

  return {
    objectId: object.objectId,
    filename: object.filename,
    totalReplicas: object.replicas.length,
    healthyReplicas: healthy,
    corruptedReplicas: corrupted,
    staleReplicas: stale,
    offlineReplicas: offline,
    details,
  };
}

/**
 * Corrupt a replica's payload and checksum
 */
export function corruptReplica(
  object: StoredObject,
  nodeId: string
): StoredObject {
  const updatedReplicas: ObjectReplica[] = object.replicas.map(r => {
    if (r.nodeId === nodeId) {
      return {
        ...r,
        storedChecksum: generateCorruptedChecksum(r.storedChecksum),
        status: 'CORRUPTED',
        isCorrupted: true,
        lastVerifiedAt: new Date().toISOString(),
      };
    }
    return r;
  });

  return {
    ...object,
    status: 'CORRUPTED',
    replicas: updatedReplicas,
  };
}

/**
 * Make a replica stale (lower version number)
 */
export function makeReplicaStale(
  object: StoredObject,
  nodeId: string
): StoredObject {
  const updatedReplicas: ObjectReplica[] = object.replicas.map(r => {
    if (r.nodeId === nodeId) {
      return {
        ...r,
        version: Math.max(1, object.version - 1),
        status: 'STALE',
        lastVerifiedAt: new Date().toISOString(),
      };
    }
    return r;
  });

  return {
    ...object,
    status: 'DEGRADED',
    replicas: updatedReplicas,
  };
}
