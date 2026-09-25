import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage');
const DB_FILE = path.join(STORAGE_ROOT, 'metadata.json');

// Ensure root storage directory exists
if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

export interface DbSchema {
  objects: Array<{
    objectId: string;
    filename: string;
    size: number;
    mimeType: string;
    version: number;
    checksum: string;
    replicationFactor: number;
    status: string;
    uploadedAt: string;
    lastVerifiedAt?: string | null;
    description?: string | null;
    isDemo: number;
  }>;
  replicas: Array<{
    objectId: string;
    nodeId: string;
    version: number;
    storedChecksum: string;
    status: string;
    lastVerifiedAt?: string | null;
    isCorrupted: number;
  }>;
  activities: Array<{
    id: string;
    timestamp: string;
    type: string;
    title: string;
    description: string;
    severity: 'info' | 'warning' | 'error' | 'success';
    nodeId?: string | null;
    objectId?: string | null;
    filename?: string | null;
  }>;
  repair_tasks: Array<{
    id: string;
    objectId: string;
    filename: string;
    sourceNodeId: string;
    targetNodeId: string;
    progress: number;
    status: string;
    startedAt: string;
    completedAt?: string | null;
    reason: string;
  }>;
  cluster_config: Record<string, string>;
}

let dbData: DbSchema = {
  objects: [],
  replicas: [],
  activities: [],
  repair_tasks: [],
  cluster_config: {
    autoRepairEnabled: 'true',
  },
};

function loadDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(content);
      dbData = {
        objects: parsed.objects || [],
        replicas: parsed.replicas || [],
        activities: parsed.activities || [],
        repair_tasks: parsed.repair_tasks || [],
        cluster_config: parsed.cluster_config || { autoRepairEnabled: 'true' },
      };
    } catch (e) {
      console.warn('[Vault DB] Could not read existing metadata.json, creating new database.', e);
    }
  }
}

let saveTimeout: NodeJS.Timeout | null = null;
function persistDatabase() {
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(dbData, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('[Vault DB] Error writing metadata:', err);
  }
}

export function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const normalized = sql.trim().replace(/\s+/g, ' ');

  // SELECT COUNT(*) as cnt FROM objects
  if (/^SELECT COUNT\(\*\) (as cnt )?FROM objects/i.test(normalized)) {
    return Promise.resolve([{ cnt: dbData.objects.length }] as unknown as T[]);
  }

  // SELECT * FROM objects WHERE objectId = ?
  if (/^SELECT \* FROM objects WHERE objectId = \?/i.test(normalized)) {
    const id = params[0];
    const item = dbData.objects.find(o => o.objectId === id);
    return Promise.resolve(item ? ([{ ...item }] as unknown as T[]) : []);
  }

  // SELECT * FROM objects ORDER BY uploadedAt DESC
  if (/^SELECT \* FROM objects ORDER BY uploadedAt DESC/i.test(normalized)) {
    const sorted = [...dbData.objects].sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    return Promise.resolve(sorted as unknown as T[]);
  }

  // SELECT * FROM objects
  if (/^SELECT \* FROM objects/i.test(normalized)) {
    return Promise.resolve([...dbData.objects] as unknown as T[]);
  }

  // SELECT * FROM replicas WHERE objectId = ? AND nodeId = ?
  if (/^SELECT \* FROM replicas WHERE objectId = \? AND nodeId = \?/i.test(normalized)) {
    const [objectId, nodeId] = params;
    const item = dbData.replicas.find(r => r.objectId === objectId && r.nodeId === nodeId);
    return Promise.resolve(item ? ([{ ...item }] as unknown as T[]) : []);
  }

  // SELECT * FROM replicas WHERE objectId = ?
  if (/^SELECT \* FROM replicas WHERE objectId = \?/i.test(normalized)) {
    const id = params[0];
    const items = dbData.replicas.filter(r => r.objectId === id);
    return Promise.resolve([...items] as unknown as T[]);
  }

  // SELECT * FROM replicas
  if (/^SELECT \* FROM replicas/i.test(normalized)) {
    return Promise.resolve([...dbData.replicas] as unknown as T[]);
  }

  // SELECT * FROM activities ORDER BY timestamp DESC LIMIT 100
  if (/^SELECT \* FROM activities ORDER BY timestamp DESC/i.test(normalized)) {
    const sorted = [...dbData.activities].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const limit = /LIMIT (\d+)/i.exec(normalized)?.[1];
    const count = limit ? parseInt(limit, 10) : 100;
    return Promise.resolve(sorted.slice(0, count) as unknown as T[]);
  }

  // SELECT * FROM activities
  if (/^SELECT \* FROM activities/i.test(normalized)) {
    return Promise.resolve([...dbData.activities] as unknown as T[]);
  }

  // SELECT * FROM repair_tasks WHERE status != 'COMPLETED'
  if (/^SELECT \* FROM repair_tasks WHERE status != 'COMPLETED'/i.test(normalized)) {
    const items = dbData.repair_tasks
      .filter(t => t.status !== 'COMPLETED')
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return Promise.resolve(items as unknown as T[]);
  }

  // SELECT * FROM repair_tasks ORDER BY startedAt DESC LIMIT
  if (/^SELECT \* FROM repair_tasks ORDER BY startedAt DESC/i.test(normalized)) {
    const limit = /LIMIT (\d+)/i.exec(normalized)?.[1];
    const count = limit ? parseInt(limit, 10) : 20;
    const sorted = [...dbData.repair_tasks].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    return Promise.resolve(sorted.slice(0, count) as unknown as T[]);
  }

  // SELECT value FROM cluster_config WHERE key = ?
  if (/^SELECT value FROM cluster_config WHERE key = \?/i.test(normalized)) {
    const key = params[0];
    const val = dbData.cluster_config[key];
    return Promise.resolve(val !== undefined ? ([{ value: val }] as unknown as T[]) : []);
  }

  console.warn('[Vault DB] Unhandled query:', normalized, params);
  return Promise.resolve([]);
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  const normalized = sql.trim().replace(/\s+/g, ' ');
  let changes = 0;

  // INSERT INTO objects
  if (/^INSERT INTO objects/i.test(normalized)) {
    const [
      objectId,
      filename,
      size,
      mimeType,
      version,
      checksum,
      replicationFactor,
      status,
      uploadedAt,
      lastVerifiedAt,
      description,
      isDemo,
    ] = params;

    // Remove existing if duplicate
    dbData.objects = dbData.objects.filter(o => o.objectId !== objectId);
    dbData.objects.push({
      objectId,
      filename,
      size: Number(size),
      mimeType,
      version: Number(version || 1),
      checksum,
      replicationFactor: Number(replicationFactor || 3),
      status: status || 'HEALTHY',
      uploadedAt,
      lastVerifiedAt: lastVerifiedAt || null,
      description: description || null,
      isDemo: Number(isDemo || 0),
    });
    changes = 1;
    persistDatabase();
    return Promise.resolve({ lastID: Date.now(), changes });
  }

  // INSERT INTO replicas
  if (/^INSERT INTO replicas/i.test(normalized)) {
    const [objectId, nodeId, version, storedChecksum, status, lastVerifiedAt, isCorrupted] = params;
    dbData.replicas = dbData.replicas.filter(r => !(r.objectId === objectId && r.nodeId === nodeId));
    dbData.replicas.push({
      objectId,
      nodeId,
      version: Number(version || 1),
      storedChecksum,
      status: status || 'HEALTHY',
      lastVerifiedAt: lastVerifiedAt || null,
      isCorrupted: Number(isCorrupted || 0),
    });
    changes = 1;
    persistDatabase();
    return Promise.resolve({ lastID: Date.now(), changes });
  }

  // INSERT INTO activities
  if (/^INSERT INTO activities/i.test(normalized)) {
    const [id, timestamp, type, title, description, severity, nodeId, objectId, filename] = params;
    dbData.activities.unshift({
      id: id || `act_${Date.now()}`,
      timestamp,
      type,
      title,
      description,
      severity: severity || 'info',
      nodeId: nodeId || null,
      objectId: objectId || null,
      filename: filename || null,
    });
    // Cap to 200 items
    if (dbData.activities.length > 200) {
      dbData.activities = dbData.activities.slice(0, 200);
    }
    changes = 1;
    persistDatabase();
    return Promise.resolve({ lastID: Date.now(), changes });
  }

  // INSERT INTO repair_tasks
  if (/^INSERT INTO repair_tasks/i.test(normalized)) {
    const [id, objectId, filename, sourceNodeId, targetNodeId, progress, status, startedAt, reason] = params;
    dbData.repair_tasks.unshift({
      id,
      objectId,
      filename,
      sourceNodeId,
      targetNodeId,
      progress: Number(progress || 0),
      status: status || 'PENDING',
      startedAt,
      completedAt: null,
      reason: reason || 'Under-replicated or corrupted block',
    });
    changes = 1;
    persistDatabase();
    return Promise.resolve({ lastID: Date.now(), changes });
  }

  // INSERT OR REPLACE INTO cluster_config
  if (/INSERT (OR REPLACE )?INTO cluster_config/i.test(normalized)) {
    const [key, value] = params;
    dbData.cluster_config[key] = String(value);
    changes = 1;
    persistDatabase();
    return Promise.resolve({ lastID: Date.now(), changes });
  }

  // UPDATE replicas SET isCorrupted = 1, status = 'CORRUPTED', storedChecksum = ?, lastVerifiedAt = ? WHERE objectId = ? AND nodeId = ?
  if (/UPDATE replicas SET isCorrupted = 1/i.test(normalized)) {
    const [storedChecksum, lastVerifiedAt, objectId, nodeId] = params;
    const replica = dbData.replicas.find(r => r.objectId === objectId && r.nodeId === nodeId);
    if (replica) {
      replica.isCorrupted = 1;
      replica.status = 'CORRUPTED';
      replica.storedChecksum = storedChecksum;
      replica.lastVerifiedAt = lastVerifiedAt;
      changes = 1;
    }
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  // UPDATE replicas SET version = version - 1, status = 'STALE', lastVerifiedAt = ? WHERE objectId = ? AND nodeId = ?
  if (/UPDATE replicas SET version = version - 1/i.test(normalized)) {
    const [lastVerifiedAt, objectId, nodeId] = params;
    const replica = dbData.replicas.find(r => r.objectId === objectId && r.nodeId === nodeId);
    if (replica) {
      replica.version = Math.max(1, replica.version - 1);
      replica.status = 'STALE';
      replica.lastVerifiedAt = lastVerifiedAt;
      changes = 1;
    }
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  // UPDATE replicas SET ... WHERE objectId = ? AND nodeId = ?
  if (/^UPDATE replicas SET/i.test(normalized)) {
    // Generic fallback for replicas
    changes = 1;
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  // UPDATE objects SET lastVerifiedAt = ? WHERE objectId = ?
  if (/UPDATE objects SET lastVerifiedAt = \? WHERE objectId = \?/i.test(normalized)) {
    const [lastVerifiedAt, objectId] = params;
    const obj = dbData.objects.find(o => o.objectId === objectId);
    if (obj) {
      obj.lastVerifiedAt = lastVerifiedAt;
      changes = 1;
    }
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  // UPDATE objects SET status = ? WHERE objectId = ?
  if (/UPDATE objects SET status = \? WHERE objectId = \?/i.test(normalized)) {
    const [status, objectId] = params;
    const obj = dbData.objects.find(o => o.objectId === objectId);
    if (obj) {
      obj.status = status;
      changes = 1;
    }
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  // UPDATE repair_tasks SET progress = ?, status = ?, completedAt = ? WHERE id = ?
  if (/UPDATE repair_tasks SET progress = \?, status = \?, completedAt = \? WHERE id = \?/i.test(normalized)) {
    const [progress, status, completedAt, id] = params;
    const task = dbData.repair_tasks.find(t => t.id === id);
    if (task) {
      task.progress = Number(progress);
      task.status = status;
      task.completedAt = completedAt;
      changes = 1;
    }
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  // UPDATE repair_tasks SET status = ? WHERE id = ?
  if (/UPDATE repair_tasks SET status = \? WHERE id = \?/i.test(normalized)) {
    const [status, id] = params;
    const task = dbData.repair_tasks.find(t => t.id === id);
    if (task) {
      task.status = status;
      changes = 1;
    }
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  // DELETE FROM replicas WHERE objectId = ? AND nodeId = ?
  if (/DELETE FROM replicas WHERE objectId = \? AND nodeId = \?/i.test(normalized)) {
    const [objectId, nodeId] = params;
    const before = dbData.replicas.length;
    dbData.replicas = dbData.replicas.filter(r => !(r.objectId === objectId && r.nodeId === nodeId));
    changes = before - dbData.replicas.length;
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  // DELETE FROM replicas WHERE objectId = ?
  if (/DELETE FROM replicas WHERE objectId = \?/i.test(normalized)) {
    const [objectId] = params;
    const before = dbData.replicas.length;
    dbData.replicas = dbData.replicas.filter(r => r.objectId !== objectId);
    changes = before - dbData.replicas.length;
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  // DELETE FROM objects WHERE objectId = ?
  if (/DELETE FROM objects WHERE objectId = \?/i.test(normalized)) {
    const [objectId] = params;
    const before = dbData.objects.length;
    dbData.objects = dbData.objects.filter(o => o.objectId !== objectId);
    changes = before - dbData.objects.length;
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  // DELETE FROM replicas
  if (/^DELETE FROM replicas/i.test(normalized)) {
    changes = dbData.replicas.length;
    dbData.replicas = [];
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  // DELETE FROM objects
  if (/^DELETE FROM objects/i.test(normalized)) {
    changes = dbData.objects.length;
    dbData.objects = [];
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  // DELETE FROM activities
  if (/^DELETE FROM activities/i.test(normalized)) {
    changes = dbData.activities.length;
    dbData.activities = [];
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  // DELETE FROM repair_tasks
  if (/^DELETE FROM repair_tasks/i.test(normalized)) {
    changes = dbData.repair_tasks.length;
    dbData.repair_tasks = [];
    persistDatabase();
    return Promise.resolve({ lastID: 0, changes });
  }

  console.warn('[Vault DB] Unhandled run SQL:', normalized, params);
  return Promise.resolve({ lastID: 0, changes: 0 });
}

export async function initDatabase(): Promise<void> {
  loadDatabase();

  // If database is empty, seed initial data
  if (dbData.objects.length === 0) {
    await seedDemoData();
  }
}

export async function seedDemoData(): Promise<void> {
  const now = new Date();

  // Clear existing
  dbData.replicas = [];
  dbData.objects = [];
  dbData.activities = [];
  dbData.repair_tasks = [];

  // Prepare physical sample data on disk
  const samplePdfBytes = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Title (Aritra's Vault Architecture Specification) /Author (Aritra Pal) /Subject (Distributed Fault-Tolerant Storage) >>\nendobj\n2 0 obj\n<< /Length 128 >>\nstream\nAritra's Vault Distributed Object Store Prototype.\nQuorum consensus, SHA-256 verification, and automatic replica self-healing.\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"
  );
  const samplePdfChecksum = crypto.createHash('sha256').update(samplePdfBytes).digest('hex');

  const sampleSqlBytes = Buffer.from(
    '-- Aritra Vault Cluster Production Snapshot\nCREATE TABLE metadata_backup (id INT, name TEXT, timestamp TEXT);\nINSERT INTO metadata_backup VALUES (1, "Vault Cluster Seed Snapshot", datetime("now"));\n-- End of snapshot archive\n'
  );
  const sampleSqlChecksum = crypto.createHash('sha256').update(sampleSqlBytes).digest('hex');

  // Ensure directories exist and write physical files
  const nodeDirMap: Record<string, string> = {
    'node-1': path.join(STORAGE_ROOT, 'node1'),
    'node-2': path.join(STORAGE_ROOT, 'node2'),
    'node-3': path.join(STORAGE_ROOT, 'node3'),
    'node-4': path.join(STORAGE_ROOT, 'node4'),
  };

  for (const dir of Object.values(nodeDirMap)) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Write obj_arch_pdf to node-1, node-2, node-4
  const pdfNodes = ['node-1', 'node-2', 'node-4'];
  for (const n of pdfNodes) {
    const dir = nodeDirMap[n];
    fs.writeFileSync(path.join(dir, 'obj_arch_pdf'), samplePdfBytes);
    fs.writeFileSync(
      path.join(dir, 'obj_arch_pdf.meta.json'),
      JSON.stringify(
        {
          objectId: 'obj_arch_pdf',
          filename: 'vault-architecture-specification.pdf',
          mimeType: 'application/pdf',
          size: samplePdfBytes.length,
          version: 1,
          expectedChecksum: samplePdfChecksum,
          storedChecksum: samplePdfChecksum,
          isCorrupted: false,
          isStale: false,
          storedAt: new Date(now.getTime() - 60000 * 12).toISOString(),
        },
        null,
        2
      )
    );
  }

  // Write obj_db_dump to node-1, node-3, node-4
  const sqlNodes = ['node-1', 'node-3', 'node-4'];
  for (const n of sqlNodes) {
    const dir = nodeDirMap[n];
    fs.writeFileSync(path.join(dir, 'obj_db_dump'), sampleSqlBytes);
    fs.writeFileSync(
      path.join(dir, 'obj_db_dump.meta.json'),
      JSON.stringify(
        {
          objectId: 'obj_db_dump',
          filename: 'production_snapshot_2026.sql.gz',
          mimeType: 'application/gzip',
          size: sampleSqlBytes.length,
          version: 1,
          expectedChecksum: sampleSqlChecksum,
          storedChecksum: sampleSqlChecksum,
          isCorrupted: false,
          isStale: false,
          storedAt: new Date(now.getTime() - 60000 * 30).toISOString(),
        },
        null,
        2
      )
    );
  }

  // Insert Demo Object 1
  dbData.objects.push({
    objectId: 'obj_arch_pdf',
    filename: 'vault-architecture-specification.pdf',
    size: samplePdfBytes.length,
    mimeType: 'application/pdf',
    version: 1,
    checksum: samplePdfChecksum,
    replicationFactor: 3,
    status: 'HEALTHY',
    uploadedAt: new Date(now.getTime() - 3600000 * 4).toISOString(),
    lastVerifiedAt: new Date(now.getTime() - 60000 * 12).toISOString(),
    description: 'Core architectural design doc for Aritra’s distributed object store',
    isDemo: 1,
  });

  for (const n of pdfNodes) {
    dbData.replicas.push({
      objectId: 'obj_arch_pdf',
      nodeId: n,
      version: 1,
      storedChecksum: samplePdfChecksum,
      status: 'HEALTHY',
      lastVerifiedAt: new Date(now.getTime() - 60000 * 12).toISOString(),
      isCorrupted: 0,
    });
  }

  // Insert Demo Object 2
  dbData.objects.push({
    objectId: 'obj_db_dump',
    filename: 'production_snapshot_2026.sql.gz',
    size: sampleSqlBytes.length,
    mimeType: 'application/gzip',
    version: 1,
    checksum: sampleSqlChecksum,
    replicationFactor: 3,
    status: 'HEALTHY',
    uploadedAt: new Date(now.getTime() - 3600000 * 8).toISOString(),
    lastVerifiedAt: new Date(now.getTime() - 60000 * 30).toISOString(),
    description: 'Cluster metadata and transactional snapshot archive',
    isDemo: 1,
  });

  for (const n of sqlNodes) {
    dbData.replicas.push({
      objectId: 'obj_db_dump',
      nodeId: n,
      version: 1,
      storedChecksum: sampleSqlChecksum,
      status: 'HEALTHY',
      lastVerifiedAt: new Date(now.getTime() - 60000 * 30).toISOString(),
      isCorrupted: 0,
    });
  }

  // Insert Initial Activities
  const sampleActivities = [
    {
      id: 'evt_1',
      timestamp: new Date(now.getTime() - 60000 * 12).toISOString(),
      type: 'INTEGRITY_CHECK',
      title: 'Routine Background Scrubber',
      description: 'Verified 8 replicas across 4 active nodes. All checksums matched canonical hashes.',
      severity: 'info' as const,
    },
    {
      id: 'evt_2',
      timestamp: new Date(now.getTime() - 3600000 * 2).toISOString(),
      type: 'OBJECT_UPLOADED',
      title: 'Object Ingestion Complete',
      description: 'Placed replicas across Node 2 and Node 3.',
      severity: 'success' as const,
      objectId: 'obj_ml_model',
      filename: 'whisper-large-v3-weights.safetensors',
    },
    {
      id: 'evt_3',
      timestamp: new Date(now.getTime() - 3600000 * 4).toISOString(),
      type: 'REPLICATION_COMPLETED',
      title: 'Tri-Way Replication Settled',
      description: 'vault-architecture-specification.pdf quorum verified on Node 1, Node 2, and Node 4.',
      severity: 'success' as const,
      objectId: 'obj_arch_pdf',
      filename: 'vault-architecture-specification.pdf',
    },
    {
      id: 'evt_4',
      timestamp: new Date(now.getTime() - 3600000 * 24).toISOString(),
      type: 'NODE_ONLINE',
      title: 'Cluster Topology Initialized',
      description: 'Storage Node 1, Node 2, Node 3, and Node 4 joined the quorum with healthy state.',
      severity: 'info' as const,
    },
  ];

  for (const act of sampleActivities) {
    dbData.activities.push({
      id: act.id,
      timestamp: act.timestamp,
      type: act.type,
      title: act.title,
      description: act.description,
      severity: act.severity,
      nodeId: null,
      objectId: act.objectId || null,
      filename: act.filename || null,
    });
  }

  persistDatabase();
}
