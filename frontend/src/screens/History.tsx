import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, api } from '../api/client.js';
import type { Account, Drill, ImportRecord, ImportResult } from '../api/types.js';
import { date, dateTime } from '../format.js';
import { NewAccountForm } from '../components/NewAccountForm.js';

type Acao = 'flip' | 'delete';

/** O nome da conta é livre, então o banco vira explícito no seletor. */
function rotuloDoBanco(institution: Account['institution']): string {
  if (institution === 'c6') return 'C6 ·';
  if (institution === 'nubank') return 'Nubank ·';
  return '';
}

export function History({
  accounts,
  onImported,
  onAccountsChanged,
  onDrill,
}: {
  accounts: Account[];
  onImported: () => void;
  onAccountsChanged: () => void;
  /** Abre uma linha suspeita direto nas Transações, para conferir. */
  onDrill: (drill: Drill) => void;
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
  // Inverter e apagar são destrutivos demais para acontecer por um clique
  // errado, então a confirmação nasce no lugar do próprio botão.
  const [confirmando, setConfirmando] = useState<{ id: string; acao: Acao } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const inverterSinais = useCallback(
    async (importId: string) => {
      setOcupado(true);
      setAviso(null);
      try {
        const { affected } = await api.flipImportSigns(importId);
        setConfirmando(null);
        setAviso(
          affected === 1
            ? '1 transação teve o sinal invertido.'
            : `${affected} transações tiveram o sinal invertido.`,
        );
        onImported();
      } catch (err) {
        setAviso(err instanceof Error ? err.message : 'Não consegui inverter os sinais.');
      } finally {
        setOcupado(false);
      }
    },
    [onImported],
  );

  const apagar = useCallback(
    async (importId: string) => {
      setOcupado(true);
      setAviso(null);
      try {
        const { deletedTransactions } = await api.deleteImport(importId);
        setConfirmando(null);
        setAviso(
          deletedTransactions === 1
            ? 'Importação apagada, junto com 1 transação.'
            : `Importação apagada, junto com ${deletedTransactions} transações.`,
        );
        refresh();
        onImported();
      } catch (err) {
        setAviso(err instanceof Error ? err.message : 'Não consegui apagar a importação.');
      } finally {
        setOcupado(false);
      }
    },
    [onImported, refresh],
  );

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

  useEffect(() => {
    if (!aviso) return;
    const timer = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(timer);
  }, [aviso]);

  const accountName = new Map(accounts.map((account) => [account.id, account.name]));

  const acoes = (record: ImportRecord): ReactNode => {
    const podeInverter = record.status === 'completed' && record.rowsImported > 0;
    const emConfirmacao = confirmando?.id === record.id ? confirmando.acao : null;

    if (emConfirmacao) {
      const apagando = emConfirmacao === 'delete';
      return (
        <span className="confirmacao">
          <span className="confirmacao-texto">
            {apagando
              ? record.rowsImported > 0
                ? `Apagar as ${record.rowsImported} transações desta importação?`
                : 'Apagar este registro?'
              : 'Trocar despesas por receitas e vice-versa?'}
          </span>
          <button
            className={apagando ? 'ghost perigo' : 'ghost'}
            disabled={ocupado}
            onClick={() => void (apagando ? apagar(record.id) : inverterSinais(record.id))}
          >
            {apagando ? 'Apagar' : 'Inverter'}
          </button>
          <button className="link acao" onClick={() => setConfirmando(null)}>
            cancelar
          </button>
        </span>
      );
    }

    return (
      <span className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
        {podeInverter ? (
          <button
            className="link acao"
            title="Use quando o arquivo entrou com despesas e receitas trocadas"
            onClick={() => setConfirmando({ id: record.id, acao: 'flip' })}
          >
            Inverter sinais
          </button>
        ) : null}
        <button
          className="link acao"
          title="Apaga as transações que vieram deste arquivo e libera ele para ser importado de novo"
          onClick={() => setConfirmando({ id: record.id, acao: 'delete' })}
        >
          Apagar
        </button>
      </span>
    );
  };

  return (
    <>
      {aviso ? (
        <div className="toast" role="status">
          {aviso}
        </div>
      ) : null}

      <div className="page-head">
        <div>
          <h1 className="page-title">Histórico de importações</h1>
          <p className="page-subtitle">
            Suba o CSV exportado do app do banco. Linhas já importadas são descartadas
            automaticamente, então períodos sobrepostos não viram transação duplicada.
          </p>
        </div>
      </div>

      <div className="card stack" style={{ marginBottom: 20 }}>
        {accounts.length === 0 ? (
          <div className="stack">
            <div className="notice" style={{ marginBottom: 0 }}>
              Você ainda não tem nenhuma conta cadastrada. Crie uma para poder importar — o tipo da
              conta é o que define como o arquivo será lido: conta corrente lê o extrato, cartão lê
              a fatura.
            </div>
            <div className="row">
              <NewAccountForm onCreated={onAccountsChanged} accounts={accounts} />
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
                      {account.name} — {rotuloDoBanco(account.institution)}{' '}
                      {account.type === 'credit_card' ? 'fatura' : 'extrato'}
                    </option>
                  ))}
                </select>
              </div>
              <NewAccountForm onCreated={onAccountsChanged} accounts={accounts} />
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

            {result && result.suspectSigns.length > 0 ? (
              <div className="notice aviso">
                <b>
                  {result.suspectSigns.length}{' '}
                  {result.suspectSigns.length === 1 ? 'linha entrou' : 'linhas entraram'} com o
                  sinal em dúvida.
                </b>{' '}
                A descrição diz uma coisa e o valor diz outra — provavelmente uma saída gravada como
                entrada. Confira cada uma:
                <ul className="lista-suspeitos">
                  {result.suspectSigns.map((suspeito) => (
                    <li key={`${suspeito.occurredOn}-${suspeito.description}`}>
                      <button
                        className="link acao"
                        onClick={() =>
                          onDrill({
                            rotulo: 'Sinal em dúvida',
                            origem: 'Histórico',
                            search: suspeito.description,
                          })
                        }
                      >
                        {suspeito.description}
                      </button>{' '}
                      <span className="rec-meta">
                        {date(suspeito.occurredOn)} · entrou como{' '}
                        {suspeito.amountCents > 0 ? 'entrada' : 'saída'}, mas o texto diz{' '}
                        {suspeito.esperado === 'saida' ? 'saída' : 'entrada'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result ? (
              <div className="notice">
                <b>{result.rowsImported}</b> transações importadas de {result.rowsTotal} linhas ·{' '}
                <b>{result.rowsDuplicated}</b> já existiam · <b>{result.categorized}</b>{' '}
                categorizadas automaticamente
                {result.installmentsLinked > 0 ? (
                  <>
                    {' '}
                    · <b>{result.installmentsLinked}</b>{' '}
                    {result.installmentsLinked === 1
                      ? 'parcela reconhecida'
                      : 'parcelas reconhecidas'}
                  </>
                ) : null}
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

      <div className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Arquivos importados</h2>
            <p className="card-sub">
              {records.length === 0
                ? 'Nada importado ainda'
                : `${records.length} ${records.length === 1 ? 'importação' : 'importações'}`}
            </p>
          </div>
        </div>

        <div className="tx-list">
          {records.length === 0 ? (
            <div className="empty">Nenhuma importação ainda.</div>
          ) : (
            records.map((record) => {
              const falhou = record.status === 'failed';
              return (
                <article className="tx-item" key={record.id}>
                  <span
                    className="tx-dot"
                    style={{
                      background: falhou ? 'var(--red-light)' : 'var(--green-light)',
                      color: falhou ? 'var(--red)' : 'var(--green)',
                    }}
                    aria-hidden="true"
                  >
                    {falhou ? '!' : record.rowsImported}
                  </span>

                  <div className="tx-info">
                    <span className="tx-name">{record.filename}</span>
                    <div className="tx-meta">
                      <span>{dateTime(record.createdAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{accountName.get(record.accountId) ?? '—'}</span>
                      {record.periodStart ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {date(record.periodStart)} a{' '}
                            {date(record.periodEnd ?? record.periodStart)}
                          </span>
                        </>
                      ) : null}
                      {record.rowsDuplicated > 0 ? (
                        <span className="tag">{record.rowsDuplicated} já existiam</span>
                      ) : null}
                      {falhou ? <span className="pill pill-mudo">falhou</span> : null}
                    </div>
                    {record.errorMessage ? (
                      <div className="tx-meta" style={{ color: 'var(--red)' }}>
                        {record.errorMessage}
                      </div>
                    ) : null}
                    <div className="tx-meta">{acoes(record)}</div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
