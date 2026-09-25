import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/apiClient';
import { StorageNode } from '../types/node';
import { StoredObject, UploadOptions } from '../types/object';
import { ActivityEvent } from '../types/activity';
import { ClusterStats, RepairTask, ClusterConfig } from '../types/cluster';
import { VerificationResult } from '../services/integrityService';

export interface ToastNotice {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
}

export function useVaultCluster() {
  const [nodes, setNodes] = useState<StorageNode[]>([]);
  const [objects, setObjects] = useState<StoredObject[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [repairQueue, setRepairQueue] = useState<RepairTask[]>([]);
  const [config, setConfig] = useState<ClusterConfig>({
    defaultReplicationFactor: 3,
    heartbeatIntervalMs: 2500,
    autoRepairEnabled: true,
    backgroundScrubbingEnabled: true,
  });
  const [stats, setStats] = useState<ClusterStats>({
    totalStorageBytes: 400 * 1024 * 1024 * 1024,
    usedStorageBytes: 120 * 1024 * 1024 * 1024,
    totalObjects: 0,
    healthyReplicasCount: 0,
    totalExpectedReplicas: 0,
    healthyNodesCount: 4,
    totalNodesCount: 4,
    clusterHealth: 'HEALTHY',
    pendingRepairsCount: 0,
  });
  const [coordinatorConnected, setCoordinatorConnected] = useState<boolean>(true);
  const [backendType, setBackendType] = useState<string>('LOCAL DISTRIBUTED NODES');
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const isPollingRef = useRef(false);

  const addToast = useCallback((toast: Omit<ToastNotice, 'id'>) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    setToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const refreshClusterData = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    try {
      const [statusRes, objectsRes, activitiesRes, repairsRes] = await Promise.all([
        apiClient.getClusterStatus(),
        apiClient.getObjects(),
        apiClient.getActivities(),
        apiClient.getRepairs(),
      ]);

      setNodes(statusRes.nodes);
      setObjects(objectsRes);
      setActivities(activitiesRes);
      setRepairQueue(repairsRes);
      setCoordinatorConnected(true);
      setBackendType(statusRes.backend || 'LOCAL DISTRIBUTED NODES');

      setStats({
        totalStorageBytes: statusRes.totalStorageBytes,
        usedStorageBytes: statusRes.usedStorageBytes,
        totalObjects: statusRes.totalObjects,
        healthyReplicasCount: statusRes.healthyReplicasCount,
        totalExpectedReplicas: statusRes.totalExpectedReplicas,
        healthyNodesCount: statusRes.healthyNodesCount,
        totalNodesCount: statusRes.totalNodesCount,
        clusterHealth: statusRes.clusterHealth,
        pendingRepairsCount: statusRes.pendingRepairsCount,
      });

      setConfig(prev => ({
        ...prev,
        autoRepairEnabled: statusRes.autoRepairEnabled,
      }));
    } catch (err) {
      console.warn('[Coordinator Hook] Refresh error:', err);
      setCoordinatorConnected(false);
    } finally {
      isPollingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshClusterData();
    const interval = setInterval(refreshClusterData, 2500);
    return () => clearInterval(interval);
  }, [refreshClusterData]);

  const uploadObject = useCallback(
    async (options: UploadOptions) => {
      try {
        const res = await apiClient.uploadObject(options);
        await refreshClusterData();
        addToast({
          type: 'success',
          title: 'Real Object Ingested',
          message: `${res.filename} (${(res.size / 1024).toFixed(1)} KB) stored across ${
            res.replicas.length
          } distributed node filesystem(s).`,
        });
        return res;
      } catch (err: any) {
        addToast({
          type: 'error',
          title: 'Upload Failed',
          message: err.message || 'Failed to upload object',
        });
        throw err;
      }
    },
    [addToast, refreshClusterData]
  );

  const downloadObject = useCallback(
    async (objectId: string) => {
      try {
        const result = await apiClient.downloadObject(objectId);
        if (result.wasFailover) {
          addToast({
            type: 'warning',
            title: 'Failover Retrieval Active',
            message: result.message,
          });
        } else {
          addToast({
            type: 'success',
            title: 'File Retrieved',
            message: result.message,
          });
        }
        await refreshClusterData();
        return result;
      } catch (err: any) {
        addToast({
          type: 'error',
          title: 'Download Failed',
          message: err.message || 'File retrieval failed',
        });
        throw err;
      }
    },
    [addToast, refreshClusterData]
  );

  const simulateNodeFailure = useCallback(
    async (nodeId: string) => {
      try {
        await apiClient.simulateNodeFailure(nodeId);
        await refreshClusterData();
        const node = nodes.find(n => n.id === nodeId);
        addToast({
          type: 'error',
          title: 'Node Daemon Halted',
          message: `${node ? node.name : nodeId} marked OFFLINE. Replica counts dropped below quorum.`,
        });
      } catch (err: any) {
        addToast({ type: 'error', title: 'Action Failed', message: err.message });
      }
    },
    [nodes, addToast, refreshClusterData]
  );

  const simulateNodePartition = useCallback(
    async (nodeId: string) => {
      try {
        await apiClient.simulateNodePartition(nodeId);
        await refreshClusterData();
        const node = nodes.find(n => n.id === nodeId);
        addToast({
          type: 'warning',
          title: 'Network Partition Injected',
          message: `${node ? node.name : nodeId} isolated. Local data preserved but unreachable from Coordinator.`,
        });
      } catch (err: any) {
        addToast({ type: 'error', title: 'Partition Failed', message: err.message });
      }
    },
    [nodes, addToast, refreshClusterData]
  );

  const recoverNode = useCallback(
    async (nodeId: string) => {
      const node = nodes.find(n => n.id === nodeId);
      addToast({
        type: 'info',
        title: 'Recovering Node',
        message: `${node ? node.name : nodeId} starting socket reconnect & replica reconciliation...`,
      });
      try {
        await apiClient.recoverNode(nodeId);
        await refreshClusterData();
        addToast({
          type: 'success',
          title: 'Node Daemon Restored',
          message: `${node ? node.name : nodeId} returned to HEALTHY state.`,
        });
      } catch (err: any) {
        addToast({ type: 'error', title: 'Recovery Failed', message: err.message });
      }
    },
    [nodes, addToast, refreshClusterData]
  );

  const simulateCorruption = useCallback(
    async (objectId: string, nodeId: string) => {
      try {
        await apiClient.simulateCorruption(objectId, nodeId);
        await refreshClusterData();
        addToast({
          type: 'error',
          title: 'On-Disk Bitrot Injected',
          message: `Altered actual bytes stored on ${nodeId} disk. Checksum now mismatches metadata!`,
        });
      } catch (err: any) {
        addToast({ type: 'error', title: 'Corruption Simulation Failed', message: err.message });
      }
    },
    [addToast, refreshClusterData]
  );

  const simulateStaleVersion = useCallback(
    async (objectId: string, nodeId: string) => {
      try {
        await apiClient.simulateStaleVersion(objectId, nodeId);
        await refreshClusterData();
        addToast({
          type: 'warning',
          title: 'Version Inconsistency Injected',
          message: `Replica on ${nodeId} marked as older version.`,
        });
      } catch (err: any) {
        addToast({ type: 'error', title: 'Simulation Failed', message: err.message });
      }
    },
    [addToast, refreshClusterData]
  );

  const verifyIntegrity = useCallback(
    async (objectId?: string): Promise<VerificationResult[]> => {
      try {
        const results = await apiClient.verifyIntegrity(objectId);
        await refreshClusterData();
        const anyCorrupted = results.some(r => r.corruptedReplicas > 0);
        const anyStale = results.some(r => r.staleReplicas > 0);

        if (anyCorrupted) {
          addToast({
            type: 'error',
            title: 'On-Disk Integrity Mismatch',
            message: 'Calculated SHA-256 diverged from expected hash! Corrupted replica flagged for repair.',
          });
        } else if (anyStale) {
          addToast({
            type: 'warning',
            title: 'Inconsistency Detected',
            message: 'Replica version mismatch discovered!',
          });
        } else {
          addToast({
            type: 'success',
            title: 'Cryptographic Integrity Verified',
            message: `Scanned all physical replica files on disk. 100% match canonical SHA-256 hashes.`,
          });
        }
        return results;
      } catch (err: any) {
        addToast({ type: 'error', title: 'Verification Failed', message: err.message });
        return [];
      }
    },
    [addToast, refreshClusterData]
  );

  const repairObject = useCallback(
    async (objectId: string) => {
      try {
        const success = await apiClient.repairObject(objectId);
        await refreshClusterData();
        if (success) {
          addToast({
            type: 'success',
            title: 'Replica Repaired',
            message: 'Streamed clean bytes from healthy replica to target node.',
          });
        } else {
          addToast({
            type: 'warning',
            title: 'Repair Incomplete',
            message: 'Could not find healthy target node or source replica.',
          });
        }
        return success;
      } catch (err: any) {
        addToast({ type: 'error', title: 'Repair Error', message: err.message });
        return false;
      }
    },
    [addToast, refreshClusterData]
  );

  const triggerAutonomousRepairs = useCallback(async () => {
    try {
      await apiClient.triggerAutonomousRepairs();
      await refreshClusterData();
      addToast({
        type: 'info',
        title: 'Auto-Healing Quorum Run',
        message: 'Reconstructed missing or corrupted replicas across cluster.',
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Repair Failed', message: err.message });
    }
  }, [addToast, refreshClusterData]);

  const rebalanceCluster = useCallback(async () => {
    try {
      const ok = await apiClient.rebalanceCluster();
      await refreshClusterData();
      if (ok) {
        addToast({
          type: 'success',
          title: 'Physical Data Rebalanced',
          message: 'Transferred real object bytes from overloaded node to underutilized node.',
        });
      } else {
        addToast({
          type: 'info',
          title: 'Cluster Already Balanced',
          message: 'Storage load is already evenly distributed.',
        });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Rebalance Error', message: err.message });
    }
  }, [addToast, refreshClusterData]);

  const deleteObject = useCallback(
    async (objectId: string) => {
      try {
        await apiClient.deleteObject(objectId);
        await refreshClusterData();
        addToast({
          type: 'info',
          title: 'Object Purged',
          message: 'Deleted metadata and deleted physical files across all storage nodes.',
        });
      } catch (err: any) {
        addToast({ type: 'error', title: 'Delete Failed', message: err.message });
      }
    },
    [addToast, refreshClusterData]
  );

  const resetCluster = useCallback(async () => {
    try {
      await apiClient.resetCluster();
      await refreshClusterData();
      addToast({
        type: 'info',
        title: 'Cluster Reset',
        message: 'Reset SQLite database and reconnected 4 storage node daemons.',
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Reset Error', message: err.message });
    }
  }, [addToast, refreshClusterData]);

  const updateConfig = useCallback(
    async (newConfig: Partial<ClusterConfig>) => {
      try {
        await apiClient.updateConfig(newConfig);
        await refreshClusterData();
      } catch (err: any) {
        console.error(err);
      }
    },
    [refreshClusterData]
  );

  return {
    nodes,
    objects,
    activities,
    config,
    repairQueue,
    stats,
    coordinatorConnected,
    backendType,
    toasts,
    removeToast,
    uploadObject,
    downloadObject,
    simulateNodeFailure,
    simulateNodePartition,
    recoverNode,
    simulateCorruption,
    simulateStaleVersion,
    verifyIntegrity,
    repairObject,
    triggerAutonomousRepairs,
    rebalanceCluster,
    deleteObject,
    resetCluster,
    updateConfig,
  };
}
