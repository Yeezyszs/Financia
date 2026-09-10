import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { InstallmentPlan, Transaction } from '../api/types.js';
import { date, money } from '../format.js';

/**
 * O calendário de um parcelamento, parcela por parcela, com o vínculo
 * de cada uma editável à mão.
 *
 * O reconhecimento automático depende da marca "4/6" na descrição, e
 * nem todo banco a escreve — a compra parcelada de uma moto pode chegar
 * como doze linhas idênticas, sem nada que diga qual é qual. Quando o
 * automático não dá conta, é aqui que a pessoa aponta o lançamento, sem
 * ter que inventar dado nenhum nem duplicar a despesa.
 */
export function PlanoParcelas({
  plano,
  onMudou,
}: {
  plano: InstallmentPlan;
  onMudou: (plano: InstallmentPlan) => void;
}): ReactNode {
  const [candidatas, setCandidatas] = useState<Transaction[] | null>(null);
  const [busca, setBusca] = useState('');
  const [escolhendo, setEscolhendo] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // As cobranças do próprio cartão do plano. Servem para duas coisas ao
  // mesmo tempo: mostrar o que já está ligado e oferecer o que ligar.
  // Só saídas entram na oferta: parcela é cobrança, e um estorno na
  // lista seria só uma forma de errar mais rápido.
  const carregar = useCallback(
    (termo: string) => {
      api
        .transactions({
          accountIds: [plano.accountId],
          ...(termo.trim() ? { search: termo.trim() } : {}),
          limit: 60,
        })
        .then((pagina) => setCandidatas(pagina.data))
        .catch((err: Error) => setErro(err.message));
    },
    [plano.accountId],
  );

  useEffect(() => carregar(''), [carregar]);

  // Busca digitada espera o dedo parar: uma request por tecla castiga
  // o servidor e faz a lista piscar.
  useEffect(() => {
    if (busca === '') return;
    const timer = setTimeout(() => carregar(busca), 350);
    return () => clearTimeout(timer);
  }, [busca, carregar]);

  const porId = new Map((candidatas ?? []).map((t) => [t.id, t]));

  async function ligar(numero: number, transactionId: string | null): Promise<void> {
    setSalvando(true);
    setErro(null);
    try {
      const { plan } = await api.linkParcela(plano.id, numero, transactionId);
      onMudou(plan);
      setEscolhendo(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui mudar o vínculo.');
    } finally {
      setSalvando(false);
    }
  }

  // Uma cobrança só pode estar em uma parcela: as já usadas saem da
  // lista de opções, senão o clique parece funcionar e desfaz outra.
  const usadas = new Set(
    plano.parcelas
      .map((parcela) => parcela.transactionId)
      .filter((id): id is string => id !== null),
  );

  return (
    <div className="parcela-tabela">
      {erro ? <div className="notice error">{erro}</div> : null}

      {plano.parcelas.map((parcela) => {
        const ligada = parcela.transactionId ? porId.get(parcela.transactionId) : undefined;

        return (
          <div className="parcela-linha" key={parcela.number}>
            <span className="parcela-num">
              {parcela.number}/{plano.installments}
            </span>
            <span className="parcela-data">{date(parcela.dueOn)}</span>
            <span className="parcela-valor">{money(parcela.amountCents)}</span>

            <span className="parcela-vinculo">
              {parcela.transactionId ? (
                <>
                  <span className="tag tag-parcela">paga</span>{' '}
                  {ligada ? (
                    <span title={ligada.description}>
                      {ligada.description} · {date(ligada.occurredOn)}
                    </span>
                  ) : (
                    // A cobrança existe, mas está fora das 60 que vieram
                    // — não é motivo para a linha mentir que está solta.
                    <span>lançamento ligado</span>
                  )}
                  <button
                    className="link acao"
                    disabled={salvando}
                    onClick={() => void ligar(parcela.number, null)}
                  >
                    desligar
                  </button>
                </>
              ) : escolhendo === parcela.number ? (
                <span className="parcela-escolha">
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar na fatura..."
                    aria-label={`Buscar lançamento para a parcela ${parcela.number}`}
                    autoFocus
                  />
                  <span className="parcela-opcoes">
                    {(candidatas ?? [])
                      .filter((t) => !usadas.has(t.id) && t.amountCents < 0)
                      .slice(0, 8)
                      .map((t) => (
                        <button
                          key={t.id}
                          className="parcela-opcao"
                          disabled={salvando}
                          onClick={() => void ligar(parcela.number, t.id)}
                        >
                          <span>{t.description}</span>
                          <span className="parcela-opcao-meta">
                            {date(t.occurredOn)} · {money(t.amountCents)}
                          </span>
                        </button>
                      ))}
                    {candidatas &&
                    candidatas.filter((t) => !usadas.has(t.id) && t.amountCents < 0).length ===
                      0 ? (
                      <span className="parcela-vazio">
                        Nenhum lançamento encontrado nesta conta.
                      </span>
                    ) : null}
                  </span>
                  <button className="link acao" onClick={() => setEscolhendo(null)}>
                    cancelar
                  </button>
                </span>
              ) : (
                <button
                  className="link acao"
                  onClick={() => {
                    setBusca('');
                    setEscolhendo(parcela.number);
                  }}
                >
                  ligar a um lançamento
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
