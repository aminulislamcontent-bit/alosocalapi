import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminOrClient } from '@/lib/setupbot-guard';
import { getSbPlatform, getSbCategoryOf, SB_VERSION, TOKEN_REFRESH_SCHEDULE } from '@/lib/setupbot';
import { encryptSecret } from '@/lib/crypto';

/**
 * GET /api/setupbot/export[?clientId=xxx]
 * Master JSON handoff (spec Phase 4). Secrets encrypted with AES-256-GCM
 * (fields suffixed _encrypted). Client → own data; admin → any client.
 */
export async function GET(req: NextRequest) {
  const clientIdParam = req.nextUrl.searchParams.get('clientId') ?? undefined;
  const auth = await requireAdminOrClient(req, clientIdParam);
  if ('error' in auth) return auth.error;

  const entries = await db.credentialEntry.findMany({
    where: { clientId: auth.client.id, status: 'collected' },
    orderBy: { platform: 'asc' },
  });

  const tplCache = new Map<string, ReturnType<typeof getSbPlatform>>();

  const integrations: Record<string, Record<string, Record<string, string>>> = {};
  const validatedPlatforms: Record<string, string> = {};

  for (const e of entries) {
    let tpl = tplCache.get(e.platform);
    if (tpl === undefined) {
      tpl = getSbPlatform(e.platform);
      tplCache.set(e.platform, tpl);
    }

    const bucket = tpl ? (getSbCategoryOf(e.platform)?.key ?? 'legacy') : 'legacy';
    integrations[bucket] ??= {};
    integrations[bucket][e.platform] ??= {};

    const isSecret = tpl ? (tpl.fields.find(f => f.k === e.fieldKey)?.sens ?? false) : /token|secret|password|key/i.test(e.fieldKey);
    const outKey = isSecret ? `${e.fieldKey}_encrypted` : e.fieldKey;
    integrations[bucket][e.platform][outKey] = isSecret ? encryptSecret(e.value) : e.value;

    if (e.validationStatus && e.validationStatus !== 'none') {
      validatedPlatforms[e.platform] = e.validationStatus;
    }
  }

  const allPlatforms = new Set<string>();
  for (const plats of Object.values(integrations)) {
    for (const p of Object.keys(plats)) allPlatforms.add(p);
  }
  const totalIntegrations = allPlatforms.size;

  const master = {
    client_id: auth.client.username,
    client_name: auth.client.name,
    setup_completed_at: new Date().toISOString(),
    setupbot_version: SB_VERSION,
    password_dependency: false,
    total_integrations: totalIntegrations,
    integrations,
    validation_summary: validatedPlatforms,
    token_refresh_schedule: TOKEN_REFRESH_SCHEDULE,
    notes:
      'All tokens are long-lived or auto-refreshable. Password change will NOT break any integration. ' +
      'Secrets are AES-256-GCM encrypted (v1:<iv>.<tag>.<ciphertext>); non-secret fields are plaintext.',
  };

  await db.activityLog.create({
    data: {
      clientId: auth.client.id,
      actor: auth.admin ? 'admin' : 'client',
      action: 'setupbot_export',
      detail: `master JSON — ${totalIntegrations} integrations`,
    },
  });

  return NextResponse.json(master);
}
