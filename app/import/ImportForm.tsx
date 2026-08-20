'use client';

import { useActionState } from 'react';
import { importStatement, type ImportState } from './actions';

interface Props {
  accounts: Array<{ id: string; name: string; institution: string }>;
}

export function ImportForm({ accounts }: Props) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importStatement, null);

  return (
    <>
      <form action={formAction} className="import-form">
        <label>
          Conta de destino
          <select name="accountId" required defaultValue={accounts[0]?.id ?? ''}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.institution})
              </option>
            ))}
          </select>
        </label>

        <label>
          Arquivo CSV
          <input type="file" name="file" accept=".csv,text/csv" required />
        </label>

        <button type="submit" disabled={pending || accounts.length === 0}>
          {pending ? 'Importando...' : 'Importar'}
        </button>
      </form>

      {state?.error && <p className="result error">{state.error}</p>}

      {state?.report && (
        <div className="result">
          <p>
            Formato reconhecido: <strong>{state.report.institution}</strong>
          </p>
          <ul>
            <li>{state.report.imported} importadas</li>
            {/* Duplicata nao e erro: e a reimportacao funcionando como deve. */}
            <li>{state.report.duplicates} ja existiam (ignoradas)</li>
            <li>{state.report.skipped} linhas sem transacao (rodape, totais)</li>
          </ul>
          {state.report.failures.length > 0 && (
            <details>
              <summary>{state.report.failures.length} linha(s) com erro</summary>
              <ul>
                {state.report.failures.map((f) => (
                  <li key={f.line}>
                    linha {f.line}: {f.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </>
  );
}
