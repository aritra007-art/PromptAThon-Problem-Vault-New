import React from 'react';
import { Server, HardDrive, ShieldAlert, RotateCw, Layers, Wifi, WifiOff } from 'lucide-react';
import { StorageNode } from '../types/node';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { GlowPanel, VAULT_GRADIENTS } from './GlowPanel';
import { formatBytes, formatTimeAgo } from '../services/cryptoService';

interface NodeCardProps {
  node: StorageNode;
  onSimulateFailure: (nodeId: string) => void;
  onRecover: (nodeId: string) => void;
  onViewObjects: (nodeId: string) => void;
  delay?: number;
}

export const NodeCard: React.FC<NodeCardProps> = ({
  node,
  onSimulateFailure,
  onRecover,
  onViewObjects,
  delay = 0,
}) => {
  const isHealthy = node.status === 'HEALTHY';
  const isOffline = node.status === 'OFFLINE';
  const isRecovering = node.status === 'RECOVERING';
  const isDegraded = node.status === 'DEGRADED';

  const usedPercentage = Math.round((node.usedBytes / node.capacityBytes) * 100);

  // Pick glowing gradient according to Vault Color System
  let cardGradient = VAULT_GRADIENTS.green;
  let cardGlowOpacity = 0.3;

  if (isOffline) {
    cardGradient = VAULT_GRADIENTS.red;
    cardGlowOpacity = 0.35;
  } else if (isRecovering) {
    cardGradient = VAULT_GRADIENTS.cyan;
    cardGlowOpacity = 0.35;
  } else if (isDegraded) {
    cardGradient = VAULT_GRADIENTS.amber;
    cardGlowOpacity = 0.32;
  }

  return (
    <GlowPanel
      gradient={cardGradient}
      glowOpacity={cardGlowOpacity}
      hoverGlowOpacity={cardGlowOpacity + 0.15}
      delay={delay}
      hover={true}
      borderRadius="20px"
      blur="35px"
      className="h-full"
    >
      <div className="p-4.5 flex flex-col justify-between h-full space-y-3">
        {/* Top row: Name, Endpoint, Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all duration-200 ${
                isHealthy
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                  : isOffline
                  ? 'bg-rose-950/40 border-rose-500/30 text-rose-400 shadow-[0_0_10px_rgba(239,68,68,0.25)]'
                  : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.25)]'
              }`}
            >
              <Server className="w-4.5 h-4.5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white font-mono tracking-tight">{node.name}</h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#18181B] text-slate-400 border border-white/10">
                  {node.id}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#9CA3AF] font-mono mt-0.5">
                <span>{node.endpoint}</span>
                <span>•</span>
                <span className="text-slate-500">{node.region}</span>
              </div>
            </div>
          </div>

          <StatusBadge status={node.status} size="sm" />
        </div>

        {/* Storage Disk Meter */}
        <div className="p-3 rounded-xl bg-[#0E0E10] border border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              Storage Allocation
            </span>
            <span className="font-mono text-slate-200">
              {formatBytes(node.usedBytes)} / {formatBytes(node.capacityBytes)}
            </span>
          </div>

          <ProgressBar
            value={usedPercentage}
            color={usedPercentage > 85 ? 'rose' : usedPercentage > 70 ? 'amber' : 'cyan'}
            size="sm"
          />

          <div className="flex items-center justify-between text-[11px] text-[#9CA3AF]">
            <span>Utilization: <span className="font-mono text-slate-200 font-medium">{usedPercentage}%</span></span>
            <span>Available: <span className="font-mono text-slate-300">{formatBytes(node.capacityBytes - node.usedBytes)}</span></span>
          </div>
        </div>

        {/* Metrics Grid: Objects, Heartbeat, Latency */}
        <div className="grid grid-cols-3 gap-2 py-2 border-t border-white/[0.06] text-xs font-mono">
          <div>
            <span className="text-[10px] uppercase text-slate-500 block">Objects</span>
            <div className="flex items-center gap-1 text-slate-200 font-semibold mt-0.5">
              <Layers className="w-3 h-3 text-cyan-400" />
              <span>{node.storedObjectIds.length}</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase text-slate-500 block">Heartbeat</span>
            <div className="flex items-center gap-1 mt-0.5">
              {isHealthy ? (
                <span className="text-emerald-400 text-xs font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {formatTimeAgo(node.lastHeartbeat)}
                </span>
              ) : (
                <span className="text-rose-400 text-xs font-medium">Lost</span>
              )}
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase text-slate-500 block">Latency</span>
            <div className="flex items-center gap-1 mt-0.5">
              {isHealthy ? (
                <>
                  <Wifi className="w-3 h-3 text-cyan-400" />
                  <span className="text-slate-200 text-xs font-medium">{node.latencyMs} ms</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-rose-400" />
                  <span className="text-rose-400 text-xs">Timeout</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Failure reason if offline */}
        {isOffline && node.failureReason && (
          <div className="p-2 rounded-lg bg-rose-950/30 border border-rose-500/30 text-[11px] text-rose-300 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            <span className="truncate">{node.failureReason}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
          <button
            onClick={() => onViewObjects(node.id)}
            className="text-xs text-slate-300 hover:text-cyan-300 hover:underline transition-colors font-medium cursor-pointer"
          >
            View {node.storedObjectIds.length} Hosted Objects →
          </button>

          <div className="flex items-center gap-2">
            {isHealthy ? (
              <button
                onClick={() => onSimulateFailure(node.id)}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[#181416] hover:bg-rose-950/50 text-rose-300 border border-white/[0.08] hover:border-rose-500/40 hover:shadow-[0_0_10px_rgba(239,68,68,0.25)] transition-all flex items-center gap-1 cursor-pointer"
              >
                <ShieldAlert className="w-3 h-3" />
                <span>Simulate Failure</span>
              </button>
            ) : (
              <button
                onClick={() => onRecover(node.id)}
                disabled={isRecovering}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[#141816] hover:bg-emerald-950/50 text-emerald-300 border border-white/[0.08] hover:border-emerald-500/40 hover:shadow-[0_0_10px_rgba(16,185,129,0.25)] transition-all flex items-center gap-1 cursor-pointer"
              >
                <RotateCw className={`w-3 h-3 ${isRecovering ? 'animate-spin' : ''}`} />
                <span>{isRecovering ? 'Recovering...' : 'Recover Node'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </GlowPanel>
  );
};
