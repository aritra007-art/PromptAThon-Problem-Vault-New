export interface DbObjectRecord {
  objectId: string;
  filename: string;
  size: number;
  mimeType: string;
  version: number;
  checksum: string;
  replicationFactor: number;
  uploadedAt: string;
  lastVerifiedAt?: string;
  status: string;
  description?: string;
}

export interface DbReplicaRecord {
  id?: string;
  objectId: string;
  nodeId: string;
  version: number;
  storedChecksum: string;
  status: string;
  storagePath: string;
  isCorrupted: boolean;
  lastVerifiedAt?: string;
}

export interface DbActivityRecord {
  id: string;
  timestamp: string;
  type: string;
  title: string;
  description: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  nodeId?: string;
  objectId?: string;
  filename?: string;
}

export interface DbRepairTaskRecord {
  id: string;
  objectId: string;
  filename: string;
  sourceNodeId: string;
  targetNodeId: string;
  reason: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  progress: number;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface DbClusterConfigRecord {
  defaultReplicationFactor: number;
  heartbeatIntervalMs: number;
  autoRepairEnabled: boolean;
  backgroundScrubbingEnabled: boolean;
}

export interface DatabaseProvider {
  name: string;
  mode: 'sqlite' | 'supabase';
  init(): Promise<void>;
  
  // Objects
  getObjects(): Promise<DbObjectRecord[]>;
  getObject(objectId: string): Promise<DbObjectRecord | null>;
  saveObject(obj: DbObjectRecord): Promise<void>;
  deleteObject(objectId: string): Promise<void>;
  
  // Replicas
  getReplicas(objectId?: string): Promise<DbReplicaRecord[]>;
  saveReplica(replica: DbReplicaRecord): Promise<void>;
  deleteReplicas(objectId: string): Promise<void>;
  deleteReplica(objectId: string, nodeId: string): Promise<void>;
  
  // Activities
  getActivities(limit?: number): Promise<DbActivityRecord[]>;
  saveActivity(activity: DbActivityRecord): Promise<void>;
  
  // Repair Tasks
  getRepairTasks(): Promise<DbRepairTaskRecord[]>;
  saveRepairTask(task: DbRepairTaskRecord): Promise<void>;
  
  // Config
  getConfig(): Promise<DbClusterConfigRecord>;
  saveConfig(config: DbClusterConfigRecord): Promise<void>;
}
