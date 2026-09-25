import React, { useState } from 'react';
import {
  X,
  Download,
  ShieldCheck,
  Wrench,
  Copy,
  Check,
  Server,
  FileCheck2,
  AlertTriangle,
  History,
  Trash2,
} from 'lucide-react';
import { StoredObject } from '../types/object';
import { StorageNode } from '../types/node';
import { StatusBadge } from './StatusBadge';
import { GlowPanel, VAULT_GRADIENTS } from './GlowPanel';
import { formatBytes, formatTimeAgo } from '../services/cryptoService';
import { VerificationResult } from '../services/integrityService';

interface ObjectDetailsModalProps {
  object: StoredObject | null;
  nodes: StorageNode[];
  onClose: () => void;
  onDownload: (objectId: string) => void;
  onVerify: (objectId: string) => Promise<VerificationResult[]>;
  onRepair: (objectId: string) => Promise<boolean>;
  onCorrupt: (objectId: string, nodeId: string) => void;
  onStale: (objectId: string, nodeId: string) => void;
  onDelete: (objectId: string) => void;
}

export const ObjectDetailsModal: React.FC<ObjectDetailsModalProps> = ({
  object,
  nodes,
  onClose,
  onDownload,
  onVerify,
  onRepair,
  onCorrupt,
  onStale,
  onDelete,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isRepairing, setIsRepairing] = useState<boolean>(false);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);

  if (!object) return null;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const handleCopyChecksum = () => {
    navigator.clipboard.writeText(object.checksum);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setVerificationFeedback(null);
    try {
      const results = await onVerify(object.objectId);
      const res = results[0];
      if (res) {
        if (res.corruptedReplicas > 0) {
          setVerificationFeedback(`❌ Checksum mismatch detected on ${res.corruptedReplicas} replica(s)!`);
        } else if (res.staleReplicas > 0) {
          setVerificationFeedback(`⚠ Stale version detected on ${res.staleReplicas} replica(s)!`);
        } else {
          setVerificationFeedback(`✓ All ${res.healthyReplicas} active replicas successfully verified against SHA-256 hash.`);
        }
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRepair = async () => {
    setIsRepairing(true);
    try {
      await onRepair(object.objectId);
    } finally {
      setIsRepairing(false);
    }
  };

  const healthyReplicaCount = object.replicas.filter(r => {
    const node = nodeMap.get(r.nodeId);
    return node && node.status === 'HEALTHY' && r.status === 'HEALTHY' && !r.isCorrupted;
  }).length;

  const corruptedCount = object.replicas.filter(r => r.isCorrupted || r.status === 'CORRUPTED').length;

  // 8. Integrity Section Glow:
  // When verification succeeds: green/cyan glow
  // When corruption detected: red glow
  // When verification running: cyan/purple glow
  let integrityGradient = 'linear-gradient(137deg, #10B981 0%, #06B6D4 100%)';
  let integrityGlowOpacity = 0.25;

  if (isVerifying) {
    integrityGradient = VAULT_GRADIENTS.purple;
    integrityGlowOpacity = 0.35;
  } else if (corruptedCount > 0 || (verificationFeedback && verificationFeedback.startsWith('❌'))) {
    integrityGradient = VAULT_GRADIENTS.red;
    integrityGlowOpacity = 0.35;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0A0B]/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-[#111113] border border-white/[0.08] rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] p-6 text-white max-h-[90vh] overflow-y-auto">
        {/* Glow ambient background behind modal */}
        <div
          className="absolute -top-10 -right-10 w-60 h-60 rounded-full pointer-events-none opacity-20"
          style={{
            background: 'radial-gradient(circle, #06B6D4 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />

        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/[0.08] relative z-10">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-bold text-white font-mono truncate max-w-md">
                {object.filename}
              </h2>
              <StatusBadge status={object.status} size="sm" />
            </div>
            <p className="text-xs text-[#9CA3AF] mt-1 flex items-center gap-2 flex-wrap font-mono">
              <span>ID: <span className="text-slate-300">{object.objectId}</span></span>
              <span>•</span>
              <span>Version: <span className="text-cyan-400 font-semibold">v{object.version}</span></span>
              <span>•</span>
              <span>Quorum: <span className="text-slate-200 font-medium">{healthyReplicaCount}/{object.replicationFactor}</span></span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metadata Key-Value Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4 relative z-10">
          <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/[0.06]">
            <span className="text-[11px] uppercase font-semibold text-[#9CA3AF]">File Size</span>
            <p className="text-sm font-bold text-white font-mono mt-0.5">{formatBytes(object.size)}</p>
          </div>

          <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/[0.06]">
            <span className="text-[11px] uppercase font-semibold text-[#9CA3AF]">Replication</span>
            <p className="text-sm font-bold text-cyan-400 font-mono mt-0.5">{object.replicationFactor} Replicas</p>
          </div>

          <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/[0.06]">
            <span className="text-[11px] uppercase font-semibold text-[#9CA3AF]">Uploaded At</span>
            <p className="text-xs text-slate-300 mt-0.5">{formatTimeAgo(object.uploadedAt)}</p>
          </div>

          <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/[0.06]">
            <span className="text-[11px] uppercase font-semibold text-[#9CA3AF]">Last Verified</span>
            <p className="text-xs text-slate-300 mt-0.5">
              {object.lastVerifiedAt ? formatTimeAgo(object.lastVerifiedAt) : 'Never'}
            </p>
          </div>
        </div>

        {/* 8. INTEGRITY / SHA-256 VERIFICATION SECTION with Dynamic Glow */}
        <GlowPanel
          gradient={integrityGradient}
          glowOpacity={integrityGlowOpacity}
          blur="35px"
          borderRadius="18px"
          hover={false}
          className="mb-5"
        >
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  SHA-256 Cryptographic Integrity Seal
                </span>
              </div>
              <button
                onClick={handleCopyChecksum}
                className="px-2 py-1 text-xs text-slate-300 hover:text-white bg-[#18181B] hover:bg-[#222228] border border-white/10 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer font-mono"
                title="Copy SHA-256 Checksum"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Hash</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-2.5 rounded-xl bg-[#0B0B0D] border border-white/[0.06]">
              <span className="text-[10px] uppercase font-mono text-[#9CA3AF] block font-semibold">Canonical SHA-256 Hash</span>
              <p className="font-mono text-xs text-cyan-300 truncate mt-0.5 select-all font-medium">
                {object.checksum}
              </p>
            </div>

            {/* Verification Stats Bar */}
            <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1">
              <div className="p-2 rounded-lg bg-[#0B0B0D]/80 border border-white/[0.04]">
                <span className="text-[10px] text-slate-500 block uppercase">Verified Replicas</span>
                <span className="text-emerald-400 font-bold">{healthyReplicaCount} Active</span>
              </div>
              <div className="p-2 rounded-lg bg-[#0B0B0D]/80 border border-white/[0.04]">
                <span className="text-[10px] text-slate-500 block uppercase">Corrupted Replicas</span>
                <span className={corruptedCount > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                  {corruptedCount} Found
                </span>
              </div>
              <div className="p-2 rounded-lg bg-[#0B0B0D]/80 border border-white/[0.04]">
                <span className="text-[10px] text-slate-500 block uppercase">Scrubber Status</span>
                <span className="text-cyan-400 font-medium">
                  {isVerifying ? 'Scanning...' : 'Idle'}
                </span>
              </div>
            </div>
          </div>
        </GlowPanel>

        {/* Verification Result Feedback if present */}
        {verificationFeedback && (
          <div
            className={`p-3 rounded-xl mb-4 text-xs font-medium border font-mono ${
              verificationFeedback.startsWith('❌')
                ? 'bg-rose-950/40 text-rose-300 border-rose-500/40 shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                : verificationFeedback.startsWith('⚠')
                ? 'bg-amber-950/40 text-amber-300 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
            }`}
          >
            {verificationFeedback}
          </div>
        )}

        {/* Replica Distribution Table */}
        <div className="space-y-2 relative z-10">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              Distributed Storage Nodes & Replica Quorum
            </h3>
            <span className="text-[11px] text-[#9CA3AF] font-mono">
              Target: {object.replicationFactor} nodes
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0D0D10]/80">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#141418] text-[#9CA3AF] uppercase text-[10px] tracking-wider border-b border-white/[0.06] font-mono">
                <tr>
                  <th className="py-2.5 px-3">Storage Node</th>
                  <th className="py-2.5 px-3">Node Status</th>
                  <th className="py-2.5 px-3">Version</th>
                  <th className="py-2.5 px-3">Stored Checksum</th>
                  <th className="py-2.5 px-3 text-center">Integrity</th>
                  <th className="py-2.5 px-3 text-right">Fault Simulation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] font-mono">
                {object.replicas.map(replica => {
                  const node = nodeMap.get(replica.nodeId);
                  const nodeName = node ? node.name : replica.nodeId;
                  const isNodeOnline = node && node.status === 'HEALTHY';
                  const isCorrupted = replica.status === 'CORRUPTED' || replica.isCorrupted;
                  const isStale = replica.version < object.version || replica.status === 'STALE';

                  return (
                    <tr key={replica.nodeId} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-200">
                        {nodeName}
                      </td>

                      <td className="py-2.5 px-3">
                        {isNodeOnline ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-rose-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Offline
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] ${isStale ? 'bg-amber-950/60 text-amber-300 border border-amber-500/30' : 'text-slate-300'}`}>
                          v{replica.version}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-[11px] max-w-[140px] truncate text-[#9CA3AF]" title={replica.storedChecksum}>
                        {isNodeOnline ? (
                          <span className={isCorrupted ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                            {replica.storedChecksum.slice(0, 10)}...{replica.storedChecksum.slice(-6)}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">--- Unreachable ---</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        {!isNodeOnline ? (
                          <span className="text-slate-500 font-bold">—</span>
                        ) : isCorrupted ? (
                          <span className="text-rose-400 font-bold flex items-center justify-center gap-1 text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            MISMATCH
                          </span>
                        ) : isStale ? (
                          <span className="text-amber-400 font-bold flex items-center justify-center gap-1 text-[11px]">
                            <History className="w-3.5 h-3.5" />
                            STALE
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-bold flex items-center justify-center gap-1 text-[11px]">
                            <FileCheck2 className="w-3.5 h-3.5" />
                            MATCHED
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        {isNodeOnline && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onCorrupt(object.objectId, replica.nodeId)}
                              className="px-2 py-0.5 text-[10px] rounded-lg bg-[#181214] hover:bg-rose-950/60 text-rose-300 border border-white/[0.08] hover:border-rose-500/40 transition-all cursor-pointer"
                              title="Flip bytes to simulate data corruption"
                            >
                              Corrupt
                            </button>
                            <button
                              onClick={() => onStale(object.objectId, replica.nodeId)}
                              className="px-2 py-0.5 text-[10px] rounded-lg bg-[#181512] hover:bg-amber-950/60 text-amber-300 border border-white/[0.08] hover:border-amber-500/40 transition-all cursor-pointer"
                              title="Simulate outdated version"
                            >
                              Make Stale
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Buttons Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-5 mt-5 border-t border-white/[0.08] relative z-10">
          <button
            onClick={() => {
              if (confirm(`Delete ${object.filename} from Vault?`)) {
                onDelete(object.objectId);
                onClose();
              }
            }}
            className="px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-xl transition-all flex items-center gap-1.5 border border-transparent hover:border-rose-500/30 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Object</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleVerify}
              disabled={isVerifying}
              className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#161619] hover:bg-[#1C1C20] rounded-xl transition-all flex items-center gap-1.5 border border-white/[0.08] hover:border-cyan-500/40 cursor-pointer"
            >
              <ShieldCheck className={`w-3.5 h-3.5 text-cyan-400 ${isVerifying ? 'animate-spin' : ''}`} />
              <span>{isVerifying ? 'Verifying Hashes...' : 'Verify Integrity'}</span>
            </button>

            <button
              onClick={handleRepair}
              disabled={isRepairing || healthyReplicaCount === 0}
              className="px-3.5 py-2 text-xs font-semibold text-cyan-200 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/40 hover:shadow-[0_0_10px_rgba(6,182,212,0.25)] rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Wrench className={`w-3.5 h-3.5 text-cyan-400 ${isRepairing ? 'animate-spin' : ''}`} />
              <span>{isRepairing ? 'Repairing Quorum...' : 'Repair Replicas'}</span>
            </button>

            <button
              onClick={() => onDownload(object.objectId)}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#141416] hover:bg-[#18181D] border border-cyan-400/40 hover:border-cyan-400/70 hover:shadow-[0_0_12px_rgba(6,182,212,0.3)] rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Download File</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
