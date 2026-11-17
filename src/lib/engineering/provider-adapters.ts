import { ALL_INTEGRATION_CATALOG, getProviderByKey } from '@/lib/intelligence/catalog';
import type { IntegrationProviderRecord } from '@/lib/intelligence/types';

export type AdapterExecutionMode =
  | 'FULLY_AUTOMATED'
  | 'OFFICIAL_API_AUTOMATION'
  | 'AUTHORIZED_BROWSER_AUTOMATION'
  | 'SUPERVISED_PORTAL_HANDOFF'
  | 'OWNER_ACTION_REQUIRED'
  | 'CONFIGURATION_ONLY'
  | 'UNSUPPORTED';

export type HandoverMode =
  | 'DIRECT_TRANSFER'
  | 'CLIENT_ACCOUNT_REISSUANCE'
  | 'AUTHORIZED_DELEGATION'
  | 'CONFIGURATION_ONLY';

export interface DeveloperSetupAssessment {
  providerKey: string;
  displayName: string;
  canonicalCategory: string;
  // Section 4 exact 10 determinations
  developerAccountRequired: boolean;
  canReuseExistingAccount: boolean;
  canCreateAppAutomatically: boolean;
  hasOfficialAppCreationApi: boolean;
  authorizedPortalWorkflowAvailable: boolean;
  requiredPermissionsAndScopes: string[];
  issuableCredentials: string[];
  credentialsTransferable: boolean;
  verificationAndApprovalSteps: string[];
  clientOwnedConfiguration: string[];
  // Adapter execution & handover strategy
  executionMode: AdapterExecutionMode;
  handoverMode: HandoverMode;
  handoverRationale: string;
  oauthRedirectUrisTemplate: string[];
  webhookUrlTemplate: string;
  webhookSignatureAlgorithm: string;
  dnsVerificationRecords: { type: 'TXT' | 'CNAME'; host: string; valueHint: string; purpose: string }[];
}

function determineExecutionMode(provider: IntegrationProviderRecord): AdapterExecutionMode {
  if (provider.verificationStatus === 'BLOCKED') return 'UNSUPPORTED';
  if (provider.authenticationType === 'manual_review') return 'OWNER_ACTION_REQUIRED';
  if (provider.oauthSupport) return 'SUPERVISED_PORTAL_HANDOFF';
  if (provider.authenticationType === 'api_key' || provider.authenticationType === 'bot_token') {
    return provider.businessVerificationRequirements.toLowerCase().includes('approval')
      ? 'OWNER_ACTION_REQUIRED'
      : 'CONFIGURATION_ONLY';
  }
  return 'CONFIGURATION_ONLY';
}

function determineHandoverMode(provider: IntegrationProviderRecord): {
  mode: HandoverMode;
  transferable: boolean;
  rationale: string;
} {
  const cat = provider.canonicalCategory;
  const auth = provider.authenticationType;
  const selfHostedOrPartnerTransferKeys = new Set([
    'shopify_admin_api',
    'woocommerce_rest_api',
    'wordpress_rest_api',
    'webflow_data_api',
    'n8n',
    'activepieces',
    'node_red',
    'windmill',
    'temporal',
    'apache_airflow',
    'huginn',
    'agency_orchestrator',
    'agency_agents_en',
    'agency_agents_zh',
    'ai_agency_agents',
    'ybt_army_135m',
    'obs_studio',
    'nginx',
  ]);

  if (selfHostedOrPartnerTransferKeys.has(provider.key)) {
    return {
      mode: 'DIRECT_TRANSFER',
      transferable: true,
      rationale: 'Self-hosted deployment or official partner/collaborator ownership transfer supported; portable app manifests and keys transfer cleanly.',
    };
  }

  // Providers with business/team IAM or official partner delegation
  if (
    cat === 'Social Media and Publishing' ||
    cat === 'Paid Advertising' ||
    cat === 'Messaging and Customer Communication'
  ) {
    return {
      mode: 'AUTHORIZED_DELEGATION',
      transferable: false,
      rationale:
        'Social/Ad/Messaging apps are tied to Business Manager / Developer Organization ownership. Client must hold Business ownership or delegate partner/team access rather than transferring personal app secrets.',
    };
  }
  if (auth === 'hmac_webhook') {
    return {
      mode: 'CONFIGURATION_ONLY',
      transferable: true,
      rationale: 'Webhook signature verification and endpoint specification only; client sets signing secret in their target project.',
    };
  }
  if (auth === 'api_key' || auth === 'service_account' || auth === 'bot_token' || auth === 'basic_auth') {
    return {
      mode: 'CLIENT_ACCOUNT_REISSUANCE',
      transferable: false,
      rationale:
        'API keys / service accounts / bot tokens remain bound to the issuing client workspace account. Client reissues replacement keys in their own dashboard using ALOAPI prepared scopes & .env template.',
    };
  }
  return {
    mode: 'CLIENT_ACCOUNT_REISSUANCE',
    transferable: false,
    rationale: 'OAuth client credentials should be issued under the client organization developer account or explicitly reauthorized via OAuth.',
  };
}

function determineIssuableCredentials(provider: IntegrationProviderRecord): string[] {
  const creds: string[] = ['webhook_signing_secret', 'config_value'];
  if (provider.oauthSupport) {
    creds.push('oauth_client_id', 'oauth_client_secret', 'access_token');
    if (provider.oauthConfig?.pkceSupported) creds.push('refresh_token');
  } else if (provider.authenticationType === 'service_account') {
    creds.push('service_account', 'key_pair', 'jwt_signing_key');
  } else {
    creds.push('api_key');
  }
  if (provider.webhookSupport.supported) {
    creds.push('app_secret');
  }
  return Array.from(new Set(creds));
}

export function buildProviderAdapterProfile(
  providerKey: string,
  options: { publicBaseUrl?: string; domain?: string } = {},
): DeveloperSetupAssessment {
  const provider = getProviderByKey(providerKey);
  if (!provider) {
    throw new Error(`Unknown external provider key: ${providerKey}`);
  }

  const baseUrl = (options.publicBaseUrl || process.env.ALOAPI_PUBLIC_WEBHOOK_BASE_URL || 'https://app.example.invalid').replace(/\/$/, '');
  const domain = options.domain || 'example.com';

  const executionMode = determineExecutionMode(provider);
  const handover = determineHandoverMode(provider);
  const verificationSteps: string[] = [];

  if (provider.developerAccountRequirements) {
    verificationSteps.push(provider.developerAccountRequirements);
  }
  if (provider.businessVerificationRequirements && !/none/i.test(provider.businessVerificationRequirements)) {
    verificationSteps.push(provider.businessVerificationRequirements);
  }
  if (provider.oauthSupport) {
    verificationSteps.push('Owner OAuth consent & permission scope approval via official authorization endpoint.');
  }
  if (provider.canonicalCategory === 'Email Marketing') {
    verificationSteps.push('Domain ownership + SPF, DKIM, and DMARC DNS verification.');
  }
  if (provider.canonicalCategory === 'Telephony and Voice Infrastructure' || provider.key === 'whatsapp_cloud_api') {
    verificationSteps.push('Phone/Caller-ID registration and regulatory messaging compliance verification.');
  }

  const dnsRecords: DeveloperSetupAssessment['dnsVerificationRecords'] = [
    {
      type: 'TXT',
      host: `_aloapi-verify.${domain}`,
      valueHint: `aloapi-domain-verification=<generated-per-project>`,
      purpose: 'Domain ownership verification evidence for developer portals & callback allowlisting.',
    },
  ];
  if (provider.canonicalCategory === 'Email Marketing') {
    dnsRecords.push(
      {
        type: 'TXT',
        host: domain,
        valueHint: `v=spf1 include:${provider.key.replace(/_/g, '')}.example ~all`,
        purpose: 'SPF sender authorization (replace with provider portal exact record).',
      },
      {
        type: 'CNAME',
        host: `s1._domainkey.${domain}`,
        valueHint: `s1.domainkey.${provider.key.replace(/_/g, '')}.example`,
        purpose: 'DKIM cryptographic email signing verification.',
      },
      {
        type: 'TXT',
        host: `_dmarc.${domain}`,
        valueHint: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`,
        purpose: 'DMARC enforcement policy.',
      },
    );
  }

  return {
    providerKey: provider.key,
    displayName: provider.displayName,
    canonicalCategory: provider.canonicalCategory,
    developerAccountRequired: !/none/i.test(provider.developerAccountRequirements),
    canReuseExistingAccount: true,
    canCreateAppAutomatically: false, // Honest report: third-party developer portals require owner login & app creation / official consent
    hasOfficialAppCreationApi: false,
    authorizedPortalWorkflowAvailable: Boolean(provider.officialDeveloperPortal),
    requiredPermissionsAndScopes: provider.requiredScopes,
    issuableCredentials: determineIssuableCredentials(provider),
    credentialsTransferable: handover.transferable,
    verificationAndApprovalSteps: verificationSteps,
    clientOwnedConfiguration: [
      'Organization / Developer App Ownership',
      'Billing & Payment Method Authorization',
      'Verified Sending Domain / Caller ID / Business Portfolio',
      ...provider.environmentVariables.filter(v => v.secret).map(v => `${v.name} (issued in client Vault)`),
    ],
    executionMode,
    handoverMode: handover.mode,
    handoverRationale: handover.rationale,
    oauthRedirectUrisTemplate: provider.oauthSupport
      ? [`${baseUrl}/api/onboarding/oauth/callback`, `${baseUrl}/api/engineering/oauth/callback/${provider.key}`]
      : [],
    webhookUrlTemplate: `${baseUrl}/api/webhooks/${provider.key}`,
    webhookSignatureAlgorithm: provider.webhookSupport.signatureMethod || 'HMAC-SHA256',
    dnsVerificationRecords: dnsRecords,
  };
}

export function listAllUniversalAdapters(options: { category?: string; publicBaseUrl?: string } = {}) {
  const filtered = options.category
    ? ALL_INTEGRATION_CATALOG.filter(p => p.canonicalCategory === options.category)
    : ALL_INTEGRATION_CATALOG;
  return filtered.map(p => buildProviderAdapterProfile(p.key, { publicBaseUrl: options.publicBaseUrl }));
}
