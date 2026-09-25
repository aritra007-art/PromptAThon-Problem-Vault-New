import React from 'react';
import {
  HardDrive,
  Database,
  Layers,
  ShieldCheck,
  Server,
  Activity,
  Wrench,
  ArrowUpRight,
  ShieldAlert,
  GitFork,
  Upload,
} from 'lucide-react';
import { StorageNode } from '../types/node';
import { StoredObject } from '../types/object';
import { ActivityEvent } from '../types/activity';
import { ClusterStats, RepairTask } from '../types/cluster';
import { NodeCard } from '../components/NodeCard';
import { ActivityFeed } from '../components/ActivityFeed';
import { RepairQueueView } from '../components/RepairQueueView';
import { GlowPanel, VAULT_GRADIENTS } from '../components/GlowPanel';
import { formatBytes } from '../services/cryptoService';
import { ActiveTab } from '../components/Navigation';

interface DashboardProps {
  stats: ClusterStats;
  nodes: StorageNode[];
  objects: StoredObject[];
  activities: ActivityEvent[];
  repairQueue: RepairTask[];
  onSimulateNodeFailure: (nodeId: string) => void;
  onRecoverNode: (nodeId: string) => void;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenUpload: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  stats,
  nodes,
  objects,
  activities,
  repairQueue,
  onSimulateNodeFailure,
  onRecoverNode,
  onSelectTab,
  onOpenUpload,
}) => {
  const activeRepairTasks = repairQueue.filter(t => t.status !== 'COMPLETED');
  const usedStoragePercentage = Math.round(
    (stats.usedStorageBytes / stats.totalStorageBytes) * 100
  );

  const isHealthy = stats.clusterHealth === 'HEALTHY';
  const isDegraded = stats.clusterHealth === 'DEGRADED';
  const isCritical = stats.clusterHealth === 'CRITICAL';

  // System Health glow gradient based on actual application state
  const healthGradient = isHealthy
    ? VAULT_GRADIENTS.green
    : isDegraded
    ? VAULT_GRADIENTS.amber
    : VAULT_GRADIENTS.red;

  // Repair section glow: normal (cyan -> green), repair active (cyan -> purple), warning (amber)
  const repairGradient = activeRepairTasks.length > 0
    ? 'linear-gradient(137deg, #06B6D4 0%, #6366F1 50%, #A78BFA 100%)'
    : isDegraded || isCritical
    ? VAULT_GRADIENTS.amber
    : 'linear-gradient(137deg, #06B6D4 0%, #10B981 100%)';

  // Pick representative object for Quorum visualizer (e.g. first object or demo file)
  const spotlightObject = objects[0] || null;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  return (
    <div className="space-y-6">
      {/* 2. SYSTEM STATUS / HERO SECTION */}
      <GlowPanel
        gradient={VAULT_GRADIENTS.hero}
        glowOpacity={0.3}
        hoverGlowOpacity={0.42}
        blur="55px"
        borderRadius="24px"
        delay={0}
        hover={false}
        className="w-full"
      >
        <div className="p-6 sm:p-7 relative overflow-hidden">
          {/* Internal subtle decorative ambient pattern */}
          <div
            className="absolute top-0 right-0 w-96 h-96 pointer-events-none opacity-20"
            style={{
              background: 'radial-gradient(circle, #6366F1 0%, transparent 70%)',
              filter: 'blur(40px)',
            }}
          />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 font-semibold tracking-wider uppercase">
                  Quorum Consensus Cluster
                </span>

                {/* Status indicator with animated pulse matching health */}
                <div
                  className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold border transition-all"
                  style={{
                    backgroundColor: isHealthy
                      ? 'rgba(16, 185, 129, 0.12)'
                      : isDegraded
                      ? 'rgba(245, 158, 11, 0.12)'
                      : 'rgba(239, 68, 68, 0.15)',
                    borderColor: isHealthy
                      ? 'rgba(16, 185, 129, 0.4)'
                      : isDegraded
                      ? 'rgba(245, 158, 11, 0.4)'
                      : 'rgba(239, 68, 68, 0.5)',
                    boxShadow: isHealthy
                      ? '0 0 16px rgba(16, 185, 129, 0.3)'
                      : isDegraded
                      ? '0 0 16px rgba(245, 158, 11, 0.3)'
                      : '0 0 20px rgba(239, 68, 68, 0.4)',
                    color: isHealthy ? '#34d399' : isDegraded ? '#fbbf24' : '#f87171',
                  }}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isHealthy
                        ? 'bg-emerald-400 animate-pulse'
                        : isDegraded
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-rose-500 animate-ping'
                    }`}
                  />
                  <span>CLUSTER {stats.clusterHealth}</span>
                </div>
              </div>

              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-sans">
                  VAULT
                </h1>
                <p className="text-sm sm:text-base font-medium text-cyan-200/90 tracking-wide mt-0.5">
                  Distributed Object Storage
                </p>
              </div>

              <p className="text-xs sm:text-sm text-[#9CA3AF] max-w-2xl leading-relaxed">
                Autonomous fault-tolerant storage network with multi-node replica distribution, real-time SHA-256 integrity verification, and background quorum healing.
              </p>

              {/* Upload Object Action Button in Dashboard Hero */}
              <div className="pt-2 flex items-center gap-3">
                <div className="relative group">
                  <div
                    className="absolute -inset-0.5 rounded-xl pointer-events-none opacity-40 group-hover:opacity-85 transition-opacity duration-300"
                    style={{
                      background: 'linear-gradient(137deg, #06B6D4 0%, #6366F1 100%)',
                      filter: 'blur(10px)',
                    }}
                  />
                  <button
                    onClick={onOpenUpload}
                    className="relative px-4 py-2 text-xs font-semibold text-white bg-[#141416] hover:bg-[#18181D] rounded-xl border border-cyan-400/40 hover:border-cyan-400/75 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Upload Object</span>
                  </button>
                </div>

                <button
                  onClick={() => onSelectTab('objects')}
                  className="px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white bg-[#141416]/80 hover:bg-[#18181D] rounded-xl border border-white/[0.08] hover:border-cyan-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>View Objects ({objects.length})</span>
                </button>
              </div>
            </div>

            {/* Quick status summary cards inside Hero */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
              <div className="p-3 rounded-xl bg-[#0D0D10]/80 border border-white/[0.08] backdrop-blur-sm">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Nodes Active</span>
                <div className="text-lg font-bold font-mono text-white mt-0.5">
                  {stats.healthyNodesCount} / {stats.totalNodesCount}
                </div>
                <span className="text-[11px] text-emerald-400 font-mono">
                  {stats.healthyNodesCount === stats.totalNodesCount ? 'All Online' : 'Degraded Mesh'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#0D0D10]/80 border border-white/[0.08] backdrop-blur-sm">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Replica Quorum</span>
                <div className="text-lg font-bold font-mono text-white mt-0.5">
                  {stats.healthyReplicasCount}/{stats.totalExpectedReplicas}
                </div>
                <span className="text-[11px] text-cyan-400 font-mono">
                  {stats.healthyReplicasCount === stats.totalExpectedReplicas ? '100% Intact' : 'Healing Active'}
                </span>
              </div>

              <div className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-[#0D0D10]/80 border border-white/[0.08] backdrop-blur-sm flex flex-col justify-between">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Integrity Seal</span>
                <div className="text-lg font-bold font-mono text-emerald-400 flex items-center gap-1 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>SHA-256</span>
                </div>
                <span className="text-[11px] text-[#9CA3AF] font-mono">Deterministic</span>
              </div>
            </div>
          </div>
        </div>
      </GlowPanel>

      {/* 3. METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Storage Nodes (Cyan glow) */}
        <GlowPanel
          gradient={VAULT_GRADIENTS.cyan}
          glowOpacity={0.28}
          blur="35px"
          borderRadius="20px"
          delay={0.05}
        >
          <div className="p-4.5">
            <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
              <span className="font-semibold uppercase tracking-wider">Storage Nodes</span>
              <div className="p-2 rounded-xl bg-[#18181B] text-cyan-400 border border-white/[0.06]">
                <Server className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white tracking-tight">
                {stats.healthyNodesCount}
                <span className="text-sm font-normal text-slate-400 font-mono"> / {stats.totalNodesCount}</span>
              </span>
              <span className="text-xs text-emerald-400 font-mono font-medium">Online</span>
            </div>
            <p className="text-[11px] text-[#9CA3AF] mt-1.5">
              Capacity: <span className="font-mono text-slate-200">{formatBytes(stats.totalStorageBytes, 0)}</span> across cluster
            </p>
          </div>
        </GlowPanel>

        {/* Card 2: Used Storage (Blue/Cyan glow) */}
        <GlowPanel
          gradient="linear-gradient(137deg, #2563EB 0%, #06B6D4 100%)"
          glowOpacity={0.28}
          blur="35px"
          borderRadius="20px"
          delay={0.1}
        >
          <div className="p-4.5">
            <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
              <span className="font-semibold uppercase tracking-wider">Storage Used</span>
              <div className="p-2 rounded-xl bg-[#18181B] text-sky-400 border border-white/[0.06]">
                <HardDrive className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white tracking-tight">
                {formatBytes(stats.usedStorageBytes)}
              </span>
              <span className="text-xs font-mono text-cyan-400 font-semibold">
                {usedStoragePercentage}% Allocated
              </span>
            </div>
            <p className="text-[11px] text-[#9CA3AF] mt-1.5">
              Replicated blocks & consensus journal partitions
            </p>
          </div>
        </GlowPanel>

        {/* Card 3: Objects (Purple glow) */}
        <GlowPanel
          gradient={VAULT_GRADIENTS.purple}
          glowOpacity={0.28}
          blur="35px"
          borderRadius="20px"
          delay={0.15}
        >
          <div className="p-4.5">
            <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
              <span className="font-semibold uppercase tracking-wider">Objects</span>
              <div className="p-2 rounded-xl bg-[#18181B] text-violet-400 border border-white/[0.06]">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white tracking-tight">
                {stats.totalObjects}
              </span>
              <span className="text-xs text-violet-300 font-mono font-medium">Sealed</span>
            </div>
            <p className="text-[11px] text-[#9CA3AF] mt-1.5 flex items-center justify-between">
              <span>Cryptographic hash verification</span>
              <button
                onClick={onOpenUpload}
                className="text-cyan-400 hover:text-cyan-300 text-[11px] font-semibold cursor-pointer"
              >
                + Ingest
              </button>
            </p>
          </div>
        </GlowPanel>

        {/* Card 4: Healthy Replicas / System Health (State-dependent glow) */}
        <GlowPanel
          gradient={healthGradient}
          glowOpacity={0.3}
          blur="35px"
          borderRadius="20px"
          delay={0.2}
        >
          <div className="p-4.5">
            <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
              <span className="font-semibold uppercase tracking-wider">Healthy Replicas</span>
              <div className="p-2 rounded-xl bg-[#18181B] text-emerald-400 border border-white/[0.06]">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white tracking-tight">
                {stats.healthyReplicasCount}
                <span className="text-sm font-normal text-slate-400 font-mono"> / {stats.totalExpectedReplicas}</span>
              </span>
              <span
                className={`text-xs font-mono font-bold ${
                  stats.healthyReplicasCount === stats.totalExpectedReplicas
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {stats.healthyReplicasCount === stats.totalExpectedReplicas ? '100% Quorum' : 'Degraded'}
              </span>
            </div>
            <p className="text-[11px] text-[#9CA3AF] mt-1.5">
              Fault-tolerant copies across independent nodes
            </p>
          </div>
        </GlowPanel>
      </div>

      {/* 6. REPLICATION / QUORUM SECTION (Purple-Cyan Glow Visualizer) */}
      {spotlightObject && (
        <GlowPanel
          gradient={VAULT_GRADIENTS.replication}
          glowOpacity={0.25}
          hoverGlowOpacity={0.35}
          blur="45px"
          borderRadius="22px"
          delay={0.25}
        >
          <div className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#18181B] text-indigo-400 border border-white/[0.08]">
                  <GitFork className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                    Replication & Consensus Quorum Topology
                  </h2>
                  <p className="text-xs text-[#9CA3AF] font-mono">
                    Tri-way replication flow for active object: <span className="text-cyan-300 font-semibold">{spotlightObject.filename}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={onOpenUpload}
                  className="px-3 py-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/50 hover:bg-cyan-900/60 rounded-xl border border-cyan-500/40 hover:border-cyan-500/70 hover:shadow-[0_0_10px_rgba(6,182,212,0.25)] transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Upload Object</span>
                </button>

                <button
                  onClick={() => onSelectTab('objects')}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 cursor-pointer px-2.5 py-1.5 rounded-xl hover:bg-white/[0.04] transition-colors"
                >
                  <span>Inspect All ({objects.length})</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Visual Object -> Replica 1, Replica 2, Replica 3 Relationship with connecting lines */}
            <div className="p-4 rounded-xl bg-[#0D0D10]/90 border border-white/[0.06] space-y-4">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                {/* Source Object Box */}
                <div className="w-full md:w-auto p-3.5 rounded-xl bg-[#141418] border border-cyan-500/30 flex items-center gap-3 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
                  <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-mono text-cyan-400 block font-semibold">Primary Object Ingestion</span>
                    <span className="text-xs font-mono font-bold text-white block">{spotlightObject.filename}</span>
                    <span className="text-[10px] text-slate-400 font-mono">Factor {spotlightObject.replicationFactor} • {formatBytes(spotlightObject.size)}</span>
                  </div>
                </div>

                {/* Visual Branch Line Indicator */}
                <div className="hidden md:flex items-center text-slate-500 text-xs font-mono gap-1">
                  <span>── Quorum Distribution Stream ──▶</span>
                </div>

                {/* Replica Node Target Cards with green status indicators */}
                <div className="w-full md:w-auto flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {spotlightObject.replicas.map((replica, idx) => {
                    const node = nodeMap.get(replica.nodeId);
                    const isNodeOnline = node && node.status === 'HEALTHY';
                    const isCorrupt = replica.isCorrupted || replica.status === 'CORRUPTED';
                    const isReplicaHealthy = isNodeOnline && !isCorrupt && replica.status === 'HEALTHY';

                    return (
                      <div
                        key={replica.nodeId}
                        className={`p-3 rounded-xl border text-xs font-mono flex flex-col justify-between gap-1.5 transition-all ${
                          isReplicaHealthy
                            ? 'bg-[#0E1512] border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                            : 'bg-[#180E10] border-rose-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">Replica {idx + 1}</span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isReplicaHealthy
                                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                                : 'bg-rose-400 animate-pulse'
                            }`}
                          />
                        </div>
                        <div className="text-white font-semibold truncate">
                          {node ? node.name : replica.nodeId}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>v{replica.version}</span>
                          <span className={isReplicaHealthy ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {isReplicaHealthy ? 'HEALTHY' : isCorrupt ? 'CORRUPT' : 'OFFLINE'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </GlowPanel>
      )}

      {/* 4. STORAGE NODES SECTION */}
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              Storage Nodes Cluster
            </h2>
            <span className="text-xs font-mono text-[#9CA3AF]">
              ({stats.healthyNodesCount}/{stats.totalNodesCount} Healthy)
            </span>
          </div>

          <button
            onClick={() => onSelectTab('nodes')}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 cursor-pointer"
          >
            <span>Node Topology Details</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {nodes.map((node, idx) => (
            <NodeCard
              key={node.id}
              node={node}
              onSimulateFailure={onSimulateNodeFailure}
              onRecover={onRecoverNode}
              onViewObjects={() => onSelectTab('nodes')}
              delay={0.1 + idx * 0.05}
            />
          ))}
        </div>
      </div>

      {/* 7 & 9. TWO COLUMN LAYOUT: SELF-HEALING REPAIR QUEUE & LIVE ACTIVITY STREAM */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: 7. Self-Healing / Repair Queue */}
        <GlowPanel
          gradient={repairGradient}
          glowOpacity={0.28}
          blur="45px"
          borderRadius="22px"
          delay={0.3}
          hover={false}
          className="h-full"
        >
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Self-Healing & Repair Queue
                </h2>
              </div>
              {activeRepairTasks.length > 0 && (
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40 animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                  {activeRepairTasks.length} Active
                </span>
              )}
            </div>

            <p className="text-xs text-[#9CA3AF]">
              Autonomous background reconstruction streaming clean replica blocks to restore durability.
            </p>

            <RepairQueueView tasks={repairQueue.slice(0, 3)} nodes={nodes} />
          </div>
        </GlowPanel>

        {/* Right Column: 9. Activity Log */}
        <GlowPanel
          gradient="linear-gradient(137deg, rgba(6,182,212,0.35) 0%, rgba(99,102,241,0.35) 100%)"
          glowOpacity={0.25}
          blur="45px"
          borderRadius="22px"
          delay={0.35}
          hover={false}
          className="h-full"
        >
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Live Activity Stream
                </h2>
              </div>
              <button
                onClick={() => onSelectTab('activity')}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 cursor-pointer"
              >
                <span>Full Audit Trail</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-[#9CA3AF]">
              Real-time consensus events, node health transitions, and cryptographic verification logs.
            </p>

            <ActivityFeed activities={activities} maxItems={4} />
          </div>
        </GlowPanel>
      </div>
    </div>
  );
};
