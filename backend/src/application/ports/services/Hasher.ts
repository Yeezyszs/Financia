export interface Hasher {
  /** sha256 hex de um buffer/string — usado no file_hash do import. */
  hash(content: string | Uint8Array): string;
}
