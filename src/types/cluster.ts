export interface ClusterStats {
  totalStorageBytes: number;
  usedStorageBytes: number;
  totalObjects: number;
  healthyReplicasCount: number;
  totalExpectedReplicas: number;
  healthyNodesCount: number;
  totalNodesCount: number;
  clusterHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  pendingRepairsCount: number;
}

export interface RepairTask {
  id: string;
  objectId: string;
  filename: string;
  sourceNodeId: string;
  targetNodeId: string;
  progress: number; // 0 to 100
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  completedAt?: string;
  reason: 'UNDER_REPLICATED' | 'CORRUPTED_REPLICA' | 'STALE_VERSION';
}

export interface ClusterConfig {
  defaultReplicationFactor: number;
  heartbeatIntervalMs: number;
  autoRepairEnabled: boolean;
  backgroundScrubbingEnabled: boolean;
}
