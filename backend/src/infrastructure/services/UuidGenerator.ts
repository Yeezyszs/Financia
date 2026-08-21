import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '../../application/ports/services/IdGenerator.js';

export class UuidGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}
