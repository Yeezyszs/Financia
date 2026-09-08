import { useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { Account, AccountType, Institution } from '../api/types.js';

/**
 * Criar conta faltava na UI: a API sempre teve o endpoint, mas o único
 * jeito de cadastrar era pelo banco. Um usuário novo ficava com o
 * seletor de importação vazio e nenhuma saída pela tela.
 */
export function NewAccountForm({
  onCreated,
  accounts = [],
}: {
  onCreated: () => void;
  /** Para o cartão apontar qual conta corrente paga a fatura dele. */
  accounts?: Account[];
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [institution, setInstitution] = useState<Institution>('nubank');
  const [settlementAccountId, setSettlementAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await api.createAccount({
        name: name.trim(),
        type,
        institution,
        // Só cartão tem conta de quitação: informar isso numa conta
        // corrente é recusado pelo domínio, e com razão.
        ...(type === 'credit_card' && settlementAccountId ? { settlementAccountId } : {}),
      });
      setName('');
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui criar a conta');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="ghost" onClick={() => setOpen(true)}>
        Nova conta
      </button>
    );
  }

  return (
    <form className="row" onSubmit={submit} style={{ alignItems: 'flex-end' }}>
      <div className="field">
        <label htmlFor="nova-conta-nome">Nome da conta</label>
        <input
          id="nova-conta-nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nubank Conta Corrente"
          autoFocus
          required
        />
      </div>

      <div className="field">
        <label htmlFor="nova-conta-banco">Banco</label>
        <select
          id="nova-conta-banco"
          value={institution}
          onChange={(e) => setInstitution(e.target.value as Institution)}
        >
          <option value="nubank">Nubank</option>
          <option value="c6">C6</option>
          <option value="manual">Outro (só lançamento manual)</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="nova-conta-tipo">Tipo</label>
        <select
          id="nova-conta-tipo"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
        >
          <option value="checking">Conta corrente (extrato)</option>
          <option value="credit_card">Cartão de crédito (fatura)</option>
        </select>
      </div>

      {type === 'credit_card' && accounts.some((a) => a.type === 'checking') ? (
        <div className="field">
          <label htmlFor="nova-conta-quitacao">Fatura sai de</label>
          <select
            id="nova-conta-quitacao"
            value={settlementAccountId}
            onChange={(e) => setSettlementAccountId(e.target.value)}
          >
            <option value="">Não sei ainda</option>
            {accounts
              .filter((account) => account.type === 'checking')
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </div>
      ) : null}

      <button className="primary" type="submit" disabled={busy || !name.trim()}>
        {busy ? 'Criando...' : 'Criar'}
      </button>
      <button type="button" className="ghost" onClick={() => setOpen(false)} disabled={busy}>
        Cancelar
      </button>

      {error ? (
        <div className="notice error" style={{ width: '100%', marginBottom: 0 }}>
          {error}
        </div>
      ) : null}
    </form>
  );
}
