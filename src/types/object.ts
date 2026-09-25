export type ObjectStatus = 'HEALTHY' | 'REPAIR_REQUIRED' | 'DEGRADED' | 'CORRUPTED' | 'REPAIRING';

export type ReplicaStatus = 'HEALTHY' | 'CORRUPTED' | 'STALE' | 'OFFLINE' | 'SYNCING';

export interface ObjectReplica {
  nodeId: string;
  version: number;
  storedChecksum: string;
  status: ReplicaStatus;
  lastVerifiedAt: string;
  isCorrupted?: boolean;
}

export interface StoredObject {
  objectId: string;
  filename: string;
  size: number;
  mimeType: string;
  version: number;
  checksum: string; // Expected SHA-256
  replicationFactor: number;
  replicas: ObjectReplica[];
  uploadedAt: string;
  lastVerifiedAt: string | null;
  status: ObjectStatus;
  description?: string;
  dataPayload?: string; // Stored content (base64 or text) for realistic downloads & checksumming
  isDemo?: boolean;
}

export interface UploadOptions {
  file: File | { name: string; size: number; content: string; type: string };
  replicationFactor: number;
}
