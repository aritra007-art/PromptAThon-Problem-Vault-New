export type NodeStatus = 'HEALTHY' | 'OFFLINE' | 'DEGRADED' | 'RECOVERING' | 'PARTITIONED';

export interface StorageNode {
  id: string;
  name: string;
  endpoint: string;
  status: NodeStatus;
  capacityBytes: number;
  usedBytes: number;
  storedObjectIds: string[];
  lastHeartbeat: string;
  latencyMs: number;
  region: string;
  failureReason?: string;
}

export interface NodeMetrics {
  totalNodes: number;
  healthyNodes: number;
  offlineNodes: number;
  recoveringNodes: number;
  totalCapacityBytes: number;
  totalUsedBytes: number;
}
