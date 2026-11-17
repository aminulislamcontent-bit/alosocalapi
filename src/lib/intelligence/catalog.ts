export type {
  AdapterImplementationStatus,
  ApiEndpointSpec,
  AuthenticationType,
  CanonicalCategory,
  CapabilityKey,
  CapabilityMatrix,
  CapabilitySupportStatus,
  EnvRequirement,
  ImplementationLevelCode,
  IntegrationProviderRecord,
  OAuthEndpointSpec,
  ProviderStatus,
  WebhookSupportSpec,
} from './types';

export { CANONICAL_CATEGORIES, CAPABILITY_KEYS, IMPLEMENTATION_LEVELS } from './types';

import { CAT1_SOCIAL_PROVIDERS } from './providers/cat1-social';
import { CAT2_MESSAGING_PROVIDERS } from './providers/cat2-messaging';
import { CAT3_ADVERTISING_PROVIDERS } from './providers/cat3-advertising';
import { CAT4_EMAIL_PROVIDERS } from './providers/cat4-email';
import { CAT5_CRM_PROVIDERS } from './providers/cat5-crm';
import { CAT6_SEO_PROVIDERS } from './providers/cat6-seo';
import { CAT7_ANALYTICS_PROVIDERS } from './providers/cat7-analytics';
import { CAT8_ECOMMERCE_PROVIDERS } from './providers/cat8-ecommerce';
import { CAT9_AUTOMATION_PROVIDERS } from './providers/cat9-automation';
import { CAT10_FORMS_PROVIDERS } from './providers/cat10-forms';
import { CAT11_TELEPHONY_PROVIDERS } from './providers/cat11-telephony';
import type { CanonicalCategory, IntegrationProviderRecord } from './types';
import { CANONICAL_CATEGORIES } from './types';

export const CATALOG_VERSION = '2026-11-17';

export const SOCIAL_AND_BUSINESS_PLATFORMS: IntegrationProviderRecord[] = [
  ...CAT1_SOCIAL_PROVIDERS,
  ...CAT2_MESSAGING_PROVIDERS,
  ...CAT3_ADVERTISING_PROVIDERS,
  ...CAT4_EMAIL_PROVIDERS,
  ...CAT5_CRM_PROVIDERS,
  ...CAT6_SEO_PROVIDERS,
  ...CAT7_ANALYTICS_PROVIDERS,
  ...CAT8_ECOMMERCE_PROVIDERS,
  ...CAT10_FORMS_PROVIDERS,
  ...CAT11_TELEPHONY_PROVIDERS,
];

export const AUTOMATION_AND_INFRA_PROVIDERS: IntegrationProviderRecord[] = [
  ...CAT9_AUTOMATION_PROVIDERS,
];

// Preserved backward-compatible aliases for existing API routes.
export const SOCIAL_API_CATALOG = SOCIAL_AND_BUSINESS_PLATFORMS;
export const AUTOMATION_CATALOG = AUTOMATION_AND_INFRA_PROVIDERS;

export const ALL_INTEGRATION_CATALOG: IntegrationProviderRecord[] = [
  ...CAT1_SOCIAL_PROVIDERS,
  ...CAT2_MESSAGING_PROVIDERS,
  ...CAT3_ADVERTISING_PROVIDERS,
  ...CAT4_EMAIL_PROVIDERS,
  ...CAT5_CRM_PROVIDERS,
  ...CAT6_SEO_PROVIDERS,
  ...CAT7_ANALYTICS_PROVIDERS,
  ...CAT8_ECOMMERCE_PROVIDERS,
  ...CAT9_AUTOMATION_PROVIDERS,
  ...CAT10_FORMS_PROVIDERS,
  ...CAT11_TELEPHONY_PROVIDERS,
];

const PROVIDER_INDEX = new Map(ALL_INTEGRATION_CATALOG.map(item => [item.key, item]));

export function getProviderByKey(key: string): IntegrationProviderRecord | undefined {
  return PROVIDER_INDEX.get(key);
}

export function getCatalogByCanonicalCategory(category: CanonicalCategory): IntegrationProviderRecord[] {
  return ALL_INTEGRATION_CATALOG.filter(item => item.canonicalCategory === category);
}

export function summarizeCatalog() {
  const byCategory: Record<string, number> = {};
  const byCanonicalCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byImplementationLevel: Record<number, number> = {};
  let oauthSupportedCount = 0;
  let webhookSupportedCount = 0;
  let marketingPlatformCount = 0;

  for (const cat of CANONICAL_CATEGORIES) byCanonicalCategory[cat] = 0;

  for (const item of ALL_INTEGRATION_CATALOG) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    byCanonicalCategory[item.canonicalCategory] = (byCanonicalCategory[item.canonicalCategory] ?? 0) + 1;
    byStatus[item.verificationStatus] = (byStatus[item.verificationStatus] ?? 0) + 1;
    byImplementationLevel[item.implementationLevel] = (byImplementationLevel[item.implementationLevel] ?? 0) + 1;
    if (item.oauthSupport) oauthSupportedCount += 1;
    if (item.webhookSupport.supported) webhookSupportedCount += 1;
    if (item.category !== 'agent-library' && item.category !== 'research' && item.category !== 'infrastructure') {
      marketingPlatformCount += 1;
    }
  }

  return {
    version: CATALOG_VERSION,
    total: ALL_INTEGRATION_CATALOG.length,
    marketingPlatformCount,
    oauthSupportedCount,
    webhookSupportedCount,
    byCategory,
    byCanonicalCategory,
    byStatus,
    byImplementationLevel,
  };
}

export interface DocumentationRefreshAudit {
  version: string;
  auditedAt: string;
  totalProviders: number;
  validUrlProviders: number;
  unverifiedCount: number;
  issues: { providerKey: string; issue: string }[];
}

/**
 * Validates catalog documentation pointers and timestamps safely without executing any external content.
 */
export function auditCatalogDocumentation(nowIso = new Date().toISOString()): DocumentationRefreshAudit {
  const issues: { providerKey: string; issue: string }[] = [];
  let validUrlProviders = 0;
  let unverifiedCount = 0;

  for (const provider of ALL_INTEGRATION_CATALOG) {
    if (provider.implementationLevel === 0) unverifiedCount += 1;
    const urls = [
      provider.officialWebsite,
      provider.officialDeveloperPortal,
      provider.officialApiDocumentation,
      ...provider.officialDocs.map(d => d.url),
    ].filter(Boolean);

    let allHttps = urls.length > 0;
    for (const raw of urls) {
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'https:') {
          allHttps = false;
          issues.push({ providerKey: provider.key, issue: `Non-HTTPS doc URL: ${raw}` });
        }
      } catch {
        allHttps = false;
        issues.push({ providerKey: provider.key, issue: `Invalid URL: ${raw}` });
      }
    }
    if (allHttps) validUrlProviders += 1;
  }

  return {
    version: CATALOG_VERSION,
    auditedAt: nowIso,
    totalProviders: ALL_INTEGRATION_CATALOG.length,
    validUrlProviders,
    unverifiedCount,
    issues,
  };
}
