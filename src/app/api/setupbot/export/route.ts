import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminOrClient } from '@/lib/setupbot-guard';
import { getSbPlatform, getSbCategoryOf, SB_VERSION } from '@/lib/setupbot';
import { credentialPresence } from '@/lib/security/credential-vault';

/**
 * Status-only SetupBot handoff. The export deliberately excludes all credential
 * values (including encrypted ciphertext), identifiers, phone numbers and OTPs.
 */
export async function GET(req: NextRequest) {
  const clientIdParam = req.nextUrl.searchParams.get('clientId') ?? undefined;
  const auth = await requireAdminOrClient(req, clientIdParam);
  if ('error' in auth) return auth.error;
  const entries = await db.credentialEntry.findMany({
    where: { clientId: auth.client.id, status: 'collected' },
    orderBy: [{ platform: 'asc' }, { fieldKey: 'asc' }],
  });
  const integrations: Record<string, Record<string, Record<string, unknown>>> = {};
  const platforms = new Set<string>();
  for (const entry of entries) {
    const template = getSbPlatform(entry.platform);
    const bucket = template ? (getSbCategoryOf(entry.platform)?.key ?? 'legacy') : 'legacy';
    integrations[bucket] ??= {};
    integrations[bucket][entry.platform] ??= {};
    const { hasValue, encryptedAtRest } = credentialPresence(entry.value);
    integrations[bucket][entry.platform][entry.fieldKey] = {
      configured: hasValue,
      encryptedAtRest,
      validationStatus: entry.validationStatus,
      validatedAt: entry.validatedAt?.toISOString() ?? null,
      updatedAt: entry.updatedAt.toISOString(),
    };
    platforms.add(entry.platform);
  }
  await db.activityLog.create({ data: {
    clientId: auth.client.id, actor: auth.admin ? 'admin' : 'client', action: 'setupbot_status_export',
    detail: `status-only export: ${platforms.size} integrations; credential values omitted`,
  } });
  return NextResponse.json({
    exportType: 'aloapi-setupbot-status-only',
    exportedAt: new Date().toISOString(),
    client: { username: auth.client.username, name: auth.client.name },
    setupbotVersion: SB_VERSION,
    totalIntegrations: platforms.size,
    integrations,
    security: {
      credentialValuesIncluded: false,
      encryptedCredentialValuesIncluded: false,
      plaintextSecretsIncluded: false,
      phoneNumbersIncluded: false,
      otpOrRecoveryCodesIncluded: false,
      note: 'This report contains configuration-presence and offline format-check metadata only. It does not prove authorization, account access, or provider connectivity.',
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
