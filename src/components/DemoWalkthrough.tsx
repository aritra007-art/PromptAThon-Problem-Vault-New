import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Play,
  RotateCcw,
  ArrowRight,
  Pause,
  ChevronRight,
} from 'lucide-react';
import { StorageNode } from '../types/node';
import { StoredObject } from '../types/object';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { GlowPanel, VAULT_GRADIENTS } from './GlowPanel';

interface DemoWalkthroughProps {
  nodes: StorageNode[];
  objects: StoredObject[];
  onUpload: (opts: any) => Promise<any>;
  onSimulateNodeFailure: (nodeId: string) => void;
  onRecoverNode: (nodeId: string) => Promise<void>;
  onSimulateCorruption: (objectId: string, nodeId: string) => void;
  onVerifyIntegrity: (objectId?: string) => Promise<any>;
  onRepairObject: (objectId: string) => Promise<boolean>;
  onSelectTab: (tab: any) => void;
}

export const DemoWalkthrough: React.FC<DemoWalkthroughProps> = ({
  nodes,
  objects,
  onUpload,
  onSimulateNodeFailure,
  onRecoverNode,
  onSimulateCorruption,
  onVerifyIntegrity,
  onRepairObject,
  onSelectTab,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [demoObjectId, setDemoObjectId] = useState<string | null>(null);
  const [failedNodeId, setFailedNodeId] = useState<string>('node-2');
  const [corruptedNodeId, setCorruptedNodeId] = useState<string>('node-4');

  // Find demo file if present
  const demoObject = objects.find(
    o => (demoObjectId && o.objectId === demoObjectId) || o.filename === 'demo-file.pdf'
  );

  const steps = [
    {
      step: 1,
      title: '1. Ingest “demo-file.pdf” with Replication Factor = 3',
      description: 'Upload target demo payload and instruct Vault to partition across 3 independent storage nodes.',
      expected: 'Replicas placed on 3 distinct nodes with initial SHA-256 hash calculated.',
    },
    {
      step: 2,
      title: '2. Verify Tri-Way Replica Consensus',
      description: 'Confirm that 3 separate nodes host independent copies of demo-file.pdf.',
      expected: 'Replica Quorum: 3/3 Healthy.',
    },
    {
      step: 3,
      title: '3. Simulate Storage Node Failure',
      description: `Inject hardware / network failure on ${failedNodeId}. Mark node OFFLINE and sever heartbeat.`,
      expected: 'Node stops serving traffic. Object drops to 2/3 replicas (REPAIR REQUIRED).',
    },
    {
      step: 4,
      title: '4. Autonomous Fault Detection',
      description: 'Cluster health monitor identifies lost replica and schedules emergency reconstruction.',
      expected: 'Object status flags: REPAIR REQUIRED. Available healthy source located.',
    },
    {
      step: 5,
      title: '5. Automatic Replica Repair & Failover',
      description: 'Reconstruct replica from surviving source node onto an available healthy node.',
      expected: 'Data payload streamed and verified. Object restored to 3/3 healthy replicas.',
    },
    {
      step: 6,
      title: '6. Simulate Silent Data Corruption (Bitrot)',
      description: `Flip bits on replica residing on ${corruptedNodeId}. Diverge stored checksum from canonical hash.`,
      expected: 'Replica corrupted without changing expected metadata checksum.',
    },
    {
      step: 7,
      title: '7. Run Integrity Scrubber (SHA-256 Verification)',
      description: 'Cryptographically scan all replicas and compare computed hashes against the canonical hash.',
      expected: 'Integrity mismatch detected on corrupted node.',
    },
    {
      step: 8,
      title: '8. Automated Self-Healing of Corrupted Replica',
      description: 'Fetch clean block from healthy replica and overwrite the corrupted replica in-place.',
      expected: 'Corrupted replica repaired. 100% quorum integrity restored.',
    },
    {
      step: 9,
      title: '9. Restore Failed Storage Node',
      description: `Recover ${failedNodeId}. Re-establish heartbeat and reconcile cluster topology.`,
      expected: 'All 4 storage nodes healthy and synchronized.',
    },
  ];

  // Execute current step
  const executeStep = async (stepNum: number) => {
    setIsBusy(true);
    try {
      if (stepNum === 1 || stepNum === 2) {
        // Upload demo-file.pdf
        const res = await onUpload({
          file: {
            name: 'demo-file.pdf',
            size: 482912,
            type: 'application/pdf',
            content: 'VAULT_DISTRIBUTED_OBJECT_STORAGE_OFFICIAL_TEST_SPECIFICATION_DEMO_PDF',
          },
          replicationFactor: 3,
        });
        setDemoObjectId(res.objectId);
        if (res.replicas && res.replicas.length > 0) {
          setFailedNodeId(res.replicas[0].nodeId);
        }
        setCurrentStep(2);
      } else if (stepNum === 3 || stepNum === 4) {
        // Simulate failure of one replica node
        const targetNode = demoObject?.replicas[0]?.nodeId || 'node-2';
        setFailedNodeId(targetNode);
        onSimulateNodeFailure(targetNode);
        setCurrentStep(4);
      } else if (stepNum === 5) {
        // Auto repair
        if (demoObject) {
          await onRepairObject(demoObject.objectId);
        }
        setCurrentStep(6);
      } else if (stepNum === 6) {
        // Simulate corruption
        if (demoObject) {
          const healthyReplica = demoObject.replicas.find(r => r.nodeId !== failedNodeId);
          const targetCorrupt = healthyReplica ? healthyReplica.nodeId : 'node-4';
          setCorruptedNodeId(targetCorrupt);
          onSimulateCorruption(demoObject.objectId, targetCorrupt);
        }
        setCurrentStep(7);
      } else if (stepNum === 7) {
        // Run integrity verification
        if (demoObject) {
          await onVerifyIntegrity(demoObject.objectId);
        }
        setCurrentStep(8);
      } else if (stepNum === 8) {
        // Auto heal corrupted replica
        if (demoObject) {
          await onRepairObject(demoObject.objectId);
        }
        setCurrentStep(9);
      } else if (stepNum === 9) {
        // Recover failed node
        await onRecoverNode(failedNodeId);
        setCurrentStep(9);
      }
    } catch (err) {
      console.error('Demo error:', err);
    } finally {
      setIsBusy(false);
    }
  };

  // Auto-play loop
  useEffect(() => {
    let timer: number;
    if (isAutoPlaying && !isBusy) {
      if (currentStep < 9) {
        timer = window.setTimeout(() => {
          executeStep(currentStep + 1);
        }, 1800);
      } else {
        setIsAutoPlaying(false);
      }
    }
    return () => clearTimeout(timer);
  }, [isAutoPlaying, currentStep, isBusy]);

  const activeStepMeta = steps.find(s => s.step === currentStep) || steps[0];

  return (
    <div className="space-y-6">
      {/* Hero Banner with GlowPanel */}
      <GlowPanel
        gradient={VAULT_GRADIENTS.hero}
        glowOpacity={0.3}
        blur="50px"
        borderRadius="24px"
        hover={false}
      >
        <div className="p-6 sm:p-7">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 text-xs font-semibold mb-3 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Interactive Hackathon Demo Scenario</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Fault-Tolerance & Autonomous Self-Healing in Action
            </h2>
            <p className="text-xs sm:text-sm text-[#9CA3AF] mt-2 leading-relaxed">
              Follow the complete end-to-end journey of a distributed file: ingestion, tri-way replica placement, surviving catastrophic node failure, automated background reconstruction, bitrot corruption detection via SHA-256, and instant quorum healing.
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-5">
              <button
                onClick={() => executeStep(currentStep)}
                disabled={isBusy}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#141417] hover:bg-[#18181D] border border-cyan-400/50 hover:border-cyan-400/80 text-white shadow-[0_0_15px_rgba(6,182,212,0.25)] transition-all flex items-center gap-2 cursor-pointer font-mono disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4 text-cyan-400" />
                <span>{isBusy ? 'Processing...' : `Execute Step ${currentStep}`}</span>
              </button>

              <button
                onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                disabled={isBusy}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-2 cursor-pointer ${
                  isAutoPlaying
                    ? 'bg-amber-950/70 border-amber-500/60 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                    : 'bg-[#141416] hover:bg-[#18181B] text-slate-200 border-white/[0.08]'
                }`}
              >
                {isAutoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-cyan-400" />}
                <span>{isAutoPlaying ? 'Pause Scenario' : 'Auto-Play Full Scenario'}</span>
              </button>

              <button
                onClick={() => {
                  setCurrentStep(1);
                  setIsAutoPlaying(false);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#9CA3AF] hover:text-white hover:bg-white/[0.05] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart Tour</span>
              </button>
            </div>
          </div>
        </div>
      </GlowPanel>

      {/* Stepper Progress Bar */}
      <GlowPanel
        gradient={VAULT_GRADIENTS.subtle}
        glowOpacity={0.15}
        blur="30px"
        borderRadius="20px"
        hover={false}
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-[#9CA3AF] mb-2 font-mono">
            <span>Scenario Progress</span>
            <span className="text-cyan-400 font-bold">Step {currentStep} of {steps.length}</span>
          </div>
          <ProgressBar
            value={(currentStep / steps.length) * 100}
            color="cyan"
            size="md"
          />

          <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5 mt-3">
            {steps.map(s => {
              const isCompleted = s.step < currentStep;
              const isCurrent = s.step === currentStep;
              return (
                <button
                  key={s.step}
                  onClick={() => setCurrentStep(s.step)}
                  className={`py-1.5 px-2 rounded-xl text-center text-[10px] font-mono transition-all border cursor-pointer ${
                    isCurrent
                      ? 'bg-cyan-950 text-cyan-300 font-bold border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                      : isCompleted
                      ? 'bg-[#0E1512] text-emerald-400 border-emerald-500/30'
                      : 'bg-[#0E0E11] text-slate-500 border-white/[0.06]'
                  }`}
                >
                  Step {s.step}
                </button>
              );
            })}
          </div>
        </div>
      </GlowPanel>

      {/* Current Step Spotlight Card & Live Subject */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlowPanel
          gradient={VAULT_GRADIENTS.cyan}
          glowOpacity={0.25}
          blur="40px"
          borderRadius="22px"
          hover={false}
          className="lg:col-span-2"
        >
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider font-semibold">
                  Current Operation
                </span>
                <h3 className="text-base font-bold text-white mt-0.5 font-sans">
                  {activeStepMeta.title}
                </h3>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-[#18181B] text-cyan-300 border border-white/10">
                Step {currentStep} / {steps.length}
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              {activeStepMeta.description}
            </p>

            <div className="p-3.5 rounded-xl bg-[#0D0D10] border border-white/[0.06] text-xs">
              <span className="text-[#9CA3AF] font-semibold uppercase text-[10px] tracking-wider block mb-1">
                Expected Cluster Outcome
              </span>
              <p className="text-emerald-400 font-mono font-medium">
                ✓ {activeStepMeta.expected}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => executeStep(currentStep)}
                disabled={isBusy}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#141417] hover:bg-[#18181D] text-white border border-cyan-400/50 hover:border-cyan-400/80 shadow-[0_0_12px_rgba(6,182,212,0.25)] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{isBusy ? 'Applying Distributed State...' : 'Trigger Step Action'}</span>
                <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
              </button>

              {currentStep < steps.length && (
                <button
                  onClick={() => setCurrentStep(prev => Math.min(steps.length, prev + 1))}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#9CA3AF] hover:text-white bg-[#141416] hover:bg-[#18181B] border border-white/[0.08] transition-colors cursor-pointer"
                >
                  Skip to Next →
                </button>
              )}
            </div>
          </div>
        </GlowPanel>

        {/* Live Subject: demo-file.pdf Status */}
        <GlowPanel
          gradient={VAULT_GRADIENTS.purple}
          glowOpacity={0.25}
          blur="40px"
          borderRadius="22px"
          hover={false}
        >
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
                Target Object State
              </h4>
              {demoObject ? (
                <StatusBadge status={demoObject.status} size="sm" />
              ) : (
                <span className="text-[11px] font-mono text-slate-500">Not Ingested Yet</span>
              )}
            </div>

            {demoObject ? (
              <div className="space-y-3 font-mono text-xs">
                <div className="p-2.5 rounded-xl bg-[#0D0D10] border border-white/[0.06]">
                  <span className="text-[10px] text-slate-500 uppercase block">Filename</span>
                  <span className="text-white font-semibold">{demoObject.filename}</span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#0D0D10] border border-white/[0.06]">
                  <span className="text-[10px] text-slate-500 uppercase block">Replica Quorum</span>
                  <span className="text-cyan-400 font-bold">
                    {demoObject.replicas.filter(r => {
                      const node = nodes.find(n => n.id === r.nodeId);
                      return node?.status === 'HEALTHY' && r.status === 'HEALTHY' && !r.isCorrupted;
                    }).length} / {demoObject.replicationFactor} Healthy
                  </span>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] text-[#9CA3AF] uppercase block">Replicas by Node</span>
                  {demoObject.replicas.map(r => {
                    const node = nodes.find(n => n.id === r.nodeId);
                    const isNodeHealthy = node?.status === 'HEALTHY';
                    const isCorrupt = r.status === 'CORRUPTED' || r.isCorrupted;

                    return (
                      <div
                        key={r.nodeId}
                        className="p-2.5 rounded-xl bg-[#0D0D10] border border-white/[0.06] flex items-center justify-between text-[11px]"
                      >
                        <span className="text-slate-300">{node?.name || r.nodeId}</span>
                        <span
                          className={
                            !isNodeHealthy
                              ? 'text-rose-400 font-bold'
                              : isCorrupt
                              ? 'text-rose-400 font-bold'
                              : 'text-emerald-400 font-bold'
                          }
                        >
                          {!isNodeHealthy ? 'OFFLINE' : isCorrupt ? 'CORRUPTED' : 'HEALTHY'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-white/[0.08] rounded-xl">
                Click “Execute Step 1” to ingest demo-file.pdf into the cluster.
              </div>
            )}
          </div>
        </GlowPanel>
      </div>
    </div>
  );
};
