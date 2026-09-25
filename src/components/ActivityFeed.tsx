import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Filter,
} from 'lucide-react';
import { ActivityEvent } from '../types/activity';
import { formatTimeAgo } from '../services/cryptoService';

interface ActivityFeedProps {
  activities: ActivityEvent[];
  maxItems?: number;
  showFilters?: boolean;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  maxItems,
  showFilters = false,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');

  const filtered = activities.filter(evt => {
    if (filterType === 'ALL') return true;
    if (filterType === 'FAILURES') return evt.type.includes('FAILURE') || evt.severity === 'error';
    if (filterType === 'REPAIRS') return evt.type.includes('REPAIR') || evt.type.includes('RECOVERY');
    if (filterType === 'INTEGRITY') return evt.type.includes('INTEGRITY') || evt.type.includes('CORRUPTION');
    if (filterType === 'UPLOADS') return evt.type.includes('OBJECT_') || evt.type.includes('REPLICATION');
    return true;
  });

  const displayItems = maxItems ? filtered.slice(0, maxItems) : filtered;

  const getStatusIndicator = (severity: ActivityEvent['severity']) => {
    switch (severity) {
      case 'error':
        return (
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
          </div>
        );
      case 'warning':
        return (
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          </div>
        );
      case 'success':
        return (
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
            <Info className="w-3.5 h-3.5 text-cyan-400" />
          </div>
        );
    }
  };

  const getItemBorderBg = (severity: ActivityEvent['severity']) => {
    switch (severity) {
      case 'error':
        return 'border-rose-900/30 bg-[#160E10]/60 hover:bg-[#1A1012]';
      case 'warning':
        return 'border-amber-900/30 bg-[#16120C]/60 hover:bg-[#1A150E]';
      case 'success':
        return 'border-emerald-900/30 bg-[#0E1512]/60 hover:bg-[#101915]';
      default:
        return 'border-white/[0.06] bg-[#0E0E11]/60 hover:bg-[#141418]';
    }
  };

  return (
    <div className="space-y-3">
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <span className="text-xs text-[#9CA3AF] flex items-center gap-1 font-medium">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            Filter:
          </span>
          {['ALL', 'FAILURES', 'REPAIRS', 'INTEGRITY', 'UPLOADS'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-2.5 py-1 text-xs rounded-lg font-mono transition-all cursor-pointer ${
                filterType === type
                  ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                  : 'bg-[#141416] text-[#9CA3AF] hover:text-white border border-white/[0.08]'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {displayItems.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500 rounded-2xl bg-[#0E0E10] border border-white/[0.06]">
          No activity logs recorded under this filter.
        </div>
      ) : (
        <div className="space-y-2">
          {displayItems.map(event => {
            const timeFormatted = new Date(event.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div
                key={event.id}
                className={`p-3 rounded-xl border text-xs transition-all duration-200 ${getItemBorderBg(event.severity)}`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5">
                    {getStatusIndicator(event.severity)}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-100 font-sans">{event.title}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#18181B] text-slate-400 border border-white/10">
                          {event.type}
                        </span>
                      </div>
                      <p className="text-[#9CA3AF] mt-1 leading-relaxed font-sans">{event.description}</p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono text-[11px] text-slate-300 block">{timeFormatted}</span>
                    <span className="text-[10px] text-slate-500 font-mono block">{formatTimeAgo(event.timestamp)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
