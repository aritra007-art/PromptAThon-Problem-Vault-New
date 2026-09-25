import React from 'react';

interface ProgressBarProps {
  value: number; // 0 to 100
  color?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'indigo';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  labelPrefix?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  color = 'cyan',
  size = 'md',
  showLabel = false,
  labelPrefix = '',
  className = '',
}) => {
  const clamped = Math.max(0, Math.min(100, value));

  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-3.5',
  }[size];

  const colorClasses = {
    cyan: 'bg-gradient-to-r from-cyan-500 to-sky-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]',
    emerald: 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]',
    amber: 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_10px_rgba(245,158,11,0.4)]',
    rose: 'bg-gradient-to-r from-rose-500 to-pink-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]',
    indigo: 'bg-gradient-to-r from-indigo-500 to-violet-500 shadow-[0_0_10px_rgba(99,102,241,0.4)]',
  }[color];

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center text-xs font-mono text-[#9CA3AF] mb-1">
          <span>{labelPrefix}</span>
          <span className="font-semibold text-white">{Math.round(clamped)}%</span>
        </div>
      )}
      <div className={`w-full bg-[#1A1A1E] rounded-full overflow-hidden border border-white/[0.06] ${heightClasses}`}>
        <div
          className={`${colorClasses} ${heightClasses} rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
};
