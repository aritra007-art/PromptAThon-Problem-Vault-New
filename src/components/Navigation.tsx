import React from 'react';
import { LayoutDashboard, HardDrive, Server, ListFilter, Sparkles } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'objects' | 'nodes' | 'activity' | 'demotour';

interface NavigationProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  objectCount: number;
  nodeCount: number;
  healthyNodeCount: number;
  repairCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  objectCount,
  nodeCount,
  healthyNodeCount,
  repairCount,
}) => {
  const tabs = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: repairCount > 0 ? `${repairCount} repairs` : undefined,
      badgeColor: 'bg-amber-950/60 text-amber-300 border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.2)]',
    },
    {
      id: 'objects' as ActiveTab,
      label: 'Objects',
      icon: HardDrive,
      badge: `${objectCount}`,
      badgeColor: 'bg-[#18181B] text-slate-300 border-white/10',
    },
    {
      id: 'nodes' as ActiveTab,
      label: 'Storage Nodes',
      icon: Server,
      badge: `${healthyNodeCount}/${nodeCount}`,
      badgeColor: healthyNodeCount === nodeCount
        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
        : 'bg-rose-950/60 text-rose-300 border-rose-500/40 shadow-[0_0_8px_rgba(239,68,68,0.2)]',
    },
    {
      id: 'activity' as ActiveTab,
      label: 'Activity Log',
      icon: ListFilter,
    },
    {
      id: 'demotour' as ActiveTab,
      label: 'Demo Walkthrough',
      icon: Sparkles,
      badge: 'Interactive',
      badgeColor: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.25)] animate-pulse',
    },
  ];

  return (
    <nav
      className="transition-colors"
      style={{
        background: 'rgba(10, 10, 11, 0.65)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`group relative inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'text-white bg-[#141417] shadow-sm'
                    : 'text-[#9CA3AF] hover:text-white hover:bg-white/[0.04]'
                }`}
                style={{
                  border: isActive ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid transparent',
                  boxShadow: isActive ? '0 0 16px rgba(6, 182, 212, 0.15)' : 'none',
                }}
              >
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-cyan-300'
                  }`}
                />
                <span className={isActive ? 'font-semibold text-white' : ''}>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`ml-1 text-[11px] font-mono px-2 py-0.5 rounded-full border transition-all ${tab.badgeColor}`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
