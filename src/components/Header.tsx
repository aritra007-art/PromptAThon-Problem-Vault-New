import React from 'react';
import { Database, ShieldAlert, Cpu, CheckCircle2, RotateCcw, Play, Activity, SlidersHorizontal, Sparkles } from 'lucide-react';
import { ClusterStats } from '../types/cluster';

interface HeaderProps {
  stats: ClusterStats;
  autoRepair: boolean;
  onToggleAutoRepair: (enabled: boolean) => void;
  onSimulateNodeFailure: () => void;
  onSimulateCorruption: () => void;
  onVerifyAll: () => void;
  onRepairAll: () => void;
  onRebalance: () => void;
  onReset: () => void;
  onOpenDemoTour: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  autoRepair,
  onToggleAutoRepair,
  onSimulateNodeFailure,
  onSimulateCorruption,
  onVerifyAll,
  onRepairAll,
  onRebalance,
  onReset,
  onOpenDemoTour,
}) => {
  const isHealthy = stats.clusterHealth === 'HEALTHY';
  const isDegraded = stats.clusterHealth === 'DEGRADED';
  const isCritical = stats.clusterHealth === 'CRITICAL';

  return (
    <header
      className="sticky top-0 z-30 transition-colors"
      style={{
        background: 'rgba(10, 10, 11, 0.75)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3.5">
            {/* Visual Anchor Logo with subtle cyan/purple ambient glow */}
            <div className="relative group">
              <div
                className="absolute -inset-1.5 rounded-2xl pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity duration-300"
                style={{
                  background: 'linear-gradient(137deg, #06B6D4 0%, #6366F1 50%, #A78BFA 100%)',
                  filter: 'blur(12px)',
                }}
              />
              <div
                className="relative w-10 h-10 rounded-xl p-0.5 flex items-center justify-center transition-transform duration-200 group-hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(137deg, rgba(6, 182, 212, 0.7), rgba(99, 102, 241, 0.7))',
                }}
              >
                <div className="w-full h-full bg-[#111113] rounded-[10px] flex items-center justify-center border border-white/10">
                  <Database className="w-5 h-5 text-cyan-400" />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-white font-sans">
                  Aritra's Vault
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#161619] text-cyan-300 border border-cyan-500/20 font-medium">
                  v1.2-distributed
                </span>
                
                {/* Cluster Health Status Indicator with soft pulse glow */}
                <div
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all duration-300"
                  style={{
                    backgroundColor: isHealthy
                      ? 'rgba(16, 185, 129, 0.12)'
                      : isDegraded
                      ? 'rgba(245, 158, 11, 0.12)'
                      : 'rgba(239, 68, 68, 0.15)',
                    borderColor: isHealthy
                      ? 'rgba(16, 185, 129, 0.35)'
                      : isDegraded
                      ? 'rgba(245, 158, 11, 0.35)'
                      : 'rgba(239, 68, 68, 0.4)',
                    boxShadow: isHealthy
                      ? '0 0 12px rgba(16, 185, 129, 0.2)'
                      : isDegraded
                      ? '0 0 12px rgba(245, 158, 11, 0.2)'
                      : '0 0 16px rgba(239, 68, 68, 0.3)',
                    color: isHealthy ? '#34d399' : isDegraded ? '#fbbf24' : '#f87171',
                  }}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isHealthy
                        ? 'bg-emerald-400 animate-pulse'
                        : isDegraded
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-rose-500 animate-ping'
                    }`}
                  />
                  <span className="font-mono tracking-wide">{stats.clusterHealth}</span>
                </div>
              </div>
              <p className="text-xs text-[#9CA3AF] font-normal">
                Fault-Tolerant Distributed Object Storage & Consensus Engine
              </p>
            </div>
          </div>

          {/* Right Actions: Auto-repair toggle, Demo Scenario trigger, and Reset */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Auto-healing toggle */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs bg-[#121214] border-white/[0.08] shadow-sm hover:border-cyan-500/30 transition-colors"
            >
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-300 font-medium">Autonomous Self-Healing</span>
              <button
                type="button"
                onClick={() => onToggleAutoRepair(!autoRepair)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoRepair ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-slate-800'
                }`}
                title="When enabled, cluster repairs under-replicated or corrupted replicas automatically"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoRepair ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Guided Demo Scenario Button */}
            <div className="relative group">
              <div
                className="absolute -inset-0.5 rounded-xl pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity duration-300"
                style={{
                  background: 'linear-gradient(137deg, #06B6D4 0%, #6366F1 50%, #A78BFA 100%)',
                  filter: 'blur(10px)',
                }}
              />
              <button
                onClick={onOpenDemoTour}
                className="relative inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#121214] hover:bg-[#161619] text-white transition-all border border-cyan-400/40 hover:border-cyan-400/70"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
                <span className="bg-gradient-to-r from-cyan-300 via-sky-200 to-indigo-200 bg-clip-text text-transparent">
                  13-Step Demo Scenario
                </span>
              </button>
            </div>

            {/* Reset button */}
            <button
              onClick={onReset}
              title="Reset cluster to pristine default state"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-[#161619] transition-all border border-transparent hover:border-white/10"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Demo Controls Toolbar with subtle gradient borders & hover glow */}
        <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-slate-300">Demo Controls:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Simulate Failure: Dangerous (Red hover glow) */}
            <button
              onClick={onSimulateNodeFailure}
              className="group relative px-2.5 py-1 text-xs font-medium rounded-lg bg-[#141416] hover:bg-rose-950/40 text-rose-300 border border-white/[0.08] hover:border-rose-500/50 hover:shadow-[0_0_12px_rgba(239,68,68,0.25)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert className="w-3 h-3 text-rose-400" />
              <span>Simulate Node Failure</span>
            </button>

            {/* Simulate Corruption: Warning (Amber hover glow) */}
            <button
              onClick={onSimulateCorruption}
              className="group relative px-2.5 py-1 text-xs font-medium rounded-lg bg-[#141416] hover:bg-amber-950/40 text-amber-300 border border-white/[0.08] hover:border-amber-500/50 hover:shadow-[0_0_12px_rgba(245,158,11,0.25)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Activity className="w-3 h-3 text-amber-400" />
              <span>Simulate Corruption</span>
            </button>

            {/* Verify All: Integrity (Emerald/cyan hover glow) */}
            <button
              onClick={onVerifyAll}
              className="group relative px-2.5 py-1 text-xs font-medium rounded-lg bg-[#141416] hover:bg-emerald-950/40 text-emerald-300 border border-white/[0.08] hover:border-emerald-500/50 hover:shadow-[0_0_12px_rgba(16,185,129,0.25)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Verify All</span>
            </button>

            {/* Repair All: Healing (Cyan hover glow) */}
            <button
              onClick={onRepairAll}
              className="group relative px-2.5 py-1 text-xs font-medium rounded-lg bg-[#141416] hover:bg-cyan-950/40 text-cyan-300 border border-white/[0.08] hover:border-cyan-500/50 hover:shadow-[0_0_12px_rgba(6,182,212,0.25)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3 h-3 text-cyan-400" />
              <span>Repair All</span>
            </button>

            {/* Rebalance Cluster: Balancing (Indigo/Amber hover glow) */}
            <button
              onClick={onRebalance}
              className="group relative px-2.5 py-1 text-xs font-medium rounded-lg bg-[#141416] hover:bg-indigo-950/40 text-indigo-300 border border-white/[0.08] hover:border-indigo-500/50 hover:shadow-[0_0_12px_rgba(99,102,241,0.25)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Database className="w-3 h-3 text-indigo-400" />
              <span>Rebalance Cluster</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
