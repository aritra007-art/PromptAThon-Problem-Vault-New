-- Vault Distributed Object Storage: Initial Cloud Schema for Supabase PostgreSQL
-- Migration: 001_initial_schema.sql

-- Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Objects Table: Canonical Metadata for Stored Objects
CREATE TABLE IF NOT EXISTS objects (
    object_id VARCHAR(128) PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    size BIGINT NOT NULL CHECK (size >= 0),
    mime_type VARCHAR(128) NOT NULL DEFAULT 'application/octet-stream',
    version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
    checksum VARCHAR(64) NOT NULL, -- SHA-256 canonical hexadecimal hash
    replication_factor INT NOT NULL DEFAULT 3 CHECK (replication_factor >= 1),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'HEALTHY',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_objects_status ON objects(status);
CREATE INDEX IF NOT EXISTS idx_objects_filename ON objects(filename);

-- 2. Replicas Table: Distributed Replica State across Nodes/Domains
CREATE TABLE IF NOT EXISTS replicas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    object_id VARCHAR(128) NOT NULL REFERENCES objects(object_id) ON DELETE CASCADE,
    node_id VARCHAR(64) NOT NULL,
    version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
    stored_checksum VARCHAR(64) NOT NULL, -- Stored replica hash
    status VARCHAR(32) NOT NULL DEFAULT 'HEALTHY', -- HEALTHY, CORRUPTED, STALE, REPAIRING, OFFLINE
    storage_path VARCHAR(512) NOT NULL, -- e.g. node-1/{objectId}
    is_corrupted BOOLEAN NOT NULL DEFAULT FALSE,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (object_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_replicas_object_id ON replicas(object_id);
CREATE INDEX IF NOT EXISTS idx_replicas_node_id ON replicas(node_id);
CREATE INDEX IF NOT EXISTS idx_replicas_status ON replicas(status);

-- 3. Activities Table: Immutable Distributed Audit Trail
CREATE TABLE IF NOT EXISTS activities (
    id VARCHAR(128) PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'info', -- info, success, warning, error
    node_id VARCHAR(64),
    object_id VARCHAR(128),
    filename VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activities_severity ON activities(severity);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);

-- 4. Repair Tasks Table: Self-Healing and Reconstruction Queue
CREATE TABLE IF NOT EXISTS repair_tasks (
    id VARCHAR(128) PRIMARY KEY,
    object_id VARCHAR(128) NOT NULL REFERENCES objects(object_id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    source_node_id VARCHAR(64) NOT NULL,
    target_node_id VARCHAR(64) NOT NULL,
    reason VARCHAR(64) NOT NULL, -- NODE_FAILURE, BITROT_CORRUPTION, UNDER_REPLICATED, STALE_REPLICA
    status VARCHAR(32) NOT NULL DEFAULT 'QUEUED', -- QUEUED, IN_PROGRESS, COMPLETED, FAILED
    progress INT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_tasks_status ON repair_tasks(status);

-- 5. Cluster Config Table: Centralized Cluster Parameters
CREATE TABLE IF NOT EXISTS cluster_config (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'primary',
    default_replication_factor INT NOT NULL DEFAULT 3,
    heartbeat_interval_ms INT NOT NULL DEFAULT 3000,
    auto_repair_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    background_scrubbing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert initial cluster config if not present
INSERT INTO cluster_config (id, default_replication_factor, heartbeat_interval_ms, auto_repair_enabled, background_scrubbing_enabled)
VALUES ('primary', 3, 3000, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 6. Storage Bucket initialization instruction for Supabase Storage:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('vault-objects', 'vault-objects', false) ON CONFLICT DO NOTHING;
