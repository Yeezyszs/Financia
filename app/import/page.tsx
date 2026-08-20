import Link from 'next/link';
import { buildContainer } from '@/src/infrastructure/config/container';
import { env } from '@/src/infrastructure/config/env';
import { ImportForm } from './ImportForm';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const { repositories } = buildContainer();
  const accounts = await repositories.accounts.listByOwner(env.defaultOwnerId);

  return (
    <main>
      <header>
        <h1>Importar extrato</h1>
        <p>
          <Link href="/">&larr; voltar para as transacoes</Link>
        </p>
      </header>

      {accounts.length === 0 ? (
        <p className="empty">
          Nenhuma conta cadastrada ainda. Crie uma na tabela <code>accounts</code> antes de importar.
        </p>
      ) : (
        <ImportForm
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, institution: a.institution }))}
        />
      )}

      <section className="help">
        <h2>Onde baixar o arquivo</h2>
        <ul>
          <li>
            <strong>Nubank</strong> — app ou site, fatura do cartao, &ldquo;Exportar fatura&rdquo; em CSV.
          </li>
          <li>
            <strong>C6</strong> — app, fatura, exportar em CSV ou Excel.
          </li>
        </ul>
        <p>
          Reimportar o mesmo arquivo e seguro: cada linha tem identidade derivada de conta, data,
          estabelecimento e valor, entao o que ja existe e ignorado em vez de duplicado.
        </p>
      </section>
    </main>
  );
}
