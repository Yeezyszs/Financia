import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root não encontrado no index.html');

function mostrarErroDeConfiguracao(error: unknown): void {
  const box = document.createElement('div');
  box.className = 'gate';
  box.innerHTML =
    '<div class="card gate-card stack">' +
    '<h1 class="page-title" style="margin:0">Financia</h1>' +
    '<p style="margin:0">O app não conseguiu iniciar por um problema de configuração:</p>' +
    '<div class="notice error"></div>' +
    '</div>';

  const notice = box.querySelector('.notice');
  if (notice) notice.textContent = error instanceof Error ? error.message : String(error);

  container!.replaceChildren(box);
}

/**
 * O App é carregado sob demanda porque erro de configuração estoura no
 * import do cliente do Supabase, antes de o React existir. Sem esse
 * catch, o resultado seria uma página em branco — o pior jeito possível
 * de descobrir que faltou (ou veio errada) uma variável de ambiente.
 */
void import('./App.js')
  .then(({ App }) => {
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch(mostrarErroDeConfiguracao);
