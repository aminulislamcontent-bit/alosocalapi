import catalogJson from './provider-catalog.json';
import { db } from '@/lib/db';

// ─── Provider registry (§4): metadata + honest integration status ───

export interface ProviderMeta {
  key: string;
  name: string;
  category: string;
  sourceUrl: string;
  accessMethod: string;
  dataFields: string[];
  authRequired: boolean;
  freeTier: Record<string, unknown>;
  paidTier: Record<string, unknown>;
  rateLimit: Record<string, unknown>;
  licensing: string;
  geoCoverage: string;
  notes?: string;
}

export const PROVIDER_CATALOG: ProviderMeta[] = (
  catalogJson as unknown as { providers: ProviderMeta[] }
).providers;

export type IntegrationStatus =
  | 'planned'
  | 'verified'
  | 'rate_limited'
  | 'blocked_here'
  | 'requires_credentials'
  | 'failing';

/** Providers usable for discovery given a budget preference (§13). */
export function usableForBudget(meta: ProviderMeta, budget: string): boolean {
  const hasPaid = Object.keys(meta.paidTier ?? {}).length > 0;
  if (budget === 'free_only') return !meta.authRequired && !hasPaid;
  if (budget === 'free_first') return !meta.authRequired; // free paths only in this build
  // paid_with_approval still cannot silently subscribe: adapters exist only for free endpoints
  return !meta.authRequired;
}

/** Idempotently sync catalog metadata into the DB (never fabricates status). */
export async function syncProviderRegistry(): Promise<number> {
  let n = 0;
  for (const meta of PROVIDER_CATALOG) {
    const existing = await db.providerRegistry.findUnique({ where: { key: meta.key } });
    if (!existing) {
      // First insert keeps "planned" — status only changes via real verification
      await db.providerRegistry.create({
        data: {
          key: meta.key,
          name: meta.name,
          category: meta.category,
          sourceUrl: meta.sourceUrl,
          accessMethod: meta.accessMethod,
          dataFields: JSON.stringify(meta.dataFields),
          authRequired: meta.authRequired,
          freeTier: JSON.stringify(meta.freeTier),
          paidTier: JSON.stringify(meta.paidTier),
          rateLimit: JSON.stringify(meta.rateLimit),
          licensing: meta.licensing,
          geoCoverage: meta.geoCoverage,
          notes: meta.notes ?? null,
          integrationStatus: meta.authRequired ? 'requires_credentials' : 'planned',
        },
      });
      n++;
    }
  }
  return n;
}

export async function getProvider(key: string): Promise<ProviderMeta | null> {
  return PROVIDER_CATALOG.find(p => p.key === key) ?? null;
}

export async function recordVerification(
  key: string,
  status: IntegrationStatus,
  check: Record<string, unknown>,
): Promise<void> {
  const reliability =
    status === 'verified' ? 'high' : status === 'rate_limited' ? 'medium' : 'low';
  await db.providerRegistry.update({
    where: { key },
    data: {
      integrationStatus: status,
      lastVerifiedAt: new Date(),
      lastCheck: JSON.stringify({ ...check, at: new Date().toISOString() }),
      reliability,
    },
  });
}
