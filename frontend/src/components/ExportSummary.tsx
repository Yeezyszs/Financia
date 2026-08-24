import { useState, type ReactNode } from 'react';
import { api } from '../api/client.js';

type Estado = 'idle' | 'gerando' | 'copiado' | 'falhou';

/**
 * Leva o retrato financeiro para fora do app, pronto para colar numa
 * conversa com um assistente.
 *
 * A alternativa seria chamar a API de dentro do app, o que custaria
 * crédito por análise e devolveria um texto só, sem chance de perguntar
 * "por quê". Colar numa conversa mantém a ida e volta — que é onde
 * conselho financeiro fica bom — e não custa nada.
 */
export function ExportSummary({ month }: { month: string }): ReactNode {
  const [estado, setEstado] = useState<Estado>('idle');
  const [texto, setTexto] = useState('');

  async function exportar(): Promise<void> {
    setEstado('gerando');

    try {
      const markdown = await api.summaryMarkdown({ month, months: 6 });
      setTexto(markdown);

      // A área de transferência pode ser negada (permissão, navegador
      // antigo, contexto não seguro). Nesse caso mostramos o texto para
      // seleção manual em vez de deixar o clique sem efeito.
      await navigator.clipboard.writeText(markdown);
      setEstado('copiado');
      setTimeout(() => setEstado((atual) => (atual === 'copiado' ? 'idle' : atual)), 6000);
    } catch {
      setEstado('falhou');
    }
  }

  function baixar(): void {
    const blob = new Blob([texto], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financia-${month}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack">
      <div className="row">
        <button className="primary" onClick={() => void exportar()} disabled={estado === 'gerando'}>
          {estado === 'gerando' ? 'Gerando...' : 'Copiar resumo para análise'}
        </button>
        {texto ? (
          <button className="ghost" onClick={baixar}>
            Baixar .md
          </button>
        ) : null}
      </div>

      {estado === 'copiado' ? (
        <div className="notice" role="status">
          Copiado. Cole numa conversa com o Claude — o texto já vai com o contexto e as perguntas.
        </div>
      ) : null}

      {estado === 'falhou' && texto ? (
        <div className="stack">
          <div className="notice">
            Seu navegador não deixou copiar automaticamente. Selecione o texto abaixo ou baixe o
            arquivo.
          </div>
          <textarea className="export-text" readOnly value={texto} rows={10} />
        </div>
      ) : null}

      {estado === 'falhou' && !texto ? (
        <div className="notice error">Não consegui gerar o resumo. Tente de novo.</div>
      ) : null}
    </div>
  );
}
