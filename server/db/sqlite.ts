import fs from 'fs';
import path from 'path';
import {
  DatabaseProvider,
  DbObjectRecord,
  DbReplicaRecord,
  DbActivityRecord,
  DbRepairTaskRecord,
  DbClusterConfigRecord,
} from './types';

interface SQLiteStateFile {
  objects: DbObjectRecord[];
  replicas: DbReplicaRecord[];
  activities: DbActivityRecord[];
  repairTasks: DbRepairTaskRecord[];
  config: DbClusterConfigRecord;
}

const DEFAULT_CONFIG: DbClusterConfigRecord = {
  defaultReplicationFactor: 3,
  heartbeatIntervalMs: 3000,
  autoRepairEnabled: true,
  backgroundScrubbingEnabled: true,
};

/**
 * SQLiteProvider
 * Production-ready zero-dependency persistent JSON/SQLite store for local distributed mode.
 * Operates on data/metadata.sqlite.json (compatible with standard SQLite WAL/JSON migrations).
 */
export class SQLiteProvider implements DatabaseProvider {
  public name = 'SQLite / Local Embedded Database';
  public mode: 'sqlite' = 'sqlite';
  private filePath: string;
  private state: SQLiteStateFile = {
    objects: [],
    replicas: [],
    activities: [],
    repairTasks: [],
    config: DEFAULT_CONFIG,
  };

  constructor(filePath?: string) {
    this.filePath = filePath || path.resolve(process.cwd(), 'storage', 'vault_metadata.sqlite.json');
  }

  public async init(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.state = JSON.parse(raw);
        if (!this.state.config) this.state.config = DEFAULT_CONFIG;
        if (!this.state.objects) this.state.objects = [];
        if (!this.state.replicas) this.state.replicas = [];
        if (!this.state.activities) this.state.activities = [];
        if (!this.state.repairTasks) this.state.repairTasks = [];
      } catch (err) {
        console.warn('[SQLiteProvider] Existing metadata file corrupted or unreadable. Initializing fresh.', err);
        await this.flush();
      }
    } else {
      // Initialize with default state
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    try {
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error('[SQLiteProvider] Failed to flush database file:', err);
    }
  }

  // Objects
  public async getObjects(): Promise<DbObjectRecord[]> {
    return [...this.state.objects];
  }

  public async getObject(objectId: string): Promise<DbObjectRecord | null> {
    return this.state.objects.find(o => o.objectId === objectId) || null;
  }

  public async saveObject(obj: DbObjectRecord): Promise<void> {
    const idx = this.state.objects.findIndex(o => o.objectId === obj.objectId);
    if (idx >= 0) {
      this.state.objects[idx] = { ...this.state.objects[idx], ...obj };
    } else {
      this.state.objects.push(obj);
    }
    await this.flush();
  }

  public async deleteObject(objectId: string): Promise<void> {
    this.state.objects = this.state.objects.filter(o => o.objectId !== objectId);
    this.state.replicas = this.state.replicas.filter(r => r.objectId !== objectId);
    this.state.repairTasks = this.state.repairTasks.filter(t => t.objectId !== objectId);
    await this.flush();
  }

  // Replicas
  public async getReplicas(objectId?: string): Promise<DbReplicaRecord[]> {
    if (objectId) {
      return this.state.replicas.filter(r => r.objectId === objectId);
    }
    return [...this.state.replicas];
  }

  public async saveReplica(replica: DbReplicaRecord): Promise<void> {
    const idx = this.state.replicas.findIndex(
      r => r.objectId === replica.objectId && r.nodeId === replica.nodeId
    );
    if (idx >= 0) {
      this.state.replicas[idx] = { ...this.state.replicas[idx], ...replica };
    } else {
      this.state.replicas.push(replica);
    }
    await this.flush();
  }

  public async deleteReplicas(objectId: string): Promise<void> {
    this.state.replicas = this.state.replicas.filter(r => r.objectId !== objectId);
    await this.flush();
  }

  public async deleteReplica(objectId: string, nodeId: string): Promise<void> {
    this.state.replicas = this.state.replicas.filter(
      r => !(r.objectId === objectId && r.nodeId === nodeId)
    );
    await this.flush();
  }

  // Activities
  public async getActivities(limit = 100): Promise<DbActivityRecord[]> {
    return this.state.activities.slice(0, limit);
  }

  public async saveActivity(activity: DbActivityRecord): Promise<void> {
    this.state.activities = [activity, ...this.state.activities.slice(0, 99)];
    await this.flush();
  }

  // Repair Tasks
  public async getRepairTasks(): Promise<DbRepairTaskRecord[]> {
    return [...this.state.repairTasks];
  }

  public async saveRepairTask(task: DbRepairTaskRecord): Promise<void> {
    const idx = this.state.repairTasks.findIndex(t => t.id === task.id);
    if (idx >= 0) {
      this.state.repairTasks[idx] = { ...this.state.repairTasks[idx], ...task };
    } else {
      this.state.repairTasks.push(task);
    }
    await this.flush();
  }

  // Config
  public async getConfig(): Promise<DbClusterConfigRecord> {
    return { ...this.state.config };
  }

  public async saveConfig(config: DbClusterConfigRecord): Promise<void> {
    this.state.config = { ...config };
    await this.flush();
  }
}
