import React, { useState, useMemo } from 'react';
import { X, Upload, FileText, ShieldCheck, Database, Layers } from 'lucide-react';
import { StorageNode } from '../types/node';
import { UploadOptions } from '../types/object';
import { selectPlacementNodes } from '../services/replicationService';
import { formatBytes } from '../services/cryptoService';
import { ProgressBar } from './ProgressBar';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: StorageNode[];
  onUpload: (options: UploadOptions) => Promise<any>;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  nodes,
  onUpload,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [presetName, setPresetName] = useState<string>('demo-file.pdf');
  const [replicationFactor, setReplicationFactor] = useState<number>(3);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStage, setUploadStage] = useState<string>('');

  // Sample presets for 1-click test
  const presets = [
    {
      name: 'demo-file.pdf',
      size: 482912,
      type: 'application/pdf',
      content: 'VAULT_DISTRIBUTED_OBJECT_STORAGE_OFFICIAL_TEST_SPECIFICATION_DEMO_PDF',
    },
    {
      name: 'large_dataset.parquet',
      size: 25682912,
      type: 'application/octet-stream',
      content: 'VAULT_DISTRIBUTED_COLUMNAR_PARQUET_DATASET_TRANSACTION_RECORDS_V1',
    },
    {
      name: 'customer_export_encrypted.tar',
      size: 12582912,
      type: 'application/x-tar',
      content: 'VAULT_ENCRYPTED_TAR_ARCHIVE_CUSTOMER_DATABASE_BACKUP_BLOB_2026',
    },
  ];

  // Calculate target placement nodes dynamically
  const targetNodes = useMemo(() => {
    return selectPlacementNodes(nodes, replicationFactor);
  }, [nodes, replicationFactor]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSelectPreset = (pName: string) => {
    setPresetName(pName);
    setSelectedFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);
    setUploadProgress(15);
    setUploadStage('Hashing file content (SHA-256)...');

    try {
      await new Promise(r => setTimeout(r, 400));
      setUploadProgress(45);
      setUploadStage(`Distributing replicas to ${targetNodes.map(n => n.name).join(', ')}...`);

      await new Promise(r => setTimeout(r, 500));
      setUploadProgress(85);
      setUploadStage('Committing metadata and consensus quorum...');

      if (selectedFile) {
        await onUpload({
          file: selectedFile,
          replicationFactor,
        });
      } else {
        const preset = presets.find(p => p.name === presetName) || presets[0];
        await onUpload({
          file: {
            name: preset.name,
            size: preset.size,
            type: preset.type,
            content: preset.content,
          },
          replicationFactor,
        });
      }

      setUploadProgress(100);
      setUploadStage('Replication quorum settled successfully!');
      await new Promise(r => setTimeout(r, 350));
      onClose();
    } catch (err) {
      console.error(err);
      setIsUploading(false);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStage('');
      setSelectedFile(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0A0B]/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#111113] border border-white/[0.08] rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] p-6 text-white">
        {/* Glow ambient background behind modal */}
        <div
          className="absolute -top-10 -right-10 w-60 h-60 rounded-full pointer-events-none opacity-20"
          style={{
            background: 'radial-gradient(circle, #06B6D4 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.25)]">
              <Upload className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Ingest Object into Vault</h3>
              <p className="text-xs text-[#9CA3AF]">Upload and configure multi-node replication</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 relative z-10">
          {/* Quick Presets for Demo */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              1-Click Demo File Presets
            </label>
            <div className="grid grid-cols-3 gap-2">
              {presets.map(p => {
                const isSelected = !selectedFile && presetName === p.name;
                return (
                  <button
                    type="button"
                    key={p.name}
                    onClick={() => handleSelectPreset(p.name)}
                    disabled={isUploading}
                    className={`p-2.5 text-left rounded-xl border text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/50 border-cyan-500/80 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                        : 'bg-[#141417] border-white/[0.08] text-[#9CA3AF] hover:text-white hover:border-white/[0.15]'
                    }`}
                  >
                    <div className="font-mono font-semibold truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{formatBytes(p.size)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Or custom file upload */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Or Choose Local File
            </label>
            <label
              className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                selectedFile
                  ? 'border-cyan-500/70 bg-cyan-950/20'
                  : 'border-white/[0.12] hover:border-cyan-500/40 bg-[#0E0E11]'
              }`}
            >
              <div className="flex flex-col items-center justify-center text-center">
                <FileText className={`w-6 h-6 mb-1 ${selectedFile ? 'text-cyan-400' : 'text-slate-400'}`} />
                {selectedFile ? (
                  <p className="text-xs font-medium text-cyan-200 font-mono">
                    {selectedFile.name} ({formatBytes(selectedFile.size)})
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-slate-300">
                      <span className="font-semibold text-cyan-400">Click to browse</span> or drag and drop
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono">PDF, JSON, BIN, ZIP, TXT, etc.</p>
                  </>
                )}
              </div>
              <input
                type="file"
                className="hidden"
                disabled={isUploading}
                onChange={handleFileChange}
              />
            </label>
          </div>

          {/* Replication Factor Selector: [ 2 ] [ 3 ] [ 4 ] */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Replication Factor (Durability Quorum)
              </label>
              <span className="text-[11px] text-cyan-400 font-medium font-mono">
                {replicationFactor} distinct copies
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[2, 3, 4].map(factor => {
                const isSelected = replicationFactor === factor;
                return (
                  <button
                    type="button"
                    key={factor}
                    onClick={() => setReplicationFactor(factor)}
                    disabled={isUploading}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/70 text-cyan-300 border-cyan-500/80 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                        : 'bg-[#141417] text-[#9CA3AF] border-white/[0.08] hover:text-white hover:border-white/[0.15]'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Factor {factor}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Real-Time Replica Placement Preview */}
          <div className="p-3.5 rounded-xl bg-[#0E0E11] border border-white/[0.06]">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-medium text-[#9CA3AF] flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                Target Storage Nodes:
              </span>
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                <ShieldCheck className="w-3.5 h-3.5" />
                Balanced Placement
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {targetNodes.map(node => (
                <div
                  key={node.id}
                  className="px-2.5 py-1 rounded-lg bg-[#141418] border border-white/[0.08] text-xs text-slate-200 flex items-center gap-1.5 font-mono"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                  <span>{node.name}</span>
                </div>
              ))}
              {targetNodes.length < replicationFactor && (
                <div className="px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-500/30 text-[11px] text-rose-300 font-mono">
                  Insufficient healthy nodes ({targetNodes.length}/{replicationFactor})
                </div>
              )}
            </div>
          </div>

          {/* Upload Progress Bar if active */}
          {isUploading && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">{uploadStage}</span>
                <span className="font-mono text-cyan-400 font-bold">{uploadProgress}%</span>
              </div>
              <ProgressBar value={uploadProgress} color="cyan" size="md" />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 text-xs font-semibold text-[#9CA3AF] hover:text-white bg-[#141416] hover:bg-[#18181B] rounded-xl border border-white/[0.08] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || targetNodes.length === 0}
              className="px-4.5 py-2 text-xs font-semibold text-white bg-[#141416] hover:bg-[#18181D] border border-cyan-400/40 hover:border-cyan-400/70 hover:shadow-[0_0_12px_rgba(6,182,212,0.3)] rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isUploading ? 'Replicating...' : 'Commit & Replicate'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
