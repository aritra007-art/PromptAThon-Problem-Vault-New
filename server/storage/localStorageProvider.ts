import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StorageProvider } from './storageProvider';

/**
 * LocalStorageProvider
 * Stores replica payloads on the local filesystem under storage/node1, storage/node2, etc.
 * Supports authentic independent storage directories for local hackathon demo.
 */
export class LocalStorageProvider implements StorageProvider {
  public name = 'Local Filesystem Storage (4 Independent Directories)';
  public mode: 'local' = 'local';
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), 'storage');
  }

  public async init(): Promise<void> {
    const nodeDirs = ['node1', 'node2', 'node3', 'node4'];
    for (const n of nodeDirs) {
      const dirPath = path.join(this.baseDir, n);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
    console.log('[LocalStorageProvider] Initialized 4 local storage node directories at:', this.baseDir);
  }

  private getNodeFolder(nodeId: string): string {
    const cleaned = nodeId.replace('-', ''); // 'node-1' -> 'node1'
    return path.join(this.baseDir, cleaned);
  }

  private getObjectPath(nodeId: string, objectId: string): string {
    return path.join(this.getNodeFolder(nodeId), objectId);
  }

  public async putObject(
    nodeId: string,
    objectId: string,
    data: Buffer | Uint8Array,
    _mimeType?: string
  ): Promise<string> {
    const folder = this.getNodeFolder(nodeId);
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }

    const filePath = this.getObjectPath(nodeId, objectId);
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    fs.writeFileSync(filePath, buf);

    return `storage/${nodeId.replace('-', '')}/${objectId}`;
  }

  public async getObject(nodeId: string, objectId: string): Promise<Buffer> {
    const filePath = this.getObjectPath(nodeId, objectId);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Object ${objectId} not found on node ${nodeId}`);
    }
    return fs.readFileSync(filePath);
  }

  public async deleteObject(nodeId: string, objectId: string): Promise<void> {
    const filePath = this.getObjectPath(nodeId, objectId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  public async getObjectChecksum(nodeId: string, objectId: string): Promise<string> {
    const buf = await this.getObject(nodeId, objectId);
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  public async objectExists(nodeId: string, objectId: string): Promise<boolean> {
    const filePath = this.getObjectPath(nodeId, objectId);
    return fs.existsSync(filePath);
  }

  public async corruptObject(nodeId: string, objectId: string): Promise<string> {
    const buf = await this.getObject(nodeId, objectId);
    const mutated = Buffer.from(buf);
    if (mutated.length > 0) {
      mutated[0] = mutated[0] ^ 0xff; // Invert first byte to simulate bitrot
    } else {
      mutated.write('CORRUPTED_BYTES');
    }
    const filePath = this.getObjectPath(nodeId, objectId);
    fs.writeFileSync(filePath, mutated);

    return crypto.createHash('sha256').update(mutated).digest('hex');
  }
}
