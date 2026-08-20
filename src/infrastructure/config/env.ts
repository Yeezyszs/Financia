/**
 * Le e valida env vars uma vez, com erro claro. Ler process.env espalhado pelo
 * codigo faz a falta de uma variavel aparecer como `undefined` num lugar
 * aleatorio, meia hora depois do deploy.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria nao definida: ${name}. Veja .env.example.`);
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required('SUPABASE_URL');
  },
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get googleClientId() {
    return required('GOOGLE_CLIENT_ID');
  },
  get googleClientSecret() {
    return required('GOOGLE_CLIENT_SECRET');
  },
  get googleRefreshToken() {
    return required('GOOGLE_REFRESH_TOKEN');
  },
  get googlePubsubTopic() {
    return required('GOOGLE_PUBSUB_TOPIC');
  },
  get pubsubVerificationToken() {
    return required('PUBSUB_VERIFICATION_TOKEN');
  },
  get cronSecret() {
    return required('CRON_SECRET');
  },
  get defaultOwnerId() {
    return required('DEFAULT_OWNER_ID');
  },
};
