import React, { useState } from 'react';
import {
  Upload,
  Search,
  Eye,
  Download,
  ShieldCheck,
  HardDrive,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { StoredObject } from '../types/object';
import { StorageNode } from '../types/node';
import { StatusBadge } from '../components/StatusBadge';
import { GlowPanel, VAULT_GRADIENTS } from '../components/GlowPanel';
import { formatBytes, formatTimeAgo } from '../services/cryptoService';

interface ObjectsPageProps {
  objects: StoredObject[];
  nodes: StorageNode[];
  onOpenUpload: () => void;
  onInspectObject: (object: StoredObject) => void;
  onDownload: (objectId: string) => void;
  onVerify: (objectId: string) => void;
}

export const ObjectsPage: React.FC<ObjectsPageProps> = ({
  objects,
  nodes,
  onOpenUpload,
  onInspectObject,
  onDownload,
  onVerify,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const filteredObjects = objects.filter(obj => {
    const matchesSearch =
      obj.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      obj.objectId.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'HEALTHY') return obj.status === 'HEALTHY';
    if (statusFilter === 'DEGRADED') return obj.status === 'REPAIR_REQUIRED' || obj.status === 'DEGRADED';
    if (statusFilter === 'CORRUPTED') return obj.status === 'CORRUPTED';
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white font-sans flex items-center gap-2.5">
            <span>Stored Objects</span>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-[#18181B] text-cyan-300 border border-white/10">
              {objects.length} total
            </span>
          </h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            Distributed files with replica distribution across independent storage nodes
          </p>
        </div>

        {/* Upload Object Button with subtle glow */}
        <div className="relative group self-start sm:self-auto">
          <div
            className="absolute -inset-0.5 rounded-xl pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity duration-300"
            style={{
              background: 'linear-gradient(137deg, #06B6D4 0%, #6366F1 100%)',
              filter: 'blur(10px)',
            }}
          />
          <button
            onClick={onOpenUpload}
            className="relative px-4 py-2 text-xs font-semibold text-white bg-[#141416] hover:bg-[#18181C] rounded-xl border border-cyan-400/40 hover:border-cyan-400/70 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>Upload Object</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <GlowPanel
        gradient={VAULT_GRADIENTS.subtle}
        glowOpacity={0.15}
        blur="30px"
        borderRadius="18px"
        hover={false}
      >
        <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by filename or object ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#0B0B0D] border border-white/[0.08] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="text-slate-500 font-medium text-[11px] uppercase mr-1">Status:</span>
            {['ALL', 'HEALTHY', 'DEGRADED', 'CORRUPTED'].map(filter => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  statusFilter === filter
                    ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                    : 'bg-[#141416] text-[#9CA3AF] hover:text-white border border-white/[0.08]'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </GlowPanel>

      {/* Objects Table inside a GlowPanel */}
      <GlowPanel
        gradient={VAULT_GRADIENTS.purple}
        glowOpacity={0.2}
        blur="45px"
        borderRadius="22px"
        hover={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0E0E11] text-[#9CA3AF] uppercase text-[10px] tracking-wider border-b border-white/[0.06] font-mono">
              <tr>
                <th className="py-3.5 px-4">Name / ID</th>
                <th className="py-3.5 px-3">Size</th>
                <th className="py-3.5 px-3">Version</th>
                <th className="py-3.5 px-3">Replication</th>
                <th className="py-3.5 px-3">Replica Nodes</th>
                <th className="py-3.5 px-3">Health Status</th>
                <th className="py-3.5 px-3">Last Verified</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/[0.04] font-sans">
              {filteredObjects.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500 text-xs">
                    No objects matched your search criteria.
                  </td>
                </tr>
              ) : (
                filteredObjects.map(obj => {
                  const healthyReplicas = obj.replicas.filter(r => {
                    const node = nodeMap.get(r.nodeId);
                    return node && node.status === 'HEALTHY' && r.status === 'HEALTHY' && !r.isCorrupted;
                  }).length;

                  const isCorrupted = obj.status === 'CORRUPTED';
                  const isDegraded = obj.status === 'REPAIR_REQUIRED' || obj.status === 'DEGRADED';
                  const isFullyHealthy = obj.status === 'HEALTHY' && healthyReplicas >= obj.replicationFactor;

                  // Row glow accent on hover
                  const rowGlowClass = isCorrupted
                    ? 'hover:bg-rose-950/20'
                    : isDegraded
                    ? 'hover:bg-amber-950/20'
                    : 'hover:bg-white/[0.03]';

                  return (
                    <tr
                      key={obj.objectId}
                      onClick={() => onInspectObject(obj)}
                      className={`transition-colors cursor-pointer group ${rowGlowClass}`}
                    >
                      {/* Name & ID */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-xl bg-[#141416] border transition-colors ${
                              isCorrupted
                                ? 'border-rose-500/40 text-rose-400'
                                : isDegraded
                                ? 'border-amber-500/40 text-amber-400'
                                : 'border-white/[0.08] text-cyan-400 group-hover:border-cyan-500/40'
                            }`}
                          >
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-semibold text-white block group-hover:text-cyan-300 transition-colors font-mono">
                              {obj.filename}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 block truncate max-w-[140px]">
                              {obj.objectId}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Size */}
                      <td className="py-3.5 px-3 font-mono text-slate-300">
                        {formatBytes(obj.size)}
                      </td>

                      {/* Version */}
                      <td className="py-3.5 px-3">
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-[#18181B] text-cyan-300 border border-white/10">
                          v{obj.version}
                        </span>
                      </td>

                      {/* Replication Factor */}
                      <td className="py-3.5 px-3 font-mono">
                        <span
                          className={`font-semibold ${
                            healthyReplicas >= obj.replicationFactor
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {healthyReplicas}/{obj.replicationFactor}
                        </span>
                      </td>

                      {/* Replica Nodes Chips */}
                      <td className="py-3.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {obj.replicas.map(r => {
                            const node = nodeMap.get(r.nodeId);
                            const isOnline = node && node.status === 'HEALTHY';
                            const isNodeCorrupted = r.status === 'CORRUPTED' || r.isCorrupted;
                            const isStale = r.status === 'STALE';

                            let badgeColor = 'bg-[#18181B] text-slate-300 border-white/10';
                            if (!isOnline) {
                              badgeColor = 'bg-rose-950/60 text-rose-400 border-rose-500/30';
                            } else if (isNodeCorrupted) {
                              badgeColor = 'bg-rose-950/70 text-rose-300 border-rose-500/40 shadow-[0_0_6px_rgba(239,68,68,0.3)]';
                            } else if (isStale) {
                              badgeColor = 'bg-amber-950/60 text-amber-300 border-amber-500/30';
                            } else {
                              badgeColor = 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30';
                            }

                            return (
                              <span
                                key={r.nodeId}
                                className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${badgeColor}`}
                                title={`${node ? node.name : r.nodeId} - ${r.status}`}
                              >
                                {node ? node.id.replace('node-', 'N') : r.nodeId}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Health Status */}
                      <td className="py-3.5 px-3">
                        <StatusBadge status={obj.status} size="sm" />
                      </td>

                      {/* Last Verified */}
                      <td className="py-3.5 px-3 text-[#9CA3AF] font-mono text-[11px]">
                        {obj.lastVerifiedAt ? formatTimeAgo(obj.lastVerifiedAt) : 'Never'}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => onInspectObject(obj)}
                            className="p-1.5 text-slate-400 hover:text-white bg-[#141416] hover:bg-[#1C1C20] border border-white/[0.08] hover:border-cyan-500/40 rounded-lg transition-all"
                            title="View Object Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onDownload(obj.objectId)}
                            className="p-1.5 text-cyan-400 hover:text-cyan-200 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/40 hover:shadow-[0_0_8px_rgba(6,182,212,0.3)] rounded-lg transition-all"
                            title="Download from Healthy Replica"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlowPanel>
    </div>
  );
};
