import type { EmailGateway, EmailSearchQuery } from '../../../application/ports/EmailGateway';
import type { RawEmail } from '../../../application/ports/EmailParser';
import type { TokenProvider } from './GoogleOAuthTokenProvider';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
}

/**
 * Implementacao do EmailGateway em cima da REST API do Gmail. Usa fetch puro
 * em vez do pacote googleapis: uma dependencia a menos, e o googleapis pesa
 * ~50MB, o que conta no cold start de serverless.
 */
export class GmailClient implements EmailGateway {
  constructor(private readonly tokens: TokenProvider) {}

  async search(query: EmailSearchQuery): Promise<RawEmail[]> {
    const params = new URLSearchParams({
      q: query.after ? `${query.query} after:${toGmailDate(query.after)}` : query.query,
      maxResults: String(query.maxResults ?? 50),
    });

    const list = await this.request<{ messages?: Array<{ id: string }> }>(`/messages?${params}`);
    if (!list.messages?.length) return [];

    // Sequencial de proposito: a Gmail API tem quota por segundo e um
    // Promise.all de 50 mensagens toma 429 com facilidade.
    const emails: RawEmail[] = [];
    for (const { id } of list.messages) {
      const email = await this.getById(id);
      if (email) emails.push(email);
    }
    return emails;
  }

  async getById(id: string): Promise<RawEmail | null> {
    const message = await this.request<GmailMessage>(`/messages/${id}?format=full`);
    return message ? toRawEmail(message) : null;
  }

  /**
   * Registra o watch do Pub/Sub. Google expira o watch em 7 dias, entao isso
   * precisa ser renovado por um job - por isso o cron diario no vercel.json
   * existe mesmo estando em modo push.
   */
  async watch(topicName: string): Promise<{ historyId: string; expiration: string }> {
    return this.request('/watch', {
      method: 'POST',
      body: JSON.stringify({ topicName, labelIds: ['INBOX'], labelFilterBehavior: 'include' }),
    });
  }

  /** Mensagens novas desde um historyId. E o caminho incremental do push. */
  async messageIdsSince(startHistoryId: string): Promise<string[]> {
    const params = new URLSearchParams({ startHistoryId, historyTypes: 'messageAdded' });
    const history = await this.request<{
      history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>;
    }>(`/history?${params}`);

    const ids = (history.history ?? []).flatMap((h) => (h.messagesAdded ?? []).map((m) => m.message.id));
    return [...new Set(ids)];
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.tokens.getAccessToken();
    const response = await fetch(`${GMAIL_API}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Gmail API ${init.method ?? 'GET'} ${path} falhou (${response.status}): ${await response.text()}`);
    }
    return (await response.json()) as T;
  }
}

function toGmailDate(date: Date): string {
  return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function toRawEmail(message: GmailMessage): RawEmail {
  const headers = message.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  return {
    id: message.id,
    from: header('From'),
    subject: header('Subject'),
    receivedAt: new Date(Number(message.internalDate ?? Date.now())),
    body: extractBody(message.payload),
  };
}

/**
 * Banco costuma mandar multipart/alternative com text/plain e text/html.
 * text/plain e sempre preferivel: parsear HTML com regex e o caminho curto
 * para o parser quebrar na proxima vez que o banco mexer no template.
 */
function extractBody(part: GmailPart | undefined): string {
  if (!part) return '';

  const plain = findPart(part, 'text/plain');
  if (plain) return decode(plain);

  const html = findPart(part, 'text/html');
  return html ? stripHtml(decode(html)) : '';
}

function findPart(part: GmailPart, mimeType: string): GmailPart | null {
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

function decode(part: GmailPart): string {
  const data = part.body?.data;
  if (!data) return '';
  // Gmail devolve base64url (- e _ no lugar de + e /).
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}
