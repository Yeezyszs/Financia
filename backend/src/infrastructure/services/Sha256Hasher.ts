import { createHash } from 'node:crypto';
import type { Hasher } from '../../application/ports/services/Hasher.js';

export class Sha256Hasher implements Hasher {
  hash(content: string | Uint8Array): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
