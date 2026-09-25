import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { ToastNotice } from '../hooks/useVaultCluster';

interface ToastContainerProps {
  toasts: ToastNotice[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        let borderClass = 'border-white/[0.08] bg-[#111113]/95 shadow-[0_0_20px_rgba(0,0,0,0.6)]';
        let icon = <Info className="w-4 h-4 text-cyan-400 shrink-0" />;

        if (toast.type === 'success') {
          borderClass = 'border-emerald-500/40 bg-[#0E1512]/95 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.2)]';
          icon = <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
        } else if (toast.type === 'warning') {
          borderClass = 'border-amber-500/40 bg-[#16120C]/95 text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.2)]';
          icon = <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
        } else if (toast.type === 'error') {
          borderClass = 'border-rose-500/40 bg-[#160E10]/95 text-rose-200 shadow-[0_0_20px_rgba(239,68,68,0.25)]';
          icon = <XCircle className="w-4 h-4 text-rose-400 shrink-0" />;
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3.5 rounded-xl border backdrop-blur-md transition-all animate-in slide-in-from-bottom-2 duration-200 ${borderClass}`}
          >
            <div className="mt-0.5">{icon}</div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-white font-sans">{toast.title}</h4>
              <p className="text-xs text-[#9CA3AF] mt-0.5 leading-relaxed font-sans">{toast.message}</p>
            </div>
            <button
              onClick={() => onRemove(toast.id)}
              className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
