import type {
  Account,
  Category,
  ImportRecord,
  ImportResult,
  Overview,
  Transaction,
  TransactionQuery,
} from './types.js';

const TOKEN_KEY = 'financia:token';

/**
 * O token de acesso da API é digitado pelo usuário e fica no
 * localStorage — nunca embutido no bundle, que é público. É a trava
 * temporária até entrar login pelo Supabase Auth.
 */
export const tokenStorage = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* navegador com storage bloqueado: a sessão vive só nesta aba */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* nada a fazer */
    }
  },
};

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStorage.get();

  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-api-key': token } : {}),
      ...init.headers,
    },
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    const error = payload.error as { message?: string; code?: string } | undefined;
    throw new ApiError(
      error?.message ?? `Falha na requisição (${response.status})`,
      response.status,
      error?.code,
    );
  }

  return (payload as { data: T }).data;
}

/** Igual ao request, mas devolve o envelope inteiro (data + meta). */
async function requestPage<T>(path: string): Promise<{ data: T; meta: PageMeta }> {
  const token = tokenStorage.get();

  const response = await fetch(`/api${path}`, {
    headers: token ? { 'x-api-key': token } : {},
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    const error = payload.error as { message?: string; code?: string } | undefined;
    throw new ApiError(
      error?.message ?? `Falha na requisição (${response.status})`,
      response.status,
      error?.code,
    );
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

  imports: () => request<ImportRecord[]>('/imports'),

  createImport: (body: { accountId: string; filename: string; content: string; force?: boolean }) =>
    request<ImportResult>('/imports', { method: 'POST', body: JSON.stringify(body) }),
};
