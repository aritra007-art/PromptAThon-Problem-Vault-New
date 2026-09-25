import React, { useState } from 'react';
import {
  Server,
  Database,
  ArrowRight,
  RotateCw,
  Sliders,
  Scale,
} from 'lucide-react';
import { StorageNode } from '../types/node';
import { StoredObject } from '../types/object';
import { NodeCard } from '../components/NodeCard';
import { ProgressBar } from '../components/ProgressBar';
import { GlowPanel, VAULT_GRADIENTS } from '../components/GlowPanel';
import { formatBytes } from '../services/cryptoService';

interface NodesPageProps {
  nodes: StorageNode[];
  objects: StoredObject[];
  onSimulateNodeFailure: (nodeId: string) => void;
  onRecoverNode: (nodeId: string) => void;
  onInspectObject: (object: StoredObject) => void;
}

export const NodesPage: React.FC<NodesPageProps> = ({
  nodes,
  objects,
  onSimulateNodeFailure,
  onRecoverNode,
  onInspectObject,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
  const hostedObjects = selectedNode
    ? objects.filter(obj => obj.replicas.some(r => r.nodeId === selectedNode.id))
    : [];

  const healthyNodes = nodes.filter(n => n.status === 'HEALTHY');
  const totalCapacity = nodes.reduce((acc, n) => acc + n.capacityBytes, 0);
  const totalUsed = nodes.reduce((acc, n) => acc + n.usedBytes, 0);
  const avgUtilization = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;

  // Find most utilized and least utilized node for rebalancing insights
  const sortedNodes = [...nodes].sort((a, b) => {
    const aPct = a.usedBytes / a.capacityBytes;
    const bPct = b.usedBytes / b.capacityBytes;
    return bPct - aPct;
  });
  const maxNode = sortedNodes[0];
  const minNode = sortedNodes[sortedNodes.length - 1];
  const isImbalanced = sortedNodes.length > 1 &&
    Math.round((maxNode.usedBytes / maxNode.capacityBytes) * 100) -
    Math.round((minNode.usedBytes / minNode.capacityBytes) * 100) > 15;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white font-sans flex items-center gap-2.5">
            <span>Storage Nodes Topology</span>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-[#18181B] text-cyan-300 border border-white/10">
              {healthyNodes.length}/{nodes.length} Nodes Active
            </span>
          </h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            Independent storage daemons handling replication streams, disk I/O, and consensus heartbeats
          </p>
        </div>
      </div>

      {/* 10. REBALANCING SECTION (Amber/Cyan Gradient) */}
      <GlowPanel
        gradient={VAULT_GRADIENTS.rebalancing}
        glowOpacity={0.25}
        hoverGlowOpacity={0.35}
        blur="45px"
        borderRadius="22px"
        hover={false}
      >
        <div className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#18181B] text-amber-400 border border-white/[0.08]">
                <Scale className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold uppercase tracking-wider text-xs text-slate-200">
                  Cluster Utilization & Rebalancing
                </span>
                <p className="text-xs text-[#9CA3AF] font-mono">
                  Target utilization: <span className="text-cyan-300 font-bold">{avgUtilization}%</span> • Cluster balance: {isImbalanced ? <span className="text-amber-400 font-semibold">Skew Detected</span> : <span className="text-emerald-400 font-semibold">Balanced</span>}
                </p>
              </div>
            </div>

            {/* Rebalance Status Pill */}
            <div className="flex items-center gap-2 text-xs font-mono px-3 py-1 rounded-full bg-[#141418] border border-white/[0.08]">
              <span className={`w-2 h-2 rounded-full ${isImbalanced ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="text-slate-300">
                {isImbalanced ? 'Rebalance Recommended' : 'Optimal Distribution'}
              </span>
            </div>
          </div>

          {/* Rebalancing Source & Target Insight if imbalanced or normal */}
          <div className="p-3.5 rounded-xl bg-[#0D0D10]/90 border border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2 text-[#9CA3AF]">
              <span className="text-[10px] uppercase text-slate-500">Source:</span>
              <span className="text-white font-semibold">{maxNode?.name}</span>
              <span className="text-amber-400">({Math.round((maxNode?.usedBytes / maxNode?.capacityBytes) * 100)}% Used)</span>
            </div>

            <div className="flex items-center gap-2 text-cyan-400">
              <ArrowRight className="w-4 h-4 text-slate-500" />
              <span className="text-[11px] text-[#9CA3AF]">Rebalance Pipeline</span>
              <ArrowRight className="w-4 h-4 text-slate-500" />
            </div>

            <div className="flex items-center gap-2 text-[#9CA3AF]">
              <span className="text-[10px] uppercase text-slate-500">Target:</span>
              <span className="text-white font-semibold">{minNode?.name}</span>
              <span className="text-emerald-400">({Math.round((minNode?.usedBytes / minNode?.capacityBytes) * 100)}% Used)</span>
            </div>
          </div>

          {/* Grid of Nodes Storage Allocation */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {nodes.map(node => {
              const usagePct = Math.round((node.usedBytes / node.capacityBytes) * 100);
              const isOnline = node.status === 'HEALTHY';

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id === selectedNodeId ? null : node.id)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                    selectedNodeId === node.id
                      ? 'bg-cyan-950/40 border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                      : 'bg-[#0E0E11] border-white/[0.06] hover:border-white/[0.15]'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono mb-1.5">
                    <span className="font-semibold text-slate-200">{node.name}</span>
                    <span className={isOnline ? 'text-cyan-400 font-bold' : 'text-rose-400 font-bold'}>
                      {usagePct}%
                    </span>
                  </div>

                  <ProgressBar
                    value={usagePct}
                    color={!isOnline ? 'rose' : usagePct > 80 ? 'amber' : 'cyan'}
                    size="sm"
                  />

                  <div className="flex justify-between text-[10px] text-[#9CA3AF] mt-1.5 font-mono">
                    <span>{formatBytes(node.usedBytes)} used</span>
                    <span>{node.storedObjectIds.length} objs</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </GlowPanel>

      {/* 4. STORAGE NODES INFRASTRUCTURE CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {nodes.map((node, idx) => (
          <NodeCard
            key={node.id}
            node={node}
            onSimulateFailure={onSimulateNodeFailure}
            onRecover={onRecoverNode}
            onViewObjects={nodeId => setSelectedNodeId(nodeId)}
            delay={idx * 0.05}
          />
        ))}
      </div>

      {/* Hosted Objects Drawer / Deep Dive inside GlowPanel */}
      {selectedNode && (
        <GlowPanel
          gradient={VAULT_GRADIENTS.purple}
          glowOpacity={0.25}
          blur="40px"
          borderRadius="22px"
          hover={false}
        >
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white font-mono">
                  Objects Hosted on {selectedNode.name} ({hostedObjects.length})
                </h3>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-[#18181B] border border-white/10 cursor-pointer"
              >
                Close Drawer ✕
              </button>
            </div>

            {hostedObjects.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">No replicas currently residing on this node.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {hostedObjects.map(obj => {
                  const replica = obj.replicas.find(r => r.nodeId === selectedNode.id);
                  return (
                    <div
                      key={obj.objectId}
                      onClick={() => onInspectObject(obj)}
                      className="p-3.5 rounded-xl bg-[#0D0D10] border border-white/[0.08] hover:border-cyan-500/40 cursor-pointer transition-all text-xs space-y-1.5 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-white truncate max-w-[180px]">
                          {obj.filename}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#18181B] text-cyan-300 border border-white/10">
                          v{replica?.version || obj.version}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#9CA3AF] font-mono">
                        <span>{formatBytes(obj.size)}</span>
                        <span
                          className={
                            replica?.status === 'CORRUPTED'
                              ? 'text-rose-400 font-bold'
                              : replica?.status === 'STALE'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }
                        >
                          {replica?.status || 'HEALTHY'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </GlowPanel>
      )}
    </div>
  );
};
