import { describe, expect, it } from 'vitest';
import { CreateInstallmentPlanUseCase } from '../../../src/application/use-cases/installments/CreateInstallmentPlanUseCase.js';
import { UpdateInstallmentPlanUseCase } from '../../../src/application/use-cases/installments/UpdateInstallmentPlanUseCase.js';
import { SetParcelaTransactionUseCase } from '../../../src/application/use-cases/installments/SetParcelaTransactionUseCase.js';
import { Transaction } from '../../../src/domain/entities/Transaction.js';
import { Money } from '../../../src/domain/value-objects/Money.js';
import {
  InMemoryAccountRepository,
  InMemoryInstallmentPlanRepository,
  InMemoryTransactionRepository,
  SequentialIds,
  USER_ID,
  makeCard,
} from '../../doubles/InMemoryRepositories.js';

function compra(id: string, description: string, cents: number, occurredOn = '2026-08-14') {
  return Transaction.create({
    id,
    userId: USER_ID,
    accountId: 'acc-card',
    occurredOn,
    description,
    amount: Money.fromCents(cents),
  });
}

function montar(transacoes: Transaction[] = []) {
  const plans = new InMemoryInstallmentPlanRepository();
  const accounts = new InMemoryAccountRepository([makeCard()]);
  const transactions = new InMemoryTransactionRepository(transacoes);
  const ids = new SequentialIds();
  return {
    plans,
    transactions,
    criar: new CreateInstallmentPlanUseCase(plans, accounts, transactions, ids),
    editar: new UpdateInstallmentPlanUseCase(plans, accounts, ids),
    ligar: new SetParcelaTransactionUseCase(plans, transactions),
  };
}

const PLANO = {
  userId: USER_ID,
  accountId: 'acc-card',
  description: 'Moto',
  totalCents: 61800,
  installments: 48,
  firstChargeOn: '2026-03-05',
};

describe('correção de um parcelamento', () => {
  it('recalcula o calendário e mantém o vínculo das parcelas que sobrevivem', async () => {
    // O caso que motivou a edição: o valor da parcela foi digitado no
    // lugar do total, e uma compra de R$ 618 em 6x virou 48 parcelas de
    // R$ 12,88 — quatro anos de número errado na tela.
    const linha = compra('t1', 'Moto - Parcela 1/6', -10300, '2026-03-05');
    const { criar, editar, plans } = montar([linha]);
    const { plan } = await criar.execute(PLANO);
    await plans.setTransaction({
      userId: USER_ID,
      planId: plan.id,
      number: 1,
      transactionId: 't1',
    });

    const { plan: corrigido, unlinked } = await editar.execute({
      userId: USER_ID,
      planId: plan.id,
      installments: 6,
    });

    expect(corrigido.parcelas).toHaveLength(6);
    expect(corrigido.monthlyCents).toBe(10300);
    // O vínculo da parcela 1 não tinha nada de errado, e continua lá.
    expect(corrigido.parcelas[0]?.transactionId).toBe('t1');
    expect(unlinked).toBe(0);
  });

  it('avisa quando encurtar o plano descarta um vínculo', async () => {
    const { criar, editar, plans } = montar();
    const { plan } = await criar.execute(PLANO);
    await plans.setTransaction({
      userId: USER_ID,
      planId: plan.id,
      number: 40,
      transactionId: 't-antiga',
    });

    const { plan: corrigido, unlinked } = await editar.execute({
      userId: USER_ID,
      planId: plan.id,
      installments: 6,
    });

    expect(corrigido.parcelas).toHaveLength(6);
    expect(unlinked).toBe(1);
  });

  it('renomear não mexe na chave de reconhecimento', async () => {
    // Chave e descrição são campos separados justamente para isto: dar
    // um nome legível ao parcelamento não pode fazer as cobranças que
    // ainda vêm deixarem de ser reconhecidas.
    const { criar, editar } = montar();
    const { plan } = await criar.execute(PLANO);

    const { plan: renomeado } = await editar.execute({
      userId: USER_ID,
      planId: plan.id,
      description: 'Moto do trabalho',
    });

    expect(renomeado.description).toBe('Moto do trabalho');
    expect(renomeado.merchantKey).toBe(plan.merchantKey);
  });

  it('a chave muda quando é ela que a pessoa edita', async () => {
    const { criar, editar } = montar();
    const { plan } = await criar.execute(PLANO);

    const { plan: ajustado } = await editar.execute({
      userId: USER_ID,
      planId: plan.id,
      merchantKey: 'HONDA MOTOS *CG160',
    });

    expect(ajustado.merchantKey).toBe('honda motos cg160');
  });
});

describe('vínculo feito à mão', () => {
  it('liga uma cobrança que a importação não reconheceu', async () => {
    // Sem "Parcela 2/6" na descrição, o automático não tem como saber.
    const linha = compra('t2', 'PAGAMENTO MOTO CG', -10300, '2026-04-05');
    const { criar, ligar } = montar([linha]);
    const { plan } = await criar.execute({ ...PLANO, installments: 6, totalCents: 61800 });

    const atualizado = await ligar.execute({
      userId: USER_ID,
      planId: plan.id,
      number: 2,
      transactionId: 't2',
    });

    expect(atualizado.parcelas[1]?.transactionId).toBe('t2');
    expect(atualizado.pagas).toHaveLength(1);
  });

  it('sobrescreve o vínculo automático, porque aqui a pessoa está corrigindo', async () => {
    const linha = compra('t3', 'Moto - Parcela 1/6', -10300, '2026-03-05');
    const outra = compra('t4', 'Moto - a de verdade', -10300, '2026-03-05');
    const { criar, ligar } = montar([linha, outra]);
    const { plan } = await criar.execute({ ...PLANO, installments: 6 });
    expect(plan.parcelas[0]?.transactionId).toBe('t3');

    const atualizado = await ligar.execute({
      userId: USER_ID,
      planId: plan.id,
      number: 1,
      transactionId: 't4',
    });

    expect(atualizado.parcelas[0]?.transactionId).toBe('t4');
  });

  it('a mesma cobrança não fica em duas parcelas', async () => {
    const linha = compra('t5', 'Moto', -10300, '2026-03-05');
    const { criar, ligar } = montar([linha]);
    const { plan } = await criar.execute({ ...PLANO, installments: 6 });

    await ligar.execute({ userId: USER_ID, planId: plan.id, number: 1, transactionId: 't5' });
    const atualizado = await ligar.execute({
      userId: USER_ID,
      planId: plan.id,
      number: 3,
      transactionId: 't5',
    });

    expect(atualizado.parcelas.filter((p) => p.transactionId === 't5')).toHaveLength(1);
    expect(atualizado.parcelas[2]?.transactionId).toBe('t5');
  });

  it('desliga sem tocar na transação', async () => {
    const linha = compra('t6', 'Moto - Parcela 1/6', -10300, '2026-03-05');
    const { criar, ligar, transactions } = montar([linha]);
    const { plan } = await criar.execute({ ...PLANO, installments: 6 });

    const atualizado = await ligar.execute({
      userId: USER_ID,
      planId: plan.id,
      number: 1,
      transactionId: null,
    });

    expect(atualizado.parcelas[0]?.transactionId).toBeNull();
    expect(await transactions.findById(USER_ID, 't6')).not.toBeNull();
  });

  it('recusa transação que não é do usuário', async () => {
    const { criar, ligar } = montar();
    const { plan } = await criar.execute({ ...PLANO, installments: 6 });

    await expect(
      ligar.execute({
        userId: USER_ID,
        planId: plan.id,
        number: 1,
        transactionId: 'de-outra-pessoa',
      }),
    ).rejects.toThrow();
  });
});

describe('parcelas já pagas sem lançamento', () => {
  it('cadastra uma compra que já vem correndo há meses', async () => {
    // O caso real: a moto está sendo paga desde março, e as faturas
    // desses meses nunca foram importadas. Sem isto o app diria que
    // falta pagar o valor inteiro.
    const { criar } = montar();
    const { plan } = await criar.execute({ ...PLANO, installments: 6, paidCount: 4 });

    expect(plan.pagas).toHaveLength(4);
    expect(plan.emAberto).toHaveLength(2);
    expect(plan.remainingCents).toBe(20600);
    // Nenhuma transação foi inventada para representar isso.
    expect(plan.parcelas.every((p) => p.transactionId === null)).toBe(true);
  });

  it('a baixa manual não impede o reconhecimento automático depois', async () => {
    const linha = compra('t7', 'Moto - Parcela 2/6', -10300, '2026-04-05');
    const { criar, ligar } = montar([linha]);
    const { plan } = await criar.execute({ ...PLANO, installments: 6, paidCount: 3 });

    const atualizado = await ligar.execute({
      userId: USER_ID,
      planId: plan.id,
      number: 2,
      transactionId: 't7',
    });

    expect(atualizado.parcelas[1]?.transactionId).toBe('t7');
    expect(atualizado.pagas).toHaveLength(3);
  });

  it('corrigir quantas foram pagas conta sempre do começo', async () => {
    const { criar, editar } = montar();
    const { plan } = await criar.execute({ ...PLANO, installments: 6, paidCount: 4 });

    const { plan: corrigido } = await editar.execute({
      userId: USER_ID,
      planId: plan.id,
      paidCount: 2,
    });

    expect(corrigido.parcelas.map((p) => p.settled)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('editar sem falar de pagas não desmarca o que estava marcado', async () => {
    const { criar, editar } = montar();
    const { plan } = await criar.execute({ ...PLANO, installments: 6, paidCount: 4 });

    const { plan: renomeado } = await editar.execute({
      userId: USER_ID,
      planId: plan.id,
      description: 'Moto do trabalho',
    });

    expect(renomeado.pagas).toHaveLength(4);
  });

  it('recusa mais pagas do que parcelas', async () => {
    const { criar, editar } = montar();
    const { plan } = await criar.execute({ ...PLANO, installments: 6 });

    await expect(
      editar.execute({ userId: USER_ID, planId: plan.id, paidCount: 9 }),
    ).rejects.toThrow();
  });
});
