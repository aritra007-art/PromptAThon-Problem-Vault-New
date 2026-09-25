import React from 'react';
import { Wrench, CheckCircle2, ArrowRight, Server, RefreshCw } from 'lucide-react';
import { RepairTask } from '../types/cluster';
import { StorageNode } from '../types/node';
import { ProgressBar } from './ProgressBar';

interface RepairQueueViewProps {
  tasks: RepairTask[];
  nodes: StorageNode[];
}

export const RepairQueueView: React.FC<RepairQueueViewProps> = ({ tasks, nodes }) => {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  if (tasks.length === 0) {
    return (
      <div className="p-5 rounded-2xl bg-[#0D0D0F] border border-white/[0.06] text-center text-xs text-[#9CA3AF]">
        <div className="flex items-center justify-center gap-2 text-emerald-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Replica Quorum Stable — No Active Repair Tasks</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          Cluster health monitors actively poll for under-replicated partitions or bitrot degradation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map(task => {
        const sourceNode = nodeMap.get(task.sourceNodeId);
        const targetNode = nodeMap.get(task.targetNodeId);
        const isComplete = task.status === 'COMPLETED';

        return (
          <div
            key={task.id}
            className={`p-3.5 rounded-2xl border transition-all duration-200 ${
              isComplete
                ? 'bg-[#0E1512] border-emerald-500/30 text-slate-300 shadow-[0_0_12px_rgba(16,185,129,0.12)]'
                : 'bg-[#0E1318] border-cyan-500/40 text-cyan-100 shadow-[0_0_15px_rgba(6,182,212,0.18)]'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                {isComplete ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                )}
                <span className="font-mono font-semibold text-white">
                  {isComplete ? 'Restored:' : 'Reconstructing:'} {task.filename}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#18181B] text-cyan-300 border border-white/10">
                  {task.reason.replace('_', ' ')}
                </span>
              </div>

              <span className={`font-mono text-xs font-bold ${isComplete ? 'text-emerald-400' : 'text-cyan-400'}`}>
                {task.progress}%
              </span>
            </div>

            {/* Source to Target Nodes Flow */}
            <div className="flex items-center gap-2 text-xs font-mono text-[#9CA3AF] my-2 bg-[#0B0B0D] p-2 rounded-xl border border-white/[0.06]">
              <div className="flex items-center gap-1.5 text-slate-200">
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                <span>Source: {sourceNode ? sourceNode.name : task.sourceNodeId}</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <div className="flex items-center gap-1.5 text-slate-200">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <span>Target: {targetNode ? targetNode.name : task.targetNodeId}</span>
              </div>
            </div>

            {/* Progress Bar (Exact backend value) */}
            <ProgressBar
              value={task.progress}
              color={isComplete ? 'emerald' : 'cyan'}
              size="sm"
            />
          </div>
        );
      })}
    </div>
  );
};
