import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  DatabaseProvider,
  DbObjectRecord,
  DbReplicaRecord,
  DbActivityRecord,
  DbRepairTaskRecord,
  DbClusterConfigRecord,
} from './types';

const DEFAULT_CONFIG: DbClusterConfigRecord = {
  defaultReplicationFactor: 3,
  heartbeatIntervalMs: 3000,
  autoRepairEnabled: true,
  backgroundScrubbingEnabled: true,
};

/**
 * SupabaseProvider
 * Connects directly to Supabase PostgreSQL using server-side environment variables.
 * Never exposes credentials to client-side code.
 */
export class SupabaseProvider implements DatabaseProvider {
  public name = 'Supabase PostgreSQL Cloud Database';
  public mode: 'supabase' = 'supabase';
  private supabase: SupabaseClient | null = null;
  private url: string;
  private key: string;

  constructor(url?: string, key?: string) {
    this.url = url || process.env.SUPABASE_URL || '';
    this.key = key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  }

  public async init(): Promise<void> {
    if (!this.url || !this.key) {
      console.warn(
        '[SupabaseProvider] SUPABASE_URL or server secret key is not set. Operating in fallback mode.'
      );
      return;
    }

    this.supabase = createClient(this.url, this.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    console.log('[SupabaseProvider] Initialized connection to Supabase project:', this.url);
  }

  private ensureClient(): SupabaseClient {
    if (!this.supabase) {
      if (this.url && this.key) {
        this.supabase = createClient(this.url, this.key, {
          auth: { persistSession: false },
        });
      } else {
        throw new Error(
          '[SupabaseProvider] Supabase client is not configured. Please supply SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
        );
      }
    }
    return this.supabase;
  }

  // Objects
  public async getObjects(): Promise<DbObjectRecord[]> {
    const client = this.ensureClient();
    const { data, error } = await client
      .from('objects')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('[SupabaseProvider] Error fetching objects:', error.message);
      return [];
    }

    return (data || []).map(row => ({
      objectId: row.object_id,
      filename: row.filename,
      size: Number(row.size),
      mimeType: row.mime_type,
      version: row.version,
      checksum: row.checksum,
      replicationFactor: row.replication_factor,
      uploadedAt: row.uploaded_at,
      lastVerifiedAt: row.last_verified_at,
      status: row.status,
      description: row.description,
    }));
  }

  public async getObject(objectId: string): Promise<DbObjectRecord | null> {
    const client = this.ensureClient();
    const { data, error } = await client
      .from('objects')
      .select('*')
      .eq('object_id', objectId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      objectId: data.object_id,
      filename: data.filename,
      size: Number(data.size),
      mimeType: data.mime_type,
      version: data.version,
      checksum: data.checksum,
      replicationFactor: data.replication_factor,
      uploadedAt: data.uploaded_at,
      lastVerifiedAt: data.last_verified_at,
      status: data.status,
      description: data.description,
    };
  }

  public async saveObject(obj: DbObjectRecord): Promise<void> {
    const client = this.ensureClient();
    const payload = {
      object_id: obj.objectId,
      filename: obj.filename,
      size: obj.size,
      mime_type: obj.mimeType || 'application/octet-stream',
      version: obj.version,
      checksum: obj.checksum,
      replication_factor: obj.replicationFactor,
      uploaded_at: obj.uploadedAt,
      last_verified_at: obj.lastVerifiedAt || null,
      status: obj.status,
      description: obj.description || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from('objects')
      .upsert(payload, { onConflict: 'object_id' });

    if (error) {
      throw new Error(`[SupabaseProvider] Failed to save object ${obj.objectId}: ${error.message}`);
    }
  }

  public async deleteObject(objectId: string): Promise<void> {
    const client = this.ensureClient();
    const { error } = await client.from('objects').delete().eq('object_id', objectId);
    if (error) {
      throw new Error(`[SupabaseProvider] Failed to delete object ${objectId}: ${error.message}`);
    }
  }

  // Replicas
  public async getReplicas(objectId?: string): Promise<DbReplicaRecord[]> {
    const client = this.ensureClient();
    let query = client.from('replicas').select('*');
    if (objectId) {
      query = query.eq('object_id', objectId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[SupabaseProvider] Error fetching replicas:', error.message);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      objectId: row.object_id,
      nodeId: row.node_id,
      version: row.version,
      storedChecksum: row.stored_checksum,
      status: row.status,
      storagePath: row.storage_path,
      isCorrupted: Boolean(row.is_corrupted),
      lastVerifiedAt: row.last_verified_at,
    }));
  }

  public async saveReplica(replica: DbReplicaRecord): Promise<void> {
    const client = this.ensureClient();
    const payload = {
      object_id: replica.objectId,
      node_id: replica.nodeId,
      version: replica.version,
      stored_checksum: replica.storedChecksum,
      status: replica.status,
      storage_path: replica.storagePath,
      is_corrupted: replica.isCorrupted,
      last_verified_at: replica.lastVerifiedAt || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from('replicas')
      .upsert(payload, { onConflict: 'object_id,node_id' });

    if (error) {
      throw new Error(`[SupabaseProvider] Failed to save replica for ${replica.objectId}: ${error.message}`);
    }
  }

  public async deleteReplicas(objectId: string): Promise<void> {
    const client = this.ensureClient();
    const { error } = await client.from('replicas').delete().eq('object_id', objectId);
    if (error) {
      console.error('[SupabaseProvider] Error deleting replicas:', error.message);
    }
  }

  public async deleteReplica(objectId: string, nodeId: string): Promise<void> {
    const client = this.ensureClient();
    const { error } = await client
      .from('replicas')
      .delete()
      .eq('object_id', objectId)
      .eq('node_id', nodeId);
    if (error) {
      console.error('[SupabaseProvider] Error deleting single replica:', error.message);
    }
  }

  // Activities
  public async getActivities(limit = 100): Promise<DbActivityRecord[]> {
    const client = this.ensureClient();
    const { data, error } = await client
      .from('activities')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[SupabaseProvider] Error fetching activities:', error.message);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      type: row.type,
      title: row.title,
      description: row.description,
      severity: row.severity,
      nodeId: row.node_id,
      objectId: row.object_id,
      filename: row.filename,
    }));
  }

  public async saveActivity(activity: DbActivityRecord): Promise<void> {
    const client = this.ensureClient();
    const payload = {
      id: activity.id,
      timestamp: activity.timestamp,
      type: activity.type,
      title: activity.title,
      description: activity.description,
      severity: activity.severity,
      node_id: activity.nodeId || null,
      object_id: activity.objectId || null,
      filename: activity.filename || null,
    };

    const { error } = await client.from('activities').insert(payload);
    if (error) {
      console.error('[SupabaseProvider] Failed to insert activity:', error.message);
    }
  }

  // Repair Tasks
  public async getRepairTasks(): Promise<DbRepairTaskRecord[]> {
    const client = this.ensureClient();
    const { data, error } = await client
      .from('repair_tasks')
      .select('*')
      .order('started_at', { ascending: false });

    if (error) {
      console.error('[SupabaseProvider] Error fetching repair tasks:', error.message);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      objectId: row.object_id,
      filename: row.filename,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      reason: row.reason,
      status: row.status,
      progress: row.progress,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
    }));
  }

  public async saveRepairTask(task: DbRepairTaskRecord): Promise<void> {
    const client = this.ensureClient();
    const payload = {
      id: task.id,
      object_id: task.objectId,
      filename: task.filename,
      source_node_id: task.sourceNodeId,
      target_node_id: task.targetNodeId,
      reason: task.reason,
      status: task.status,
      progress: task.progress,
      started_at: task.startedAt,
      completed_at: task.completedAt || null,
      error_message: task.errorMessage || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from('repair_tasks')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('[SupabaseProvider] Failed to save repair task:', error.message);
    }
  }

  // Config
  public async getConfig(): Promise<DbClusterConfigRecord> {
    const client = this.ensureClient();
    const { data, error } = await client
      .from('cluster_config')
      .select('*')
      .eq('id', 'primary')
      .maybeSingle();

    if (error || !data) {
      return DEFAULT_CONFIG;
    }

    return {
      defaultReplicationFactor: data.default_replication_factor,
      heartbeatIntervalMs: data.heartbeat_interval_ms,
      autoRepairEnabled: Boolean(data.auto_repair_enabled),
      backgroundScrubbingEnabled: Boolean(data.background_scrubbing_enabled),
    };
  }

  public async saveConfig(config: DbClusterConfigRecord): Promise<void> {
    const client = this.ensureClient();
    const payload = {
      id: 'primary',
      default_replication_factor: config.defaultReplicationFactor,
      heartbeat_interval_ms: config.heartbeatIntervalMs,
      auto_repair_enabled: config.autoRepairEnabled,
      background_scrubbing_enabled: config.backgroundScrubbingEnabled,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from('cluster_config')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('[SupabaseProvider] Failed to save cluster config:', error.message);
    }
  }
}
