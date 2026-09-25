import { StorageNode } from '../types/node';
import { StoredObject, ObjectStatus } from '../types/object';

export interface ReplicationHealthAssessment {
  status: ObjectStatus;
  healthyReplicasCount: number;
  totalReplicasCount: number;
  targetReplicationFactor: number;
  isUnderReplicated: boolean;
  isCorrupted: boolean;
  isStale: boolean;
  availableSourceNodeId: string | null;
  missingReplicaCount: number;
}

/**
 * Intelligent replica placement: select online nodes with lowest disk utilization
 */
export function selectPlacementNodes(
  allNodes: StorageNode[],
  count: number,
  excludeNodeIds: string[] = []
): StorageNode[] {
  const eligibleNodes = allNodes.filter(
    n => n.status === 'HEALTHY' && !excludeNodeIds.includes(n.id)
  );

  // Sort by disk utilization ratio ascending (least utilized first)
  const sorted = [...eligibleNodes].sort((a, b) => {
    const ratioA = a.usedBytes / a.capacityBytes;
    const ratioB = b.usedBytes / b.capacityBytes;
    if (Math.abs(ratioA - ratioB) > 0.05) {
      return ratioA - ratioB;
    }
    // Minor jitter for equal load
    return Math.random() - 0.5;
  });

  return sorted.slice(0, count);
}

/**
 * Evaluate health of an object based on node statuses and replica integrity
 */
export function assessObjectHealth(
  obj: StoredObject,
  nodes: StorageNode[]
): ReplicationHealthAssessment {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  let healthyCount = 0;
  let corruptedCount = 0;
  let staleCount = 0;
  let availableSourceNodeId: string | null = null;

  for (const replica of obj.replicas) {
    const node = nodeMap.get(replica.nodeId);
    const isNodeOnline = node && node.status === 'HEALTHY';

    if (isNodeOnline) {
      if (replica.status === 'CORRUPTED' || replica.isCorrupted) {
        corruptedCount++;
      } else if (replica.status === 'STALE') {
        staleCount++;
      } else if (replica.status === 'HEALTHY') {
        healthyCount++;
        if (!availableSourceNodeId) {
          availableSourceNodeId = replica.nodeId;
        }
      }
    }
  }

  const isUnderReplicated = healthyCount < obj.replicationFactor;
  const isCorrupted = corruptedCount > 0;
  const isStale = staleCount > 0;

  let status: ObjectStatus = 'HEALTHY';
  if (isCorrupted) {
    status = 'CORRUPTED';
  } else if (isUnderReplicated) {
    status = 'REPAIR_REQUIRED';
  } else if (isStale) {
    status = 'DEGRADED';
  }

  return {
    status,
    healthyReplicasCount: healthyCount,
    totalReplicasCount: obj.replicas.length,
    targetReplicationFactor: obj.replicationFactor,
    isUnderReplicated,
    isCorrupted,
    isStale,
    availableSourceNodeId,
    missingReplicaCount: Math.max(0, obj.replicationFactor - healthyCount),
  };
}
