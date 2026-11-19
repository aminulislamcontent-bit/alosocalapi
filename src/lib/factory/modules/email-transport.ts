import nodemailer from 'nodemailer';
import { resolveVaultSecretForServer } from '@/lib/onboarding/vault-service';
import { listFactoryProviderConnections } from '../provider-bridge';

export type Message = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
};
export type Outcome = {
  status: 'ACCEPTED' | 'REJECTED' | 'FAILED' | 'UNKNOWN' | 'NOT_CONFIGURED' | 'PREFLIGHT_PASSED';
  receipt?: string;
};
export type Transport = (message: Message) => Promise<Outcome>;

export async function emailTransport(
  workspaceId: string,
  actor: string,
  adapter: string,
  provider: string | null,
): Promise<Transport> {
  const secret = async (providerKey: string, credentialType: string, label: string) =>
    (
      await resolveVaultSecretForServer({
        tenantId: workspaceId,
        actor,
        providerKey,
        credentialType,
        label,
        reason: 'Submit approved email',
      })
    )?.plaintext;
  if (adapter === 'smtp_custom') {
    const address = await secret('smtp_custom', 'custom_secret', 'smtp_host');
    if (!address) return async () => ({ status: 'NOT_CONFIGURED' });
    const match = /^([\w.-]+)(?::(\d{1,5}))?$/.exec(address);
    if (!match) throw new Error('Invalid SMTP relay address.');
    const [, host, portText] = match;
    const port = Number(portText || 587);
    const user = await secret('smtp_custom', 'custom_secret', 'smtp_user');
    const pass = await secret('smtp_custom', 'custom_secret', 'smtp_password');
    if (!!user !== !!pass) return async () => ({ status: 'NOT_CONFIGURED' });
    const relay = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: host !== '127.0.0.1' || !!pass,
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    return async (message) => {
      try {
        const info = await relay.sendMail({ ...message, envelope: { from: message.from, to: [message.to] } });
        return info.accepted.length === 1 && /^250\b/.test(info.response)
          ? { status: 'ACCEPTED', receipt: info.response.slice(0, 240) }
          : { status: 'UNKNOWN' };
      } catch (error) {
        const e = error as { responseCode?: number; code?: string };
        return {
          status:
            e.responseCode && e.responseCode >= 400
              ? 'REJECTED'
              : ['EAUTH', 'EDNS', 'ECONNECTION'].includes(e.code || '')
                ? 'FAILED'
                : 'UNKNOWN',
        };
      }
    };
  }
  if (adapter === 'external_provider_bridge' && provider) {
    const connections = await listFactoryProviderConnections(workspaceId, 'email_marketing');
    if (!connections.some((c) => c.providerKey === provider && c.status === 'authorized_with_vault'))
      return async () => ({ status: 'NOT_CONFIGURED' });
    if (provider !== 'sendgrid_api') return async () => ({ status: 'PREFLIGHT_PASSED' });
    const key = await secret(provider, 'api_key', 'primary');
    if (!key) return async () => ({ status: 'NOT_CONFIGURED' });
    return async (m) => {
      try {
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: m.to }] }],
            from: { email: m.from },
            subject: m.subject,
            content: [
              { type: 'text/plain', value: m.text },
              { type: 'text/html', value: m.html },
            ].filter((v) => v.value),
          }),
        });
        return res.status === 202
          ? { status: 'ACCEPTED', receipt: res.headers.get('x-message-id') || 'HTTP 202' }
          : { status: res.status >= 500 ? 'FAILED' : 'REJECTED' };
      } catch {
        return { status: 'UNKNOWN' };
      }
    };
  }
  return async () => ({ status: 'NOT_CONFIGURED' });
}
