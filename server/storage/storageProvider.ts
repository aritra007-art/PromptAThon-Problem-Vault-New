export interface StorageProvider {
  name: string;
  mode: 'local' | 'supabase';
  init(): Promise<void>;

  /**
   * Put replica object bytes into a specific storage node/domain.
   */
  putObject(nodeId: string, objectId: string, data: Buffer | Uint8Array, mimeType?: string): Promise<string>;

  /**
   * Read raw replica object bytes from a specific storage node/domain.
   */
  getObject(nodeId: string, objectId: string): Promise<Buffer>;

  /**
   * Delete replica object bytes from a specific storage node/domain.
   */
  deleteObject(nodeId: string, objectId: string): Promise<void>;

  /**
   * Compute actual SHA-256 cryptographic hash of bytes residing on the node/domain.
   */
  getObjectChecksum(nodeId: string, objectId: string): Promise<string>;

  /**
   * Check whether the object exists on the node/domain.
   */
  objectExists(nodeId: string, objectId: string): Promise<boolean>;

  /**
   * Corrupt replica bytes directly on storage to simulate bitrot/tampering.
   */
  corruptObject(nodeId: string, objectId: string): Promise<string>;
}
