export type EventType =
  | 'NODE_ONLINE'
  | 'NODE_FAILURE'
  | 'NODE_RECOVERY'
  | 'OBJECT_UPLOADED'
  | 'OBJECT_DOWNLOADED'
  | 'OBJECT_DELETED'
  | 'REPLICATION_COMPLETED'
  | 'REPAIR_STARTED'
  | 'REPAIR_PROGRESS'
  | 'REPAIR_COMPLETED'
  | 'INTEGRITY_CHECK'
  | 'INTEGRITY_MISMATCH'
  | 'CORRUPTION_SIMULATED'
  | 'INCONSISTENCY_DETECTED'
  | 'VERSION_SYNCED'
  | 'REBALANCE_TRIGGERED'
  | 'SYSTEM_ALERT';

export interface ActivityEvent {
  id: string;
  timestamp: string;
  type: EventType;
  title: string;
  description: string;
  nodeId?: string;
  objectId?: string;
  filename?: string;
  severity: 'info' | 'warning' | 'error' | 'success';
}
