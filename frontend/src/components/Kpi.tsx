import type { ReactNode } from 'react';
import { money } from '../format.js';

export interface Variacao {
  /** Percentual contra o mês anterior. */
  percent: number;
  /** Subir é ruim em despesa e bom em receita — quem sabe é quem chama. */
  subirEBom: boolean;
}

/**
 * Card de número da Visão geral.
 *
 * O chip de ícone colorido é o que dá ritmo à fileira: com quatro cards
 * de texto puro, o olho tem que ler os quatro rótulos para achar o que
 * procura. A variação contra o mês anterior fica embaixo porque um valor
 * sozinho não diz se o mês foi bom — R$ 8 mil de despesa é ótimo ou
 * péssimo dependendo do que foi o mês passado.
 */
export function Kpi({
  rotulo,
  valor,
  cor,
  tom,
  icone,
  carregando,
  variacao,
  nota,
}: {
  rotulo: string;
  valor: number;
  cor?: 'green' | 'red';
  tom: 'si-green' | 'si-red' | 'si-teal' | 'si-gold' | 'si-indigo';
  icone: ReactNode;
  carregando: boolean;
  variacao?: Variacao | null;
  nota?: string;
}): ReactNode {
  return (
    <div className="scard">
      <div className="scard-top">
        <span className="scard-label">{rotulo}</span>
        <span className={`scard-icon ${tom}`} aria-hidden="true">
          <svg viewBox="0 0 24 24">{icone}</svg>
        </span>
      </div>

      <div className={cor ? `scard-val ${cor}` : 'scard-val'}>
        {carregando ? (
          <span className="skeleton" style={{ width: 128, height: 24 }} />
        ) : (
          money(valor)
        )}
      </div>

      <p className="scard-change">
        {variacao ? (
          <span className={variacao.percent >= 0 === variacao.subirEBom ? 'ch-dn' : 'ch-up'}>
            {variacao.percent > 0 ? '↑' : variacao.percent < 0 ? '↓' : '='}{' '}
            {Math.abs(variacao.percent)}% vs. mês anterior
          </span>
        ) : null}
        {nota ? <span>{nota}</span> : null}
        {!variacao && !nota ? <span>—</span> : null}
      </p>
    </div>
  );
}
