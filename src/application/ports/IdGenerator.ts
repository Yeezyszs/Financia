/** Injetado para os testes conseguirem ids previsiveis. */
export interface IdGenerator {
  next(): string;
}

export const cryptoIdGenerator: IdGenerator = {
  next: () => crypto.randomUUID(),
};
