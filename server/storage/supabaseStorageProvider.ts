import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { StorageProvider } from './storageProvider';

/**
 * SupabaseStorageProvider
 * Manages object bytes in Supabase Storage under the 'vault-objects' bucket.
 * Replicas are organized under logical replica domain paths:
 *   node-1/{objectId}
 *   node-2/{objectId}
 *   node-3/{objectId}
 *   node-4/{objectId}
 */
export class SupabaseStorageProvider implements StorageProvider {
  public name = 'Supabase Cloud Storage (Bucket: vault-objects)';
  public mode: 'supabase' = 'supabase';
  private supabase: SupabaseClient | null = null;
  private bucket = 'vault-objects';
  private url: string;
  private key: string;

  constructor(url?: string, key?: string, bucket = 'vault-objects') {
    this.url = url || process.env.SUPABASE_URL || '';
    this.key = key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
    this.bucket = bucket;
  }

  public async init(): Promise<void> {
    if (!this.url || !this.key) {
      console.warn('[SupabaseStorageProvider] Missing SUPABASE_URL or key. Storage operations will fail.');
      return;
    }

    this.supabase = createClient(this.url, this.key, {
      auth: { persistSession: false },
    });

    try {
      // Check if bucket exists, or attempt creation if permission allows
      const { data: buckets, error } = await this.supabase.storage.listBuckets();
      if (!error && buckets) {
        const found = buckets.find(b => b.name === this.bucket);
        if (!found) {
          console.log(`[SupabaseStorageProvider] Creating bucket "${this.bucket}"...`);
          await this.supabase.storage.createBucket(this.bucket, { public: false });
        }
      }
    } catch (err) {
      console.warn('[SupabaseStorageProvider] Could not verify/create bucket automatically. Ensure "vault-objects" bucket exists.', err);
    }

    console.log(`[SupabaseStorageProvider] Initialized Supabase Storage bucket: "${this.bucket}"`);
  }

  private ensureClient(): SupabaseClient {
    if (!this.supabase) {
      if (this.url && this.key) {
        this.supabase = createClient(this.url, this.key, {
          auth: { persistSession: false },
        });
      } else {
        throw new Error(
          '[SupabaseStorageProvider] Supabase client not configured. Missing SUPABASE_URL or server secret key.'
        );
      }
    }
    return this.supabase;
  }

  private getReplicaPath(nodeId: string, objectId: string): string {
    return `${nodeId}/${objectId}`;
  }

  public async putObject(
    nodeId: string,
    objectId: string,
    data: Buffer | Uint8Array,
    mimeType = 'application/octet-stream'
  ): Promise<string> {
    const client = this.ensureClient();
    const storagePath = this.getReplicaPath(nodeId, objectId);
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

    const { error } = await client.storage
      .from(this.bucket)
      .upload(storagePath, buf, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      throw new Error(`[SupabaseStorageProvider] Failed to upload replica ${storagePath}: ${error.message}`);
    }

    return `${this.bucket}/${storagePath}`;
  }

  public async getObject(nodeId: string, objectId: string): Promise<Buffer> {
    const client = this.ensureClient();
    const storagePath = this.getReplicaPath(nodeId, objectId);

    const { data, error } = await client.storage
      .from(this.bucket)
      .download(storagePath);

    if (error || !data) {
      throw new Error(`[SupabaseStorageProvider] Failed to download replica ${storagePath}: ${error?.message || 'Not found'}`);
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  public async deleteObject(nodeId: string, objectId: string): Promise<void> {
    const client = this.ensureClient();
    const storagePath = this.getReplicaPath(nodeId, objectId);

    const { error } = await client.storage
      .from(this.bucket)
      .remove([storagePath]);

    if (error) {
      console.warn(`[SupabaseStorageProvider] Error deleting ${storagePath}:`, error.message);
    }
  }

  public async getObjectChecksum(nodeId: string, objectId: string): Promise<string> {
    const buf = await this.getObject(nodeId, objectId);
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  public async objectExists(nodeId: string, objectId: string): Promise<boolean> {
    const client = this.ensureClient();
    const storagePath = this.getReplicaPath(nodeId, objectId);
    const { data, error } = await client.storage.from(this.bucket).list(nodeId, {
      search: objectId,
    });

    if (error || !data) return false;
    return data.some(item => item.name === objectId);
  }

  public async corruptObject(nodeId: string, objectId: string): Promise<string> {
    const buf = await this.getObject(nodeId, objectId);
    const mutated = Buffer.from(buf);
    if (mutated.length > 0) {
      mutated[0] = mutated[0] ^ 0xff; // Invert first byte to simulate bitrot in cloud replica
    } else {
      mutated.write('CORRUPTED_BYTES');
    }

    await this.putObject(nodeId, objectId, mutated);
    return crypto.createHash('sha256').update(mutated).digest('hex');
  }
}
