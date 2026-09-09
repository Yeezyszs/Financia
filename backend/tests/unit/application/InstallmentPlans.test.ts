import { describe, expect, it } from 'vitest';
import { CreateInstallmentPlanUseCase } from '../../../src/application/use-cases/installments/CreateInstallmentPlanUseCase.js';
import { ListInstallmentPlansUseCase } from '../../../src/application/use-cases/installments/ListInstallmentPlansUseCase.js';
import { LinkInstallmentsService } from '../../../src/application/use-cases/installments/LinkInstallmentsService.js';
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
  const transactions = new InMemoryTransactionRepository(transacoes);
  const criar = new CreateInstallmentPlanUseCase(
    plans,
    new InMemoryAccountRepository([makeCard()]),
    transactions,
    new SequentialIds(),
  );
  return { plans, transactions, criar, listar: new ListInstallmentPlansUseCase(plans) };
}

const PLANO = {
  userId: USER_ID,
  accountId: 'acc-card',
  description: 'App*Upsaintgermainb',
  totalCents: 38988,
  installments: 6,
  firstChargeOn: '2026-05-14',
};

describe('cadastro de compra parcelada', () => {
  it('gera as parcelas e casa com as compras que já estavam no banco', async () => {
    // As duas primeiras já vieram em faturas anteriores — quem lembra de
    // cadastrar o parcelamento é quem já viu a cobrança aparecer.
    const { criar } = montar([
      compra('t1', 'App*Upsaintgermainb - Parcela 1/6', -6498, '2026-05-14'),
      compra('t2', 'App*Upsaintgermainb - Parcela 2/6', -6498, '2026-06-14'),
      compra('t3', 'Ebn *Playstation - Parcela 2/4', -7497, '2026-06-14'),
    ]);

    const { plan, linked } = await criar.execute(PLANO);

    expect(plan.installments).toBe(6);
    expect(linked).toBe(2);
    expect(plan.pagas.map((p) => p.number)).toEqual([1, 2]);
    // A do Playstation é outro parcelamento e não pode ter sido pega.
    expect(plan.emAberto).toHaveLength(4);
  });

  it('o que falta é o que ainda vai ser cobrado, não o total', async () => {
    const { criar } = montar([compra('t1', 'App*Upsaintgermainb - Parcela 1/6', -6498)]);
    const { plan } = await criar.execute(PLANO);

    // 38988 no total, uma parcela de 6498 já paga.
    expect(plan.remainingCents).toBe(38988 - 6498);
    expect(plan.monthlyCents).toBe(6498);
  });

  it('a fatura seguinte alimenta o plano sozinha', async () => {
    const { criar, plans } = montar();
    const { plan } = await criar.execute(PLANO);
    expect(plan.pagas).toHaveLength(0);

    // Chega a importação de agosto.
    const ligadas = await new LinkInstallmentsService(plans).ligar({
      userId: USER_ID,
      linhas: [
        { id: 'nova-1', description: 'App*Upsaintgermainb - Parcela 4/6' },
        { id: 'nova-2', description: 'Netflix.com' },
      ],
    });

    expect(ligadas).toBe(1);
    const atualizado = await plans.findById(USER_ID, plan.id);
    expect(atualizado?.pagas.map((p) => p.number)).toEqual([4]);
  });

  it('reimportar a mesma fatura não conta a parcela duas vezes', async () => {
    const { criar, plans } = montar();
    await criar.execute(PLANO);
    const servico = new LinkInstallmentsService(plans);
    const linha = [{ id: 'nova-1', description: 'App*Upsaintgermainb - Parcela 4/6' }];

    expect(await servico.ligar({ userId: USER_ID, linhas: linha })).toBe(1);
    expect(await servico.ligar({ userId: USER_ID, linhas: linha })).toBe(0);
  });

  it('o resumo separa o que está aberto do que já foi quitado', async () => {
    const { criar, listar } = montar([compra('t1', 'App*Upsaintgermainb - Parcela 1/6', -6498)]);
    await criar.execute(PLANO);
    await criar.execute({
      ...PLANO,
      description: 'Ebn *Playstation',
      totalCents: 29988,
      installments: 4,
    });

    const resumo = await listar.execute({ userId: USER_ID });

    expect(resumo.openPlans).toBe(2);
    expect(resumo.remainingCents).toBe(38988 - 6498 + 29988);
    expect(resumo.monthlyCents).toBe(6498 + 7497);
  });

  it('recusa parcelamento de uma parcela só', async () => {
    const { criar } = montar();
    await expect(criar.execute({ ...PLANO, installments: 1 })).rejects.toThrow(/2 parcelas/);
  });
});
