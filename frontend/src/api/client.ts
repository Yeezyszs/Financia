import { supabase } from '../supabase.js';
import type {
  Account,
  Category,
  ImportRecord,
  ImportResult,
  Overview,
  Snapshot,
  Transaction,
  TransactionQuery,
} from './types.js';

/**
 * Toda chamada vai com o JWT da sessão do Supabase. O supabase-js cuida
 * de renovar o token antes de expirar, então basta pedir a sessão atual
 * a cada request.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Erro 500 carrega `detail` com a causa real — mostrar isso poupa ida ao log. */
function describe(
  error: { message?: string; code?: string; detail?: string } | undefined,
  status: number,
): string {
  if (!error) return `Falha na requisição (${status})`;
  return error.detail
    ? `${error.message ?? 'Erro'}: ${error.detail}`
    : (error.message ?? `Falha (${status})`);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...init.headers,
    },
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    const error = payload.error as { message?: string; code?: string; detail?: string } | undefined;
    throw new ApiError(describe(error, response.status), response.status, error?.code);
  }

  return (payload as { data: T }).data;
}

/** Igual ao request, mas devolve o envelope inteiro (data + meta). */
async function requestPage<T>(path: string): Promise<{ data: T; meta: PageMeta }> {
  const response = await fetch(`/api${path}`, { headers: await authHeaders() });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    const error = payload.error as { message?: string; code?: string; detail?: string } | undefined;
    throw new ApiError(describe(error, response.status), response.status, error?.code);
  }

  return payload as { data: T; meta: PageMeta };
}

export interface PageMeta {
  total: number;
  limit: number;
  offset: number;
}

function toQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }

  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export const api = {
  health: () => request<never>('/health'),
  accounts: () => request<Account[]>('/accounts'),
  categories: () => request<Category[]>('/categories'),

  overview: (query: { from?: string; to?: string; year?: number; accountIds?: string[] } = {}) =>
    request<Overview>(`/reports/overview${toQueryString(query)}`),

  transactions: (query: TransactionQuery = {}) =>
    requestPage<Transaction[]>(`/transactions${toQueryString(query as Record<string, unknown>)}`),

  createAccount: (body: { name: string; type: Account['type']; institution?: string }) =>
    request<Account>('/accounts', { method: 'POST', body: JSON.stringify(body) }),

  categorizeTransaction: (id: string, body: { categoryId: string | null; remember?: boolean }) =>
    request<{
      transaction: Transaction;
      learnedPattern: string | null;
      alsoUpdatedIds: string[];
    }>(`/transactions/${id}/category`, { method: 'PATCH', body: JSON.stringify(body) }),

  snapshot: (query: { month?: string; months?: number } = {}) =>
    request<Snapshot>(`/reports/snapshot${toQueryString(query)}`),

  /**
   * Resumo em markdown. Não passa pelo `request` porque a resposta é
   * texto, não o envelope JSON das demais rotas.
   */
  summaryMarkdown: async (query: { month?: string; months?: number } = {}): Promise<string> => {
    const response = await fetch(`/api/reports/summary${toQueryString(query)}`, {
      headers: await authHeaders(),
    });

    if (!response.ok) {
      // O status vai na mensagem: "tente de novo" não distingue rota
      // ausente de sessão expirada, e manda o usuário repetir algo que
      // nunca vai funcionar.
      throw new ApiError(`A API respondeu ${response.status} ao gerar o resumo.`, response.status);
    }

    return response.text();
  },

  imports: () => request<ImportRecord[]>('/imports'),

  createImport: (body: { accountId: string; filename: string; content: string; force?: boolean }) =>
    request<ImportResult>('/imports', { method: 'POST', body: JSON.stringify(body) }),
};
