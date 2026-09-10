import type { SupabaseClient } from '@supabase/supabase-js';
import { InstallmentPlan, type Installment } from '../../../../domain/entities/InstallmentPlan.js';
import type { InstallmentPlanRepository } from '../../../../application/ports/repositories/InstallmentPlanRepository.js';

const PLANOS = 'installment_plans';
const PARCELAS = 'installments';

interface PlanoRow {
  id: string;
  user_id: string;
  account_id: string;
  description: string;
  merchant_key: string;
  total_cents: number;
  installments: number;
  first_charge_on: string;
  category_id: string | null;
}

interface ParcelaRow {
  id: string;
  plan_id: string;
  number: number;
  due_on: string;
  amount_cents: number;
  transaction_id: string | null;
}

function montar(plano: PlanoRow, parcelas: ParcelaRow[]): InstallmentPlan {
  return new InstallmentPlan({
    id: plano.id,
    userId: plano.user_id,
    accountId: plano.account_id,
    description: plano.description,
    merchantKey: plano.merchant_key,
    totalCents: Number(plano.total_cents),
    installments: plano.installments,
    firstChargeOn: plano.first_charge_on,
    categoryId: plano.category_id,
    parcelas: parcelas
      .filter((p) => p.plan_id === plano.id)
      .sort((a, b) => a.number - b.number)
      .map(
        (p): Installment => ({
          id: p.id,
          number: p.number,
          dueOn: p.due_on,
          amountCents: Number(p.amount_cents),
          transactionId: p.transaction_id,
        }),
      ),
  });
}

export class SupabaseInstallmentPlanRepository implements InstallmentPlanRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listByUser(userId: string): Promise<InstallmentPlan[]> {
    // Duas consultas em vez de um join aninhado: o PostgREST devolveria as
    // parcelas embutidas, mas com um shape que muda conforme o nome da
    // relação — dois selects simples envelhecem melhor.
    const [{ data: planos, error }, { data: parcelas, error: erroParcelas }] = await Promise.all([
      this.db.from(PLANOS).select('*').eq('user_id', userId).order('first_charge_on'),
      this.db.from(PARCELAS).select('*').eq('user_id', userId).order('number'),
    ]);
    if (error) throw error;
    if (erroParcelas) throw erroParcelas;

    return (planos as PlanoRow[]).map((plano) => montar(plano, parcelas as ParcelaRow[]));
  }

  async findById(userId: string, id: string): Promise<InstallmentPlan | null> {
    const { data, error } = await this.db
      .from(PLANOS)
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const { data: parcelas, error: erroParcelas } = await this.db
      .from(PARCELAS)
      .select('*')
      .eq('user_id', userId)
      .eq('plan_id', id);
    if (erroParcelas) throw erroParcelas;

    return montar(data as PlanoRow, parcelas as ParcelaRow[]);
  }

  async create(plan: InstallmentPlan): Promise<InstallmentPlan> {
    const props = plan.toJSON();

    const { error } = await this.db.from(PLANOS).insert({
      id: props.id,
      user_id: props.userId,
      account_id: props.accountId,
      description: props.description,
      merchant_key: props.merchantKey,
      total_cents: props.totalCents,
      installments: props.installments,
      first_charge_on: props.firstChargeOn,
      category_id: props.categoryId,
    });
    if (error) throw error;

    const { error: erroParcelas } = await this.db.from(PARCELAS).insert(
      props.parcelas.map((parcela) => ({
        id: parcela.id,
        user_id: props.userId,
        plan_id: props.id,
        number: parcela.number,
        due_on: parcela.dueOn,
        amount_cents: parcela.amountCents,
        transaction_id: parcela.transactionId,
      })),
    );
    if (erroParcelas) throw erroParcelas;

    return plan;
  }

  async update(plan: InstallmentPlan): Promise<InstallmentPlan> {
    const props = plan.toJSON();

    const { error } = await this.db
      .from(PLANOS)
      .update({
        account_id: props.accountId,
        description: props.description,
        merchant_key: props.merchantKey,
        total_cents: props.totalCents,
        installments: props.installments,
        first_charge_on: props.firstChargeOn,
        category_id: props.categoryId,
      })
      .eq('user_id', props.userId)
      .eq('id', props.id);
    if (error) throw error;

    // Encurtar o plano tira as parcelas que sobraram do calendário
    // antigo. Vai antes do upsert porque a unicidade é (plano, número):
    // deixar para depois arriscaria colidir com o que ainda está lá.
    const { error: erroSobra } = await this.db
      .from(PARCELAS)
      .delete()
      .eq('user_id', props.userId)
      .eq('plan_id', props.id)
      .gt('number', props.installments);
    if (erroSobra) throw erroSobra;

    const { error: erroParcelas } = await this.db.from(PARCELAS).upsert(
      props.parcelas.map((parcela) => ({
        id: parcela.id,
        user_id: props.userId,
        plan_id: props.id,
        number: parcela.number,
        due_on: parcela.dueOn,
        amount_cents: parcela.amountCents,
        transaction_id: parcela.transactionId,
      })),
      { onConflict: 'id' },
    );
    if (erroParcelas) throw erroParcelas;

    return plan;
  }

  async delete(userId: string, id: string): Promise<void> {
    // As parcelas saem por cascata (`plan_id ... on delete cascade`), e as
    // transações ficam onde estão: elas são fato do extrato, não do plano.
    const { error } = await this.db.from(PLANOS).delete().eq('user_id', userId).eq('id', id);
    if (error) throw error;
  }

  async linkTransaction(input: {
    userId: string;
    planId: string;
    number: number;
    transactionId: string;
  }): Promise<boolean> {
    // `is('transaction_id', null)` faz a condição valer no banco: duas
    // importações simultâneas não conseguem ligar a mesma parcela duas
    // vezes, e a reimportação não sobrescreve o vínculo existente.
    const { data, error } = await this.db
      .from(PARCELAS)
      .update({ transaction_id: input.transactionId })
      .eq('user_id', input.userId)
      .eq('plan_id', input.planId)
      .eq('number', input.number)
      .is('transaction_id', null)
      .select('id');
    if (error) throw error;

    return (data as { id: string }[]).length > 0;
  }

  async setTransaction(input: {
    userId: string;
    planId: string;
    number: number;
    transactionId: string | null;
  }): Promise<void> {
    // Sem o `is(null)` do vínculo automático: aqui a pessoa está
    // corrigindo, e corrigir é justamente sobrescrever.
    const { error } = await this.db
      .from(PARCELAS)
      .update({ transaction_id: input.transactionId })
      .eq('user_id', input.userId)
      .eq('plan_id', input.planId)
      .eq('number', input.number);
    if (error) throw error;
  }

  async clearTransaction(userId: string, transactionId: string): Promise<void> {
    const { error } = await this.db
      .from(PARCELAS)
      .update({ transaction_id: null })
      .eq('user_id', userId)
      .eq('transaction_id', transactionId);
    if (error) throw error;
  }
}
