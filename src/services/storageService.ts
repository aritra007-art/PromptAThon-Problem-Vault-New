import { StorageNode } from '../types/node';
import { StoredObject } from '../types/object';
import { ActivityEvent } from '../types/activity';
import { ClusterConfig } from '../types/cluster';

const STORAGE_KEY = 'aritras_vault_cluster_data_v1';

export interface VaultClusterState {
  nodes: StorageNode[];
  objects: StoredObject[];
  activities: ActivityEvent[];
  config: ClusterConfig;
}

export const INITIAL_NODES: StorageNode[] = [
  {
    id: 'node-1',
    name: 'Storage Node 1',
    endpoint: '10.0.1.11:9000',
    status: 'HEALTHY',
    capacityBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    usedBytes: 34 * 1024 * 1024 * 1024, // 34 GB
    storedObjectIds: ['obj_arch_pdf', 'obj_db_dump'],
    lastHeartbeat: new Date().toISOString(),
    latencyMs: 18,
    region: 'us-east-1a',
  },
  {
    id: 'node-2',
    name: 'Storage Node 2',
    endpoint: '10.0.1.12:9000',
    status: 'HEALTHY',
    capacityBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    usedBytes: 28 * 1024 * 1024 * 1024, // 28 GB
    storedObjectIds: ['obj_arch_pdf', 'obj_ml_model'],
    lastHeartbeat: new Date().toISOString(),
    latencyMs: 24,
    region: 'us-east-1b',
  },
  {
    id: 'node-3',
    name: 'Storage Node 3',
    endpoint: '10.0.1.13:9000',
    status: 'HEALTHY',
    capacityBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    usedBytes: 38 * 1024 * 1024 * 1024, // 38 GB
    storedObjectIds: ['obj_db_dump', 'obj_ml_model'],
    lastHeartbeat: new Date().toISOString(),
    latencyMs: 19,
    region: 'us-east-1c',
  },
  {
    id: 'node-4',
    name: 'Storage Node 4',
    endpoint: '10.0.1.14:9000',
    status: 'HEALTHY',
    capacityBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    usedBytes: 22 * 1024 * 1024 * 1024, // 22 GB
    storedObjectIds: ['obj_arch_pdf', 'obj_db_dump'],
    lastHeartbeat: new Date().toISOString(),
    latencyMs: 27,
    region: 'us-east-1d',
  },
];

export const INITIAL_OBJECTS: StoredObject[] = [
  {
    objectId: 'obj_arch_pdf',
    filename: 'vault-architecture-specification.pdf',
    size: 14680064, // 14 MB
    mimeType: 'application/pdf',
    version: 1,
    checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    replicationFactor: 3,
    uploadedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    lastVerifiedAt: new Date(Date.now() - 60000 * 12).toISOString(),
    status: 'HEALTHY',
    description: 'Core architectural design doc for Aritra’s distributed object store',
    dataPayload: 'VAULT_PAYLOAD_PDF_V1_ARCHITECTURE_CORE_SPECIFICATION_FAULT_TOLERANCE',
    replicas: [
      {
        nodeId: 'node-1',
        version: 1,
        storedChecksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        status: 'HEALTHY',
        lastVerifiedAt: new Date(Date.now() - 60000 * 12).toISOString(),
      },
      {
        nodeId: 'node-2',
        version: 1,
        storedChecksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        status: 'HEALTHY',
        lastVerifiedAt: new Date(Date.now() - 60000 * 12).toISOString(),
      },
      {
        nodeId: 'node-4',
        version: 1,
        storedChecksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        status: 'HEALTHY',
        lastVerifiedAt: new Date(Date.now() - 60000 * 12).toISOString(),
      },
    ],
  },
  {
    objectId: 'obj_db_dump',
    filename: 'production_snapshot_2026.sql.gz',
    size: 2147483648, // 2 GB
    mimeType: 'application/gzip',
    version: 1,
    checksum: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
    replicationFactor: 3,
    uploadedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    lastVerifiedAt: new Date(Date.now() - 60000 * 30).toISOString(),
    status: 'HEALTHY',
    description: 'Cluster metadata and transactional snapshot archive',
    dataPayload: 'VAULT_PAYLOAD_SQL_DUMP_TRANSACTION_LOGS_CLUSTER_PERSISTENCE',
    replicas: [
      {
        nodeId: 'node-1',
        version: 1,
        storedChecksum: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
        status: 'HEALTHY',
        lastVerifiedAt: new Date(Date.now() - 60000 * 30).toISOString(),
      },
      {
        nodeId: 'node-3',
        version: 1,
        storedChecksum: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
        status: 'HEALTHY',
        lastVerifiedAt: new Date(Date.now() - 60000 * 30).toISOString(),
      },
      {
        nodeId: 'node-4',
        version: 1,
        storedChecksum: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
        status: 'HEALTHY',
        lastVerifiedAt: new Date(Date.now() - 60000 * 30).toISOString(),
      },
    ],
  },
  {
    objectId: 'obj_ml_model',
    filename: 'whisper-large-v3-weights.safetensors',
    size: 3221225472, // 3 GB
    mimeType: 'application/octet-stream',
    version: 2,
    checksum: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    replicationFactor: 2,
    uploadedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    lastVerifiedAt: new Date(Date.now() - 60000 * 5).toISOString(),
    status: 'HEALTHY',
    description: 'Neural speech recognition tensor checkpoint',
    dataPayload: 'VAULT_PAYLOAD_SAFETENSORS_TENSOR_WEIGHTS_PRECISION_FP16',
    replicas: [
      {
        nodeId: 'node-2',
        version: 2,
        storedChecksum: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
        status: 'HEALTHY',
        lastVerifiedAt: new Date(Date.now() - 60000 * 5).toISOString(),
      },
      {
        nodeId: 'node-3',
        version: 2,
        storedChecksum: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
        status: 'HEALTHY',
        lastVerifiedAt: new Date(Date.now() - 60000 * 5).toISOString(),
      },
    ],
  },
];

export const INITIAL_ACTIVITIES: ActivityEvent[] = [
  {
    id: 'evt_1',
    timestamp: new Date(Date.now() - 60000 * 12).toISOString(),
    type: 'INTEGRITY_CHECK',
    title: 'Routine Background Scrubber',
    description: 'Verified 8 replicas across 4 active nodes. All checksums matched canonical hashes.',
    severity: 'info',
  },
  {
    id: 'evt_2',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    type: 'OBJECT_UPLOADED',
    title: 'Object Ingestion Complete',
    description: 'Uploaded whisper-large-v3-weights.safetensors (3.00 GB). Replicas written to Node 2 and Node 3.',
    objectId: 'obj_ml_model',
    filename: 'whisper-large-v3-weights.safetensors',
    severity: 'success',
  },
  {
    id: 'evt_3',
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    type: 'REPLICATION_COMPLETED',
    title: 'Tri-Way Replication Settled',
    description: 'vault-architecture-specification.pdf quorum verified on Node 1, Node 2, and Node 4.',
    objectId: 'obj_arch_pdf',
    filename: 'vault-architecture-specification.pdf',
    severity: 'success',
  },
  {
    id: 'evt_4',
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
    type: 'NODE_ONLINE',
    title: 'Cluster Topology Initialized',
    description: 'Storage Node 1, Node 2, Node 3, and Node 4 joined the quorum with healthy state.',
    severity: 'info',
  },
];

export const INITIAL_CONFIG: ClusterConfig = {
  defaultReplicationFactor: 3,
  heartbeatIntervalMs: 3000,
  autoRepairEnabled: true,
  backgroundScrubbingEnabled: true,
};

export function loadClusterState(): VaultClusterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.objects)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to load cluster state from localStorage, initializing fresh:', err);
  }

  const initial: VaultClusterState = {
    nodes: INITIAL_NODES,
    objects: INITIAL_OBJECTS,
    activities: INITIAL_ACTIVITIES,
    config: INITIAL_CONFIG,
  };
  saveClusterState(initial);
  return initial;
}

export function saveClusterState(state: VaultClusterState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to persist cluster state:', err);
  }
}

export function clearClusterState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear cluster state:', err);
  }
}
