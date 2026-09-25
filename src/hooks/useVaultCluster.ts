import { useState, useEffect, useCallback } from 'react';
import { coordinator } from '../services/clusterCoordinator';
import { fetchBackendStatus, BackendModeInfo } from '../services/backendService';
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
  const [nodes, setNodes] = useState<StorageNode[]>(coordinator.getNodes());
  const [objects, setObjects] = useState<StoredObject[]>(coordinator.getObjects());
  const [activities, setActivities] = useState<ActivityEvent[]>(coordinator.getActivities());
  const [config, setConfig] = useState<ClusterConfig>(coordinator.getConfig());
  const [repairQueue, setRepairQueue] = useState<RepairTask[]>(coordinator.getRepairQueue());
  const [stats, setStats] = useState<ClusterStats>(coordinator.getStats());
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [backendMode, setBackendMode] = useState<BackendModeInfo>({
    databaseMode: 'sqlite',
    storageMode: 'local',
    databaseProvider: 'SQLite Embedded / Local File',
    storageProvider: 'Local Filesystem (4 Nodes)',
    isCloudMode: false,
  });

  useEffect(() => {
    fetchBackendStatus().then(mode => setBackendMode(mode));
  }, []);

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

  useEffect(() => {
    const unsubscribe = coordinator.subscribe(() => {
      setNodes(coordinator.getNodes());
      setObjects(coordinator.getObjects());
      setActivities(coordinator.getActivities());
      setConfig(coordinator.getConfig());
      setRepairQueue(coordinator.getRepairQueue());
      setStats(coordinator.getStats());
    });
    return unsubscribe;
  }, []);

  const uploadObject = useCallback(async (options: UploadOptions) => {
    try {
      const res = await coordinator.uploadObject(options);
      addToast({
        type: 'success',
        title: 'Upload Successful',
        message: `${res.filename} stored & replicated across ${res.replicas.length} nodes.`,
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
  }, [addToast]);

  const downloadObject = useCallback((objectId: string) => {
    try {
      const result = coordinator.downloadObject(objectId);
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
      return result;
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Download Failed',
        message: err.message || 'File retrieval failed',
      });
      throw err;
    }
  }, [addToast]);

  const simulateNodeFailure = useCallback((nodeId: string) => {
    coordinator.simulateNodeFailure(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    addToast({
      type: 'error',
      title: 'Node Offline',
      message: `${node ? node.name : nodeId} simulated failure. Unhealthy replicas flagged.`,
    });
  }, [nodes, addToast]);

  const recoverNode = useCallback(async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    addToast({
      type: 'info',
      title: 'Recovering Node',
      message: `${node ? node.name : nodeId} starting recovery & reconciliation...`,
    });
    await coordinator.recoverNode(nodeId);
    addToast({
      type: 'success',
      title: 'Node Restored',
      message: `${node ? node.name : nodeId} returned to HEALTHY state.`,
    });
  }, [nodes, addToast]);

  const simulateCorruption = useCallback((objectId: string, nodeId: string) => {
    coordinator.simulateCorruption(objectId, nodeId);
    addToast({
      type: 'error',
      title: 'Corruption Injected',
      message: `Bitrot simulated on ${nodeId}. Checksum mismatch created.`,
    });
  }, [addToast]);

  const simulateStaleVersion = useCallback((objectId: string, nodeId: string) => {
    coordinator.simulateStaleVersion(objectId, nodeId);
    addToast({
      type: 'warning',
      title: 'Inconsistency Injected',
      message: `Replica on ${nodeId} downgraded to older version.`,
    });
  }, [addToast]);

  const verifyIntegrity = useCallback(async (objectId?: string): Promise<VerificationResult[]> => {
    const res = await coordinator.verifyIntegrity(objectId);
    const anyCorrupted = res.some(r => r.corruptedReplicas > 0);
    const anyStale = res.some(r => r.staleReplicas > 0);

    if (anyCorrupted) {
      addToast({
        type: 'error',
        title: 'Integrity Check Failed',
        message: 'Corrupted replica(s) detected via SHA-256 mismatch!',
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
        title: 'Integrity Verified',
        message: `Verified replicas against canonical SHA-256 hashes. All intact.`,
      });
    }
    return res;
  }, [addToast]);

  const repairObject = useCallback(async (objectId: string) => {
    const success = await coordinator.repairObject(objectId);
    if (!success) {
      addToast({
        type: 'warning',
        title: 'Repair Incomplete',
        message: 'Could not find healthy target node or source replica.',
      });
    }
    return success;
  }, [addToast]);

  const triggerAutonomousRepairs = useCallback(async () => {
    await coordinator.triggerAutonomousRepairs();
    addToast({
      type: 'info',
      title: 'Auto-Healing Run',
      message: 'Scanned cluster for degraded replicas and scheduled repairs.',
    });
  }, [addToast]);

  const rebalanceCluster = useCallback(async () => {
    const ok = await coordinator.rebalanceCluster();
    if (ok) {
      addToast({
        type: 'success',
        title: 'Rebalance Successful',
        message: 'Shifted objects from high-utilization nodes to underutilized nodes.',
      });
    } else {
      addToast({
        type: 'info',
        title: 'Rebalance Not Needed',
        message: 'Cluster storage is already evenly distributed.',
      });
    }
  }, [addToast]);

  const deleteObject = useCallback((objectId: string) => {
    coordinator.deleteObject(objectId);
    addToast({
      type: 'info',
      title: 'Object Deleted',
      message: 'Purged object and freed replica storage across nodes.',
    });
  }, [addToast]);

  const resetCluster = useCallback(() => {
    coordinator.resetCluster();
    addToast({
      type: 'info',
      title: 'Cluster Reset',
      message: 'Reset back to standard 4-node initial topology.',
    });
  }, [addToast]);

  const updateConfig = useCallback((newConfig: Partial<ClusterConfig>) => {
    coordinator.updateConfig(newConfig);
  }, []);

  return {
    nodes,
    objects,
    activities,
    config,
    repairQueue,
    stats,
    toasts,
    removeToast,
    uploadObject,
    downloadObject,
    simulateNodeFailure,
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
    backendMode,
  };
}
