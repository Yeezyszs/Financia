import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, api } from '../api/client.js';
import type { Account, ImportRecord, ImportResult } from '../api/types.js';
import { date, dateTime } from '../format.js';
import { NewAccountForm } from '../components/NewAccountForm.js';
import { MOBILE, useMediaQuery } from '../useMediaQuery.js';

export function History({
  accounts,
  onImported,
  onAccountsChanged,
}: {
  accounts: Account[];
  onImported: () => void;
  onAccountsChanged: () => void;
}): ReactNode {
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [accountId, setAccountId] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateFile, setDuplicateFile] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useMediaQuery(MOBILE);

  const refresh = useCallback(() => {
    api
      .imports()
      .then(setRecords)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(refresh, [refresh]);

  // As contas chegam de forma assíncrona: sem isso, entrar nesta tela
  // antes de elas carregarem deixava o seletor vazio para sempre.
  useEffect(() => {
    if (!accountId && accounts.length > 0) setAccountId(accounts[0]!.id);
  }, [accounts, accountId]);

  const upload = useCallback(
    async (name: string, content: string, force = false) => {
      setBusy(true);
      setError(null);
      setResult(null);

      try {
        const outcome = await api.createImport({
          accountId,
          filename: name,
          content,
          force,
        });
        setResult(outcome);
        setDuplicateFile(null);
        refresh();
        onImported();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'FILE_ALREADY_IMPORTED') {
          // Arquivo repetido não é erro fatal: pode ser reimportação
          // intencional, e o dedupe por linha segura a duplicata.
          setDuplicateFile({ name, content });
          setError(err.message);
        } else {
          setError(err instanceof Error ? err.message : 'Falha ao importar');
        }
      } finally {
        setBusy(false);
      }
    },
    [accountId, onImported, refresh],
  );

  const handleFile = useCallback(
    (file: File) => {
      if (!accountId) {
        setError('Escolha a conta antes de importar.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => void upload(file.name, String(reader.result ?? ''));
      reader.onerror = () => setError('Não consegui ler o arquivo.');
      reader.readAsText(file, 'utf-8');
    },
    [accountId, upload],
  );

  const accountName = new Map(accounts.map((account) => [account.id, account.name]));

  return (
    <>
      <h1 className="page-title">Histórico de importações</h1>
      <p className="page-subtitle">
        Suba o CSV exportado do app do banco. Linhas já importadas são descartadas automaticamente,
        então períodos sobrepostos não viram transação duplicada.
      </p>

      <div className="card stack" style={{ marginBottom: 20 }}>
        {accounts.length === 0 ? (
          <div className="stack">
            <div className="notice" style={{ marginBottom: 0 }}>
              Você ainda não tem nenhuma conta cadastrada. Crie uma para poder importar — o tipo da
              conta é o que define como o arquivo será lido: conta corrente lê o extrato, cartão lê
              a fatura.
            </div>
            <div className="row">
              <NewAccountForm onCreated={onAccountsChanged} />
            </div>
          </div>
        ) : (
          <>
            <div className="filters filters--upload">
              <div className="field">
                <label htmlFor="conta-import">Importar para</label>
                <select
                  id="conta-import"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} — {account.type === 'credit_card' ? 'fatura' : 'extrato'}
                    </option>
                  ))}
                </select>
              </div>
              <NewAccountForm onCreated={onAccountsChanged} />
            </div>

            <div
              className={dragging ? 'dropzone dragging' : 'dropzone'}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
              role="button"
              tabIndex={0}
              aria-label="Selecionar arquivo CSV para importar"
            >
              {busy ? 'Importando...' : 'Arraste o CSV aqui ou clique para escolher'}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />

            {error ? (
              <div className="notice error">
                {error}
                {duplicateFile ? (
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="ghost"
                      disabled={busy}
                      onClick={() => void upload(duplicateFile.name, duplicateFile.content, true)}
                    >
                      Importar mesmo assim
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {result ? (
              <div className="notice">
                <b>{result.rowsImported}</b> transações importadas de {result.rowsTotal} linhas ·{' '}
                <b>{result.rowsDuplicated}</b> já existiam · <b>{result.categorized}</b>{' '}
                categorizadas automaticamente
                {result.periodStart ? (
                  <>
                    {' '}
                    · período {date(result.periodStart)} a{' '}
                    {date(result.periodEnd ?? result.periodStart)}
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {isMobile ? (
        <div className="card-list">
          {records.length === 0 ? (
            <div className="card">
              <div className="empty">Nenhuma importação ainda.</div>
            </div>
          ) : (
            records.map((record) => (
              <article className="tx-card" key={record.id}>
                <div className="tx-card-top">
                  <span className="tx-desc">{record.filename}</span>
                  {record.status === 'failed' ? (
                    <span className="tag" style={{ color: 'var(--danger)' }}>
                      falhou
                    </span>
                  ) : (
                    <span className="num">
                      <b>{record.rowsImported}</b> importadas
                    </span>
                  )}
                </div>
                <div className="tx-card-meta">
                  <span>{dateTime(record.createdAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{accountName.get(record.accountId) ?? '—'}</span>
                  {record.periodStart ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {date(record.periodStart)} a {date(record.periodEnd ?? record.periodStart)}
                      </span>
                    </>
                  ) : null}
                  {record.rowsDuplicated > 0 ? (
                    <span className="tag">{record.rowsDuplicated} já existiam</span>
                  ) : null}
                </div>
                {record.errorMessage ? (
                  <div className="tx-card-meta" style={{ color: 'var(--danger)' }}>
                    {record.errorMessage}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Arquivo</th>
                <th>Conta</th>
                <th>Período</th>
                <th className="num">Importadas</th>
                <th className="num">Duplicadas</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">Nenhuma importação ainda.</div>
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{dateTime(record.createdAt)}</td>
                    <td>{record.filename}</td>
                    <td>{accountName.get(record.accountId) ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {record.periodStart
                        ? `${date(record.periodStart)} – ${date(record.periodEnd ?? record.periodStart)}`
                        : '—'}
                    </td>
                    <td className="num">{record.rowsImported}</td>
                    <td className="num">{record.rowsDuplicated}</td>
                    <td>
                      {record.status === 'failed' ? (
                        <span
                          className="tag"
                          title={record.errorMessage ?? ''}
                          style={{ color: 'var(--danger)' }}
                        >
                          falhou
                        </span>
                      ) : (
                        <span className="tag">
                          {record.status === 'completed' ? 'ok' : record.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
