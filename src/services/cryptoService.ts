/**
 * Cryptographic helper using Web Crypto API for authentic SHA-256 checksums
 */

export async function computeSHA256(data: string | ArrayBuffer): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data).buffer;
  } else {
    buffer = data;
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateCorruptedChecksum(originalChecksum: string): string {
  // Flip characters deterministically to simulate bitrot/silent corruption
  const chars = originalChecksum.split('');
  for (let i = 0; i < 6; i++) {
    const idx = (i * 7 + 3) % chars.length;
    chars[idx] = chars[idx] === 'a' ? 'f' : chars[idx] === '0' ? '9' : 'x';
  }
  return chars.join('');
}

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatTimeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 2) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}
