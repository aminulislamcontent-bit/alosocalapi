import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { AUTOMATION_CATALOG, SOCIAL_API_CATALOG } from '@/lib/intelligence/catalog';
import { decryptCredentialTransfer } from '@/lib/security/credential-transfer';
import { encryptVaultValue } from '@/lib/security/vault-crypto';
import { isSameOriginRequest } from '@/lib/security/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDER_KEY = 'whatsapp_cloud_api';
const APP_SECRET_NAME = 'WHATSAPP_APP_SECRET';
const VERIFY_TOKEN_NAME = 'WHATSAPP_WEBHOOK_VERIFY_TOKEN';
const WEBHOOK_ACCOUNT_LABEL = 'ALOAPI webhook verifier settings (not a provider account)';
const CATALOG = [...SOCIAL_API_CATALOG, ...AUTOMATION_CATALOG];

async function getAdmin() {
  const user = await getSessionUser();
  return user?.role === 'admin' ? user : null;
}

async function findVerifierAccount() {
  return db.integrationAccount.findFirst({
    where: { providerKey: PROVIDER_KEY, businessName: WEBHOOK_ACCOUNT_LABEL },
    select: { id: true },
  });
}

async function configuredSecretNames() {
  const rows = await db.integrationSecret.findMany({
    where: { providerKey: PROVIDER_KEY, name: { in: [APP_SECRET_NAME, VERIFY_TOKEN_NAME] } },
    select: { name: true },
  });
  return new Set(rows.map(row => row.name));
}

export async function GET() {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: 'Administrator login required.' }, { status: 401 });
  try {
    const configured = await configuredSecretNames();
    return NextResponse.json({
      webhookVerifier: {
        appSecretConfigured: configured.has(APP_SECRET_NAME),
        verifyTokenConfigured: configured.has(VERIFY_TOKEN_NAME),
        fullyConfigured: configured.has(APP_SECRET_NAME) && configured.has(VERIFY_TOKEN_NAME),
        providerAuthorizationPerformed: false,
        messagesSent: false,
      },
    }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch {
    return NextResponse.json({ error: 'Webhook settings are unavailable. Apply the reviewed additive database migrations.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

/** Stores only the Meta app webhook-signing secret and a locally chosen verification token. */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: 'Administrator login required.' }, { status: 401 });

  const body = await req.json().catch(() => null) as { appSecretTransfer?: unknown; verifyTokenTransfer?: unknown } | null;
  if (!body?.appSecretTransfer || !body.verifyTokenTransfer) {
    return NextResponse.json({ error: 'Both fields must use browser-encrypted credential transfers.' }, { status: 400 });
  }
  let appSecret = '';
  let verifyToken = '';
  try {
    [appSecret, verifyToken] = await Promise.all([
      decryptCredentialTransfer(body.appSecretTransfer),
      decryptCredentialTransfer(body.verifyTokenTransfer),
    ]);
  } catch {
    return NextResponse.json({ error: 'Secure transfer was invalid or expired. Re-enter both values and retry.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  if (Buffer.byteLength(appSecret, 'utf8') < 16 || Buffer.byteLength(appSecret, 'utf8') > 512) {
    return NextResponse.json({ error: 'The Meta app secret must be 16 to 512 UTF-8 bytes.' }, { status: 400 });
  }
  if (Buffer.byteLength(verifyToken, 'utf8') < 32 || Buffer.byteLength(verifyToken, 'utf8') > 512) {
    return NextResponse.json({ error: 'Choose a unique webhook verification token of 32 to 512 UTF-8 bytes.' }, { status: 400 });
  }

  try {
    const provider = CATALOG.find(item => item.key === PROVIDER_KEY);
    if (!provider) return NextResponse.json({ error: 'WhatsApp documentation entry is missing.' }, { status: 503 });
    await db.integrationProvider.upsert({
      where: { key: PROVIDER_KEY },
      create: {
        key: PROVIDER_KEY,
        category: provider.category,
        metadata: JSON.stringify({ name: provider.name, officialDocs: provider.officialDocs }),
        verificationStatus: 'DOCUMENTED',
      },
      update: {},
    });
    let account = await findVerifierAccount();
    if (!account) {
      account = await db.integrationAccount.create({
        data: {
          providerKey: PROVIDER_KEY,
          businessName: WEBHOOK_ACCOUNT_LABEL,
          verificationStatus: 'REQUIRES_USER_ACTION',
          manualRequirements: JSON.stringify(['This is webhook-signature configuration only; it does not represent a WhatsApp account, WABA, phone number, OAuth grant, or message permission.']),
        },
        select: { id: true },
      });
    }
    await db.$transaction([
      db.integrationSecret.upsert({
        where: { providerKey_accountId_name: { providerKey: PROVIDER_KEY, accountId: account.id, name: APP_SECRET_NAME } },
        create: { providerKey: PROVIDER_KEY, accountId: account.id, name: APP_SECRET_NAME, ciphertext: encryptVaultValue(appSecret) },
        update: { ciphertext: encryptVaultValue(appSecret) },
      }),
      db.integrationSecret.upsert({
        where: { providerKey_accountId_name: { providerKey: PROVIDER_KEY, accountId: account.id, name: VERIFY_TOKEN_NAME } },
        create: { providerKey: PROVIDER_KEY, accountId: account.id, name: VERIFY_TOKEN_NAME, ciphertext: encryptVaultValue(verifyToken) },
        update: { ciphertext: encryptVaultValue(verifyToken) },
      }),
      db.integrationAuditEvent.create({
        data: { actor: user.username ?? 'admin', action: 'whatsapp_webhook_secrets_saved', providerKey: PROVIDER_KEY, accountId: account.id, detail: 'Webhook verifier secrets replaced; provider authorization and account verification were not performed.' },
      }),
    ]);
    return NextResponse.json({
      ok: true,
      webhookVerifier: {
        appSecretConfigured: true,
        verifyTokenConfigured: true,
        fullyConfigured: true,
        providerAuthorizationPerformed: false,
        messagesSent: false,
      },
    }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'ALOAPI_VAULT_KEY_MISSING') {
      return NextResponse.json({ error: 'Secure vault is not configured. Set a stable ALOAPI_VAULT_KEY of at least 32 bytes.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ error: 'Webhook secrets could not be saved. Check vault and migration setup; values were not returned.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  } finally {
    // JavaScript strings cannot be reliably zeroized; avoid retaining them in component state or logs.
    appSecret = '';
    verifyToken = '';
  }
}

/** Removes ALOAPI's local webhook-signing copy only; it does not revoke Meta app access or provider tokens. */
export async function DELETE(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  const user = await getAdmin();
  if (!user) return NextResponse.json({ error: 'Administrator login required.' }, { status: 401 });
  try {
    const account = await findVerifierAccount();
    if (account) {
      await db.$transaction([
        db.integrationSecret.deleteMany({ where: { providerKey: PROVIDER_KEY, accountId: account.id, name: { in: [APP_SECRET_NAME, VERIFY_TOKEN_NAME] } } }),
        db.integrationAccount.update({ where: { id: account.id }, data: { verificationStatus: 'REQUIRES_USER_ACTION' } }),
        db.integrationAuditEvent.create({
          data: { actor: user.username ?? 'admin', action: 'whatsapp_webhook_secrets_deleted', providerKey: PROVIDER_KEY, accountId: account.id, detail: 'ALOAPI local webhook verifier secrets deleted; provider grants were not changed.' },
        }),
      ]);
    }
    return NextResponse.json({ ok: true, webhookVerifier: { appSecretConfigured: false, verifyTokenConfigured: false, fullyConfigured: false, providerAuthorizationPerformed: false, messagesSent: false } }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch {
    return NextResponse.json({ error: 'Local webhook secrets could not be removed.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
