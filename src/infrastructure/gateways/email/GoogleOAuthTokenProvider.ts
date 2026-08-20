/**
 * Troca o refresh token por um access token e mantem em memoria ate expirar.
 * Refresh token nao expira sozinho, EXCETO quando o app OAuth esta em modo
 * "Testing" no Google Cloud: la ele morre em 7 dias. Publicar o app como
 * "In production" resolve (funciona para a propria conta mesmo sem passar
 * pela verificacao do Google - so aparece uma tela de aviso no consentimento).
 */
export interface TokenProvider {
  getAccessToken(): Promise<string>;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export class GoogleOAuthTokenProvider implements TokenProvider {
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: GoogleOAuthConfig) {}

  async getAccessToken(): Promise<string> {
    // Margem de 60s: token que expira no meio do request em voo da 401.
    if (this.cached && this.cached.expiresAt > Date.now() + 60_000) {
      return this.cached.token;
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      // invalid_grant quase sempre significa refresh token expirado (app em
      // modo Testing) ou acesso revogado. Rodar `npm run gmail:auth` de novo.
      throw new Error(`Falha ao renovar access token do Google (${response.status}): ${detail}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.cached = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  }
}
