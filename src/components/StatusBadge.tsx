import React from 'react';
import { NodeStatus } from '../types/node';
import { ObjectStatus, ReplicaStatus } from '../types/object';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Radio } from 'lucide-react';

interface StatusBadgeProps {
  status:
    | NodeStatus
    | ObjectStatus
    | ReplicaStatus
    | 'HEALTHY'
    | 'DEGRADED'
    | 'CRITICAL'
    | 'MATCHED'
    | 'MISMATCH';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
}) => {
  let colorStyles = '';
  let shadowStyle = '';
  let label = status as string;
  let IconComponent = CheckCircle2;

  switch (status) {
    case 'HEALTHY':
    case 'MATCHED':
      colorStyles = 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40';
      shadowStyle = '0 0 10px rgba(16, 185, 129, 0.2)';
      label = status === 'MATCHED' ? 'Matched' : 'Healthy';
      IconComponent = CheckCircle2;
      break;

    case 'OFFLINE':
      colorStyles = 'bg-rose-950/40 text-rose-400 border-rose-500/40';
      shadowStyle = '0 0 10px rgba(239, 68, 68, 0.25)';
      label = 'Offline';
      IconComponent = XCircle;
      break;

    case 'DEGRADED':
    case 'STALE':
      colorStyles = 'bg-amber-950/40 text-amber-400 border-amber-500/40';
      shadowStyle = '0 0 10px rgba(245, 158, 11, 0.2)';
      label = status === 'STALE' ? 'Stale Version' : 'Degraded';
      IconComponent = AlertTriangle;
      break;

    case 'REPAIR_REQUIRED':
      colorStyles = 'bg-amber-950/50 text-amber-300 border-amber-500/50 animate-pulse';
      shadowStyle = '0 0 12px rgba(245, 158, 11, 0.3)';
      label = 'Repair Required';
      IconComponent = AlertTriangle;
      break;

    case 'CORRUPTED':
    case 'MISMATCH':
      colorStyles = 'bg-rose-950/60 text-rose-300 border-rose-500/60 animate-pulse';
      shadowStyle = '0 0 12px rgba(239, 68, 68, 0.35)';
      label = status === 'MISMATCH' ? 'Mismatch' : 'Corrupted';
      IconComponent = XCircle;
      break;

    case 'RECOVERING':
    case 'REPAIRING':
    case 'SYNCING':
      colorStyles = 'bg-cyan-950/40 text-cyan-300 border-cyan-500/40';
      shadowStyle = '0 0 10px rgba(6, 182, 212, 0.25)';
      label = status === 'RECOVERING' ? 'Recovering' : status === 'SYNCING' ? 'Syncing' : 'Repairing';
      IconComponent = RefreshCw;
      break;

    case 'CRITICAL':
      colorStyles = 'bg-rose-950/70 text-rose-300 border-rose-500/70 animate-pulse';
      shadowStyle = '0 0 14px rgba(239, 68, 68, 0.4)';
      label = 'Critical Quorum Loss';
      IconComponent = XCircle;
      break;

    default:
      colorStyles = 'bg-slate-900/60 text-slate-300 border-white/10';
      shadowStyle = 'none';
      IconComponent = Radio;
  }

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs font-medium px-2.5 py-1 gap-1.5',
    lg: 'text-sm font-semibold px-3 py-1.5 gap-2',
  }[size];

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  }[size];

  const isSpinning = status === 'RECOVERING' || status === 'REPAIRING' || status === 'SYNCING';

  return (
    <span
      className={`inline-flex items-center rounded-full border transition-all ${sizeStyles} ${colorStyles}`}
      style={{ boxShadow: shadowStyle }}
    >
      {showIcon && (
        <IconComponent className={`${iconSizes} ${isSpinning ? 'animate-spin' : ''}`} />
      )}
      <span className="font-mono tracking-wide">{label}</span>
    </span>
  );
};
