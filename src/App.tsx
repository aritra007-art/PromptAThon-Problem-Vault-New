/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useVaultCluster } from './hooks/useVaultCluster';
import { Header } from './components/Header';
import { Navigation, ActiveTab } from './components/Navigation';
import { Dashboard } from './pages/Dashboard';
import { ObjectsPage } from './pages/Objects';
import { NodesPage } from './pages/Nodes';
import { ActivityPage } from './pages/Activity';
import { DemoWalkthrough } from './components/DemoWalkthrough';
import { UploadModal } from './components/UploadModal';
import { ObjectDetailsModal } from './components/ObjectDetailsModal';
import { ToastContainer } from './components/ToastContainer';
import { StoredObject } from './types/object';

export default function App() {
  const {
    nodes,
    objects,
    activities,
    config,
    repairQueue,
    stats,
    toasts,
    removeToast,
    uploadObject,
    downloadObject,
    simulateNodeFailure,
    recoverNode,
    simulateCorruption,
    simulateStaleVersion,
    verifyIntegrity,
    repairObject,
    triggerAutonomousRepairs,
    rebalanceCluster,
    deleteObject,
    resetCluster,
    updateConfig,
    backendMode,
  } = useVaultCluster();

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [inspectedObject, setInspectedObject] = useState<StoredObject | null>(null);

  // Keep inspected object synced with latest state
  const currentInspectedObject = inspectedObject
    ? objects.find(o => o.objectId === inspectedObject.objectId) || null
    : null;

  // Handlers for Demo Toolbar
  const handleQuickFailure = () => {
    const healthyNode = nodes.find(n => n.status === 'HEALTHY');
    if (healthyNode) {
      simulateNodeFailure(healthyNode.id);
    }
  };

  const handleQuickCorruption = () => {
    const obj = objects[0];
    if (obj) {
      const healthyReplica = obj.replicas.find(r => {
        const node = nodes.find(n => n.id === r.nodeId);
        return node && node.status === 'HEALTHY' && !r.isCorrupted;
      });
      if (healthyReplica) {
        simulateCorruption(obj.objectId, healthyReplica.nodeId);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden">
      {/* 13. BACKGROUND AMBIENT LIGHTING (Subtle fixed ambient gradients) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        {/* Top-left cyan ambient glow */}
        <div
          className="absolute -top-[10%] -left-[10%] w-[600px] sm:w-[800px] h-[600px] sm:h-[800px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 55%)',
          }}
        />
        {/* Top-right purple ambient glow */}
        <div
          className="absolute -top-[10%] -right-[10%] w-[600px] sm:w-[800px] h-[600px] sm:h-[800px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 55%)',
          }}
        />
        {/* Bottom soft violet ambient glow */}
        <div
          className="absolute -bottom-[15%] left-[25%] w-[700px] sm:w-[900px] h-[700px] sm:h-[900px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(168,85,247,0.05) 0%, transparent 60%)',
          }}
        />
        {/* Subtle grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Header */}
      <Header
        stats={stats}
        backendMode={backendMode}
        autoRepair={config.autoRepairEnabled}
        onToggleAutoRepair={enabled => updateConfig({ autoRepairEnabled: enabled })}
        onSimulateNodeFailure={handleQuickFailure}
        onSimulateCorruption={handleQuickCorruption}
        onVerifyAll={() => verifyIntegrity()}
        onRepairAll={triggerAutonomousRepairs}
        onRebalance={rebalanceCluster}
        onReset={resetCluster}
        onOpenDemoTour={() => setActiveTab('demotour')}
      />

      {/* Navigation */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        objectCount={objects.length}
        nodeCount={nodes.length}
        healthyNodeCount={stats.healthyNodesCount}
        repairCount={repairQueue.filter(t => t.status !== 'COMPLETED').length}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10">
        {activeTab === 'dashboard' && (
          <Dashboard
            stats={stats}
            nodes={nodes}
            objects={objects}
            activities={activities}
            repairQueue={repairQueue}
            onSimulateNodeFailure={simulateNodeFailure}
            onRecoverNode={recoverNode}
            onSelectTab={setActiveTab}
            onOpenUpload={() => setIsUploadModalOpen(true)}
          />
        )}

        {activeTab === 'objects' && (
          <ObjectsPage
            objects={objects}
            nodes={nodes}
            onOpenUpload={() => setIsUploadModalOpen(true)}
            onInspectObject={obj => setInspectedObject(obj)}
            onDownload={downloadObject}
            onVerify={objectId => verifyIntegrity(objectId)}
          />
        )}

        {activeTab === 'nodes' && (
          <NodesPage
            nodes={nodes}
            objects={objects}
            onSimulateNodeFailure={simulateNodeFailure}
            onRecoverNode={recoverNode}
            onInspectObject={obj => setInspectedObject(obj)}
          />
        )}

        {activeTab === 'activity' && (
          <ActivityPage activities={activities} />
        )}

        {activeTab === 'demotour' && (
          <DemoWalkthrough
            nodes={nodes}
            objects={objects}
            onUpload={uploadObject}
            onSimulateNodeFailure={simulateNodeFailure}
            onRecoverNode={recoverNode}
            onSimulateCorruption={simulateCorruption}
            onVerifyIntegrity={verifyIntegrity}
            onRepairObject={repairObject}
            onSelectTab={setActiveTab}
          />
        )}
      </main>

      {/* Footer */}
      <footer
        className="py-4 text-center text-xs text-[#9CA3AF] font-mono relative z-10 transition-colors"
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.07)',
          background: 'rgba(10, 10, 11, 0.85)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-slate-300 font-medium">Aritra's Vault Distributed Storage Prototype</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-[#9CA3AF]">
            <span>SHA-256 Quorum Consensus</span>
            <span>•</span>
            <span>Independent Node Store</span>
            <span>•</span>
            <span>Autonomous Self-Healing</span>
          </div>
        </div>
      </footer>

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        nodes={nodes}
        onUpload={uploadObject}
      />

      {/* Object Inspection Modal */}
      <ObjectDetailsModal
        object={currentInspectedObject}
        nodes={nodes}
        onClose={() => setInspectedObject(null)}
        onDownload={downloadObject}
        onVerify={objectId => verifyIntegrity(objectId)}
        onRepair={objectId => repairObject(objectId)}
        onCorrupt={(objectId, nodeId) => simulateCorruption(objectId, nodeId)}
        onStale={(objectId, nodeId) => simulateStaleVersion(objectId, nodeId)}
        onDelete={objectId => deleteObject(objectId)}
      />

      {/* Global Toast Container */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
