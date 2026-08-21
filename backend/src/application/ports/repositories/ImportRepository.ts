import type { Import } from '../../../domain/entities/Import.js';

export interface ImportRepository {
  findById(userId: string, id: string): Promise<Import | null>;
  findByFileHash(userId: string, accountId: string, fileHash: string): Promise<Import | null>;
  listByUser(userId: string, options?: { limit?: number; offset?: number }): Promise<Import[]>;
  create(record: Import): Promise<Import>;
  update(record: Import): Promise<Import>;
}
