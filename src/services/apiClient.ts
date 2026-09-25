import { StorageNode } from '../types/node';
import { StoredObject, UploadOptions } from '../types/object';
import { ActivityEvent } from '../types/activity';
import { ClusterStats, RepairTask, ClusterConfig } from '../types/cluster';
import { VerificationResult } from './integrityService';

export interface ClusterStatusResponse {
  backend: string;
  coordinatorConnected: boolean;
  clusterHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  totalStorageBytes: number;
  usedStorageBytes: number;
  totalObjects: number;
  healthyReplicasCount: number;
  totalExpectedReplicas: number;
  healthyNodesCount: number;
  totalNodesCount: number;
  pendingRepairsCount: number;
  autoRepairEnabled: boolean;
  nodes: StorageNode[];
}

export const apiClient = {
  async getClusterStatus(): Promise<ClusterStatusResponse> {
    const res = await fetch('/api/cluster/status');
    if (!res.ok) throw new Error('Failed to fetch cluster status');
    return res.json();
  },

  async getObjects(): Promise<StoredObject[]> {
    const res = await fetch('/api/objects');
    if (!res.ok) throw new Error('Failed to fetch objects');
    return res.json();
  },

  async getObject(objectId: string): Promise<StoredObject> {
    const res = await fetch(`/api/objects/${objectId}`);
    if (!res.ok) throw new Error('Failed to fetch object');
    return res.json();
  },

  async uploadObject(options: UploadOptions): Promise<StoredObject> {
    const formData = new FormData();
    if (options.file instanceof File) {
      formData.append('file', options.file);
    } else {
      const custom = options.file as { name: string; size: number; content: string; type: string };
      const blob = new Blob([custom.content], { type: custom.type });
      formData.append('file', blob, custom.name);
    }

    formData.append('replicationFactor', String(options.replicationFactor));

    const res = await fetch('/api/objects/upload', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }

    return res.json();
  },

  async downloadObject(objectId: string): Promise<{
    success: boolean;
    retrievedFromNodeId: string;
    wasFailover: boolean;
    offlineReplicaNode?: string;
    message: string;
  }> {
    const res = await fetch(`/api/objects/${objectId}/download`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Download failed' }));
      throw new Error(err.error || 'Failed to download object');
    }

    const retrievedFromNodeName = res.headers.get('X-Retrieved-From-Node') || 'Storage Node';
    const retrievedFromNodeId = res.headers.get('X-Retrieved-From-Node-Id') || 'node-1';
    const wasFailover = res.headers.get('X-Failover') === 'true';
    const offlineReplicaNode = res.headers.get('X-Offline-Replica-Node') || undefined;

    // Extract filename from disposition or fallback
    let filename = `vault_${objectId}.bin`;
    const disposition = res.headers.get('Content-Disposition');
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const message = wasFailover
      ? `${offlineReplicaNode || 'Primary node'} unavailable — retrieved from ${retrievedFromNodeName} (Failover)`
      : `Retrieved from ${retrievedFromNodeName}`;

    return {
      success: true,
      retrievedFromNodeId,
      wasFailover,
      offlineReplicaNode,
      message,
    };
  },

  async deleteObject(objectId: string): Promise<void> {
    const res = await fetch(`/api/objects/${objectId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete object');
  },

  async simulateNodeFailure(nodeId: string): Promise<void> {
    const res = await fetch(`/api/nodes/${nodeId}/fail`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to simulate failure');
  },

  async simulateNodePartition(nodeId: string): Promise<void> {
    const res = await fetch(`/api/nodes/${nodeId}/partition`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to simulate network partition');
  },

  async recoverNode(nodeId: string): Promise<void> {
    const res = await fetch(`/api/nodes/${nodeId}/recover`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to recover node');
  },

  async simulateCorruption(objectId: string, nodeId: string): Promise<void> {
    const res = await fetch(`/api/objects/${objectId}/nodes/${nodeId}/corrupt`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to simulate corruption');
  },

  async simulateStaleVersion(objectId: string, nodeId: string): Promise<void> {
    const res = await fetch(`/api/objects/${objectId}/nodes/${nodeId}/stale`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to simulate stale version');
  },

  async verifyIntegrity(objectId?: string): Promise<VerificationResult[]> {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectId }),
    });
    if (!res.ok) throw new Error('Failed to verify integrity');
    return res.json();
  },

  async repairObject(objectId: string): Promise<boolean> {
    const res = await fetch(`/api/repair/${objectId}`, { method: 'POST' });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.success;
  },

  async triggerAutonomousRepairs(): Promise<void> {
    const res = await fetch('/api/repair/all', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to trigger repairs');
  },

  async rebalanceCluster(): Promise<boolean> {
    const res = await fetch('/api/rebalance', { method: 'POST' });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.success;
  },

  async getActivities(): Promise<ActivityEvent[]> {
    const res = await fetch('/api/activities');
    if (!res.ok) return [];
    return res.json();
  },

  async getRepairs(): Promise<RepairTask[]> {
    const res = await fetch('/api/repairs');
    if (!res.ok) return [];
    return res.json();
  },

  async updateConfig(config: Partial<ClusterConfig>): Promise<void> {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  },

  async resetCluster(): Promise<void> {
    await fetch('/api/reset', { method: 'POST' });
  },
};
