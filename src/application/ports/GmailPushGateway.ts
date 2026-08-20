import type { EmailGateway } from './EmailGateway';

/**
 * Capacidades que so o Gmail tem (watch e history incremental). Fica separada
 * de EmailGateway para que uma implementacao IMAP futura possa cumprir a
 * interface basica sem ter que fingir que suporta Pub/Sub.
 */
export interface GmailPushGateway extends EmailGateway {
  watch(topicName: string): Promise<{ historyId: string; expiration: string }>;
  messageIdsSince(startHistoryId: string): Promise<string[]>;
}
