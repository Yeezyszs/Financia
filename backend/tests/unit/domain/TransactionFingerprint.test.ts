import { describe, expect, it } from 'vitest';
import {
  assignOrdinals,
  buildFingerprint,
  normalizeDescription,
} from '../../../src/domain/value-objects/TransactionFingerprint.js';

const base = {
  accountId: 'acc-1',
  occurredOn: '2026-08-01',
  description: 'Padaria São Jorge',
  amountCents: -850,
};

describe('fingerprint de transação', () => {
  it('é estável para a mesma linha (reimportar não duplica)', () => {
    expect(buildFingerprint(base)).toBe(buildFingerprint({ ...base }));
  });

  it('ignora acento, caixa e pontuação do título', () => {
    expect(buildFingerprint(base)).toBe(
      buildFingerprint({ ...base, description: 'PADARIA SAO JORGE!' }),
    );
  });

  it('muda quando conta, data ou valor mudam', () => {
    expect(buildFingerprint({ ...base, accountId: 'acc-2' })).not.toBe(buildFingerprint(base));
    expect(buildFingerprint({ ...base, occurredOn: '2026-08-02' })).not.toBe(
      buildFingerprint(base),
    );
    expect(buildFingerprint({ ...base, amountCents: -851 })).not.toBe(buildFingerprint(base));
  });

  it('distingue compras idênticas no mesmo dia pelo ordinal', () => {
    expect(buildFingerprint({ ...base, ordinal: 1 })).not.toBe(
      buildFingerprint({ ...base, ordinal: 0 }),
    );
  });

  it('atribui ordinais na ordem do arquivo', () => {
    const rows = ['a', 'b', 'a', 'a'];
    expect(assignOrdinals(rows, (r) => r)).toEqual([0, 0, 1, 2]);
  });

  it('normaliza descrição', () => {
    expect(normalizeDescription('  Café   da  Manhã - 2x ')).toBe('cafe da manha 2x');
  });
});
