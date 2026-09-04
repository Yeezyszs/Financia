import { useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { AccountType, Institution } from '../api/types.js';

/**
 * Criar conta faltava na UI: a API sempre teve o endpoint, mas o único
 * jeito de cadastrar era pelo banco. Um usuário novo ficava com o
 * seletor de importação vazio e nenhuma saída pela tela.
 */
export function NewAccountForm({ onCreated }: { onCreated: () => void }): ReactNode {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [institution, setInstitution] = useState<Institution>('nubank');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await api.createAccount({ name: name.trim(), type, institution });
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
