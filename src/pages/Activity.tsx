import React, { useState } from 'react';
import { Download, Search } from 'lucide-react';
import { ActivityEvent } from '../types/activity';
import { ActivityFeed } from '../components/ActivityFeed';
import { GlowPanel, VAULT_GRADIENTS } from '../components/GlowPanel';

interface ActivityPageProps {
  activities: ActivityEvent[];
}

export const ActivityPage: React.FC<ActivityPageProps> = ({ activities }) => {
  const [search, setSearch] = useState<string>('');

  const filtered = activities.filter(
    a =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase()) ||
      a.type.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(activities, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `vault_cluster_audit_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white font-sans flex items-center gap-2.5">
            <span>Cluster Activity & Audit Log</span>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-[#18181B] text-cyan-300 border border-white/10">
              {activities.length} Events Recorded
            </span>
          </h2>
          <p className="text-xs text-[#9CA3AF] mt-0.5">
            Immutable chronological record of node heartbeats, failure detections, checksum scrubbers, and replica repairs
          </p>
        </div>

        <button
          onClick={handleExportJSON}
          className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#141416] hover:bg-[#18181B] border border-white/[0.08] hover:border-cyan-500/40 rounded-xl transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer shadow-sm"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Export Audit Trail (JSON)</span>
        </button>
      </div>

      {/* Main Activity Log inside GlowPanel */}
      <GlowPanel
        gradient={VAULT_GRADIENTS.purple}
        glowOpacity={0.2}
        blur="45px"
        borderRadius="22px"
        hover={false}
      >
        <div className="p-5 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search event logs by title, description or type..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#0B0B0D] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 transition-colors"
            />
          </div>

          <ActivityFeed activities={filtered} showFilters={true} />
        </div>
      </GlowPanel>
    </div>
  );
};
