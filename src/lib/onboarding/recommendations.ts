import { db } from '@/lib/db';
import { ALL_INTEGRATION_CATALOG, type IntegrationProviderRecord } from '@/lib/intelligence/catalog';

export interface ClientRequirementInput {
  tenantId: string;
  businessName: string;
  industry: string;
  businessModel: 'b2b' | 'b2c' | 'd2c_ecommerce' | 'education' | 'agency' | 'saas' | 'local_service';
  targetCountries: string[];
  monthlyMarketingBudget: 'bootstrap' | 'growth_500_2500' | 'scale_2500_10000' | 'enterprise_10000_plus';
  technicalExperience: 'non_technical' | 'intermediate' | 'developer_team';
  requiredChannels: string[]; // e.g., ['social', 'messaging', 'ads', 'email', 'crm', 'seo', 'analytics', 'ecommerce', 'automation', 'forms']
  emailVolume: 'under_2500' | '2500_to_50000' | '50000_to_250000' | '250000_plus';
  ecommercePlatform: 'none' | 'shopify' | 'woocommerce' | 'bigcommerce' | 'magento' | 'stripe_direct';
  existingWebsiteDomain: string;
  existingAccounts: string[]; // provider keys already owned
  requiredIntegrations: string[]; // explicit requested provider keys
  budgetConstraint: 'free_and_open_source_first' | 'balanced_value' | 'best_in_class_paid';
  teamSize: 'solo' | 'small_2_10' | 'mid_11_50' | 'enterprise_50_plus';
  privacyComplianceNeeds: string[]; // e.g., ['GDPR', 'CCPA', 'Bangladesh_Local', 'HIPAA_Sensitive']
  automationPreferences: 'managed_saas' | 'self_hosted_open_source' | 'hybrid';
}

export interface ScoredRecommendation {
  providerKey: string;
  displayName: string;
  canonicalCategory: string;
  tier: 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL' | 'EXCLUDED';
  score: number;
  whyFits: string[];
  pros: string[];
  cons: string[];
  expectedCost: string;
  limitations: string[];
  regionalAvailability: string;
  setupComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
  approvalFriction: 'SELF_SERVE' | 'APP_REVIEW_REQUIRED' | 'BUSINESS_VERIFICATION_REQUIRED';
  alreadyOwned: boolean;
  implementationLevel: number;
}

export interface ComparisonPair {
  category: string;
  title: string;
  candidates: {
    providerKey: string;
    displayName: string;
    bestFor: string;
    costProfile: string;
    approvalNote: string;
    score: number;
  }[];
  guidance: string;
}

export interface PlatformSpecificChecklist {
  track: string;
  title: string;
  appliesToProviders: string[];
  prerequisites: string[];
  steps: string[];
  securityAndComplianceNotes: string[];
}

export const PLATFORM_SPECIFIC_PLAYBOOKS: PlatformSpecificChecklist[] = [
  {
    track: 'meta',
    title: 'Meta (Facebook Pages, Instagram Professional, WhatsApp Cloud API, Marketing API)',
    appliesToProviders: ['meta_facebook_pages', 'instagram_graph_api', 'whatsapp_cloud_api', 'meta_marketing_api', 'instagram_messaging', 'messenger_platform'],
    prerequisites: [
      'Meta Business Portfolio (Business Manager) owned by the client business.',
      'Domain ownership verified inside Meta Business Settings.',
      'Business Verification documents ready for Advanced Access & WhatsApp scaling.',
      'Dedicated non-VoIP phone number not active on consumer WhatsApp app for WhatsApp Cloud API.',
    ],
    steps: [
      'Verify official business identity and domain inside business.facebook.com.',
      'Confirm Instagram account is switched to Business or Creator and linked to the target Facebook Page.',
      'Create a Meta App in developers.facebook.com/apps with Privacy Policy URL and Data Deletion Callback.',
      'Create a System User inside Meta Business Manager and assign explicit least-privilege asset permissions.',
      'Configure WhatsApp/Page Webhook verify token and verify X-Hub-Signature-256 HMAC validation.',
      'Complete Meta App Review screencasts for any scopes requiring Advanced Access.',
    ],
    securityAndComplianceNotes: [
      'Never use personal login scraping; use Facebook Login OAuth or Business System User tokens.',
      'Outbound WhatsApp marketing requires pre-approved message templates and explicit user opt-in.',
    ],
  },
  {
    track: 'google',
    title: 'Google Stack (Search Console, GA4, YouTube, Google Ads, Google Tag Manager, Business Profile)',
    appliesToProviders: ['google_search_console', 'google_analytics4', 'youtube_data_api', 'google_ads_api', 'google_tag_manager_api', 'google_business_profile'],
    prerequisites: [
      'Google Cloud Project owned by the business organization.',
      'Verified website property in Google Search Console (DNS TXT preferred).',
      'OAuth Consent Screen configured with authorized domains, privacy policy, and support email.',
    ],
    steps: [
      'Enable strictly the needed Google APIs (Search Console, GA4 Data/Admin, YouTube v3, Ads API).',
      'Create OAuth 2.0 Web Client IDs with exact ALOAPI callback URLs and enforce PKCE S256.',
      'For Google Ads API: apply for a Developer Token inside Google Ads Manager (MCC) account.',
      'For Google Business Profile: submit the GBP API Access Request Form before expecting non-zero quota.',
      'Verify read-only API connectivity first (`/accountSummaries`, `/sites`, `/channels?mine=true`).',
    ],
    securityAndComplianceNotes: [
      'Google unverified OAuth apps are capped at 100 test users and restrict public YouTube video visibility.',
      'Never enable budget-mutating Ads calls without explicit owner approval.',
    ],
  },
  {
    track: 'tiktok',
    title: 'TikTok (Display/Content Posting API & TikTok Marketing Business API)',
    appliesToProviders: ['tiktok_content_api', 'tiktok_business_api'],
    prerequisites: [
      'Separate TikTok Developer App (for creator/organic Display & Content API) vs TikTok Business Center App (for Ads API).',
      'Verified domain ownership and Privacy/Terms URLs matching the business.',
    ],
    steps: [
      'Register application at developers.tiktok.com and verify callback/domain ownership.',
      'Configure PKCE S256 OAuth flow (`client_key` + `code_challenge`) for TikTok v2 Login Kit.',
      'Test content upload safely in draft/sandbox (`SELF_ONLY`) mode while app review is pending.',
      'Submit TikTok App Review screencast showing exact UX disclosure & posting consent.',
    ],
    securityAndComplianceNotes: [
      'Direct public posting remains blocked until TikTok app audit completes.',
    ],
  },
  {
    track: 'linkedin',
    title: 'LinkedIn (Share on LinkedIn, Community Management API, Marketing/Lead Gen API)',
    appliesToProviders: ['linkedin_platform', 'linkedin_marketing_api'],
    prerequisites: [
      'Active LinkedIn Company Page with Super Admin access.',
      'LinkedIn Developer App verified by a Company Page Admin.',
    ],
    steps: [
      'Associate the Developer App with the client LinkedIn Company Page.',
      'Request `Share on LinkedIn` + `Sign In with LinkedIn using OpenID Connect` for basic member posting.',
      'Apply separately for `Community Management API` (organization posts) and `Advertising API` (ads & lead sync).',
      'Send `LinkedIn-Version: 202601` and `X-Restli-Protocol-Version: 2.0.0` headers on `/rest/*` calls.',
    ],
    securityAndComplianceNotes: [
      'LinkedIn OAuth tokens expire after 60 days; track expiration closely inside ALOAPI vault.',
    ],
  },
  {
    track: 'email',
    title: 'Email Deliverability & Platform Setup (SPF, DKIM, DMARC, Tracking, Bounce Webhooks)',
    appliesToProviders: ['brevo_api', 'klaviyo_api', 'mailchimp_api', 'sendgrid_api', 'resend_api', 'amazon_ses_api', 'postmark_api', 'mailgun_api', 'mautic', 'listmonk'],
    prerequisites: [
      'DNS control on the primary sending domain or dedicated subdomain (e.g., `mail.example.com`).',
      'Valid physical mailing address and clear unsubscribe process.',
    ],
    steps: [
      'Publish SPF TXT record authorizing only approved mail senders (never exceed 10 DNS lookups).',
      'Publish provider-issued 2048-bit DKIM TXT or CNAME records and verify active DKIM signing.',
      'Publish DMARC TXT record at `_dmarc.yourdomain` starting with `v=DMARC1; p=none; rua=mailto:...` then tighten to `quarantine`/`reject`.',
      'Configure custom CNAME tracking domain over HTTPS for open/click tracking alignment.',
      'Register bounce, spam complaint, and unsubscribe webhooks to automatically suppress risky addresses.',
    ],
    securityAndComplianceNotes: [
      'Amazon SES and Postmark require explicit production review before sending to arbitrary external recipients.',
    ],
  },
  {
    track: 'crm',
    title: 'CRM & Lead Pipeline Setup (Fields, Pipelines, Stages, Tags, Deduplication, Webhooks)',
    appliesToProviders: ['hubspot_crm_api', 'pipedrive_api', 'zoho_crm_api', 'salesforce_rest_api', 'gohighlevel_api', 'attio_api', 'airtable_api'],
    prerequisites: [
      'Defined canonical lead schema (name, email, phone, source/UTM, consent, lifecycle stage).',
      'Unique primary matching key (email or normalized E.164 phone) to prevent duplicate contacts.',
    ],
    steps: [
      'Create custom UTM & channel attribution fields on Contact/Lead objects.',
      'Define standard pipeline stages (New Lead -> Qualified -> Consultation -> Proposal -> Won/Lost).',
      'Configure idempotent upsert rules using external key / email deduplication.',
      'Register signed CRM webhooks for stage updates and verify signature headers.',
      'Export verified configuration manually from ALOAPI for the owner to review before CRM import.',
    ],
    securityAndComplianceNotes: [
      'ALOAPI remains strictly decoupled and NEVER writes directly into your internal marketing CRM automatically.',
    ],
  },
];

function complexityForProvider(p: IntegrationProviderRecord): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (p.implementationLevel === 0) return 'HIGH';
  if (p.oauthSupport && p.developerApproval.toLowerCase().includes('review')) return 'HIGH';
  if (p.oauthSupport || p.environmentVariables.length >= 3) return 'MEDIUM';
  return 'LOW';
}

function frictionForProvider(p: IntegrationProviderRecord): ScoredRecommendation['approvalFriction'] {
  const combined = `${p.developerApproval} ${p.businessVerificationRequirements}`.toLowerCase();
  if (combined.includes('business verification') || combined.includes('kyc')) return 'BUSINESS_VERIFICATION_REQUIRED';
  if (combined.includes('review') || combined.includes('approval') || combined.includes('audit') || combined.includes('allowlist')) {
    return 'APP_REVIEW_REQUIRED';
  }
  return 'SELF_SERVE';
}

function channelMatches(provider: IntegrationProviderRecord, channels: Set<string>): boolean {
  const map: Record<string, string[]> = {
    social: ['Social Media and Publishing'],
    messaging: ['Messaging and Customer Communication'],
    ads: ['Paid Advertising'],
    email: ['Email Marketing'],
    crm: ['CRM and Sales'],
    seo: ['SEO and Website Marketing'],
    analytics: ['Analytics and Customer Data'],
    ecommerce: ['Ecommerce and Marketplace'],
    automation: ['Workflow Automation'],
    forms: ['Forms, Landing Pages and Scheduling'],
  };
  for (const ch of channels) {
    if ((map[ch.toLowerCase()] ?? []).includes(provider.canonicalCategory)) return true;
  }
  return false;
}

export function evaluateRecommendations(input: ClientRequirementInput) {
  const channels = new Set(input.requiredChannels.map(c => c.toLowerCase()));
  const owned = new Set(input.existingAccounts);
  const requested = new Set(input.requiredIntegrations);
  const scored: ScoredRecommendation[] = [];

  for (const provider of ALL_INTEGRATION_CATALOG) {
    if (provider.category === 'agent-library' || provider.category === 'research') continue;
    if (provider.implementationLevel === 0) continue;

    let score = 45;
    const whyFits: string[] = [];

    if (requested.has(provider.key)) {
      score += 35;
      whyFits.push('Explicitly requested in your integration requirements.');
    }
    if (owned.has(provider.key)) {
      score += 20;
      whyFits.push('Already owned by your team (reduces onboarding friction).');
    }
    if (channelMatches(provider, channels)) {
      score += 18;
      whyFits.push(`Directly serves required category: ${provider.canonicalCategory}.`);
    }

    // Business model & ecommerce affinity
    if (input.ecommercePlatform !== 'none') {
      if (provider.key.startsWith(input.ecommercePlatform)) {
        score += 30;
        whyFits.push(`Matches your primary ecommerce platform (${input.ecommercePlatform}).`);
      }
      if (provider.key === 'klaviyo_api' && input.businessModel === 'd2c_ecommerce') {
        score += 18;
        whyFits.push('Strong behavioral segmentation for D2C ecommerce.');
      }
    }

    if (input.businessModel === 'b2b' || input.businessModel === 'saas' || input.businessModel === 'agency') {
      if (['linkedin_platform', 'hubspot_crm_api', 'pipedrive_api', 'calendly_api', 'calcom_api'].includes(provider.key)) {
        score += 14;
        whyFits.push('High B2B lead conversion & sales pipeline alignment.');
      }
    }
    if (input.businessModel === 'education' || input.businessModel === 'local_service') {
      if (['meta_facebook_pages', 'whatsapp_cloud_api', 'youtube_data_api', 'google_business_profile', 'tally_api'].includes(provider.key)) {
        score += 14;
        whyFits.push('Strong fit for local student/customer inquiry conversion & messaging.');
      }
    }

    // Budget & technical preferences
    const isFreeFriendly = /open-source|free|self-hosted/i.test(`${provider.rateLimitsAndPricing} ${provider.pricingPlanLimitations}`);
    if (input.budgetConstraint === 'free_and_open_source_first' && isFreeFriendly) {
      score += 16;
      whyFits.push('Matches open-source / zero-license cost constraint.');
    }
    if (input.automationPreferences === 'self_hosted_open_source' && /self-hosted|open-source|mit|agpl|gpl/i.test(provider.rateLimitsAndPricing)) {
      score += 16;
      whyFits.push('Supports owner-controlled self-hosted deployment.');
    }
    if (input.technicalExperience === 'non_technical' && complexityForProvider(provider) === 'HIGH') {
      score -= 10;
    }

    // Privacy & regional alignment
    const regionalCombined = provider.regionalAvailability.toLowerCase();
    if (input.targetCountries.some(c => c.toLowerCase() === 'eu') && /eu residency|api-eu|eu\.mailgun/i.test(`${provider.apiBaseUrls.join(' ')} ${provider.rateLimitsAndPricing}`)) {
      score += 8;
      whyFits.push('Offers explicit EU regional data residency.');
    }
    if (regionalCombined.includes('japan') && !input.targetCountries.some(c => /jp|japan|th|tw|id/i.test(c))) {
      score -= 18;
    }

    // Filter out clearly irrelevant non-matching low-score tools
    const matchesChannelOrExplicit = requested.has(provider.key) || owned.has(provider.key) || channelMatches(provider, channels) || score >= 68;
    const tier: ScoredRecommendation['tier'] = !matchesChannelOrExplicit
      ? 'EXCLUDED'
      : requested.has(provider.key) || score >= 82
        ? 'REQUIRED'
        : score >= 62
          ? 'RECOMMENDED'
          : 'OPTIONAL';

    scored.push({
      providerKey: provider.key,
      displayName: provider.displayName,
      canonicalCategory: provider.canonicalCategory,
      tier,
      score: Math.max(0, Math.min(100, score)),
      whyFits: whyFits.length ? whyFits : [`Covers ${provider.canonicalCategory} with official API support.`],
      pros: provider.automationCapabilities.slice(0, 3),
      cons: provider.restrictions.slice(0, 2),
      expectedCost: provider.rateLimitsAndPricing,
      limitations: provider.knownLimitations,
      regionalAvailability: provider.regionalAvailability,
      setupComplexity: complexityForProvider(provider),
      approvalFriction: frictionForProvider(provider),
      alreadyOwned: owned.has(provider.key),
      implementationLevel: provider.implementationLevel,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const scoreMap = new Map(scored.map(s => [s.providerKey, s.score]));

  const comparisons: ComparisonPair[] = [
    {
      category: 'CRM and Sales',
      title: 'HubSpot vs Pipedrive vs Zoho CRM vs Attio',
      candidates: [
        { providerKey: 'hubspot_crm_api', displayName: 'HubSpot CRM', bestFor: 'All-in-one marketing + CRM free starter tier', costProfile: 'Free core CRM; paid Marketing Hubs scale fast', approvalNote: 'Self-serve Private Apps & OAuth', score: scoreMap.get('hubspot_crm_api') ?? 50 },
        { providerKey: 'pipedrive_api', displayName: 'Pipedrive', bestFor: 'Focused visual sales pipeline teams', costProfile: 'Affordable per-seat paid plans', approvalNote: 'Self-serve OAuth & API token', score: scoreMap.get('pipedrive_api') ?? 50 },
        { providerKey: 'zoho_crm_api', displayName: 'Zoho CRM', bestFor: 'Cost-effective multi-region CRM customization', costProfile: 'Free tier up to 3 users; low paid cost', approvalNote: 'Self-serve multi-DC OAuth', score: scoreMap.get('zoho_crm_api') ?? 50 },
        { providerKey: 'attio_api', displayName: 'Attio', bestFor: 'Modern schema-flexible SaaS/data-driven CRM', costProfile: 'Free starter workspace', approvalNote: 'Self-serve Workspace Token & HMAC webhooks', score: scoreMap.get('attio_api') ?? 50 },
      ],
      guidance: 'Pick HubSpot for unified marketing attribution, Pipedrive for pure sales velocity, Zoho for multi-DC cost efficiency, or Attio for clean API-first schemas.',
    },
    {
      category: 'Email Marketing',
      title: 'Brevo vs Klaviyo vs Resend vs Amazon SES vs Mautic',
      candidates: [
        { providerKey: 'brevo_api', displayName: 'Brevo', bestFor: 'Combined marketing + transactional emails on a lean budget', costProfile: 'Free 300/day; paid by email volume', approvalNote: 'Self-serve API key + DKIM', score: scoreMap.get('brevo_api') ?? 50 },
        { providerKey: 'klaviyo_api', displayName: 'Klaviyo', bestFor: 'Ecommerce lifecycle flows & revenue attribution', costProfile: 'Higher profile-based pricing', approvalNote: 'Self-serve PKCE OAuth / Private API key', score: scoreMap.get('klaviyo_api') ?? 50 },
        { providerKey: 'resend_api', displayName: 'Resend', bestFor: 'Developer-friendly transactional email & Svix webhooks', costProfile: 'Free 3,000/month', approvalNote: 'Self-serve API key + domain DNS', score: scoreMap.get('resend_api') ?? 50 },
        { providerKey: 'amazon_ses_api', displayName: 'Amazon SES v2', bestFor: 'Ultra-low-cost bulk & transactional relay ($0.10/1k)', costProfile: 'Lowest per-email cost; requires AWS ops', approvalNote: 'AWS Production Access review required', score: scoreMap.get('amazon_ses_api') ?? 50 },
        { providerKey: 'mautic', displayName: 'Mautic', bestFor: 'Full data ownership open-source automation', costProfile: 'Zero license cost (self-hosted)', approvalNote: 'Self-hosted OAuth2 + external SMTP', score: scoreMap.get('mautic') ?? 50 },
      ],
      guidance: 'Every email choice requires verified SPF, 2048-bit DKIM, DMARC, and bounce/complaint webhooks.',
    },
    {
      category: 'Paid Advertising',
      title: 'Meta Marketing API vs Google Ads API vs TikTok Marketing API',
      candidates: [
        { providerKey: 'meta_marketing_api', displayName: 'Meta Marketing API', bestFor: 'Visual social demand gen, Lead Ads & WhatsApp click-to-chat', costProfile: 'Free API; Business Verification required', approvalNote: 'Meta App Review + Business Verification', score: scoreMap.get('meta_marketing_api') ?? 50 },
        { providerKey: 'google_ads_api', displayName: 'Google Ads API', bestFor: 'High-intent search, YouTube & Performance Max reporting', costProfile: 'Free API; MCC Developer Token review', approvalNote: 'Developer Token review for production', score: scoreMap.get('google_ads_api') ?? 50 },
        { providerKey: 'tiktok_business_api', displayName: 'TikTok Marketing API', bestFor: 'Short-form video awareness & instant lead forms', costProfile: 'Free API; Business App review', approvalNote: 'TikTok Business App review', score: scoreMap.get('tiktok_business_api') ?? 50 },
      ],
      guidance: 'Keep ad spend & billing configured solely by the owner in official ad managers; ALOAPI reads verified insights and lead capture securely.',
    },
    {
      category: 'Workflow Automation',
      title: 'n8n vs Activepieces vs Make vs Zapier',
      candidates: [
        { providerKey: 'n8n', displayName: 'n8n', bestFor: 'Self-hostable visual workflows with full API/code flexibility', costProfile: 'Self-hosted fair-code or Cloud', approvalNote: 'Self-serve API key', score: scoreMap.get('n8n') ?? 50 },
        { providerKey: 'activepieces', displayName: 'Activepieces', bestFor: 'MIT open-source clean no-code automation builder', costProfile: 'Self-hosted MIT or Cloud', approvalNote: 'Self-serve Bearer token', score: scoreMap.get('activepieces') ?? 50 },
        { providerKey: 'make_api', displayName: 'Make', bestFor: 'Managed cloud visual routing with EU/US zones', costProfile: 'Operation-based SaaS tiers', approvalNote: 'Self-serve API token', score: scoreMap.get('make_api') ?? 50 },
        { providerKey: 'zapier_platform_api', displayName: 'Zapier', bestFor: 'Broadest 7,000+ long-tail SaaS connector directory', costProfile: 'Higher task pricing on scale', approvalNote: 'Catch Hook URL / Partner OAuth', score: scoreMap.get('zapier_platform_api') ?? 50 },
      ],
      guidance: 'Prefer n8n or Activepieces when cost control and self-hosting matter; choose Zapier/Make for managed SaaS speed.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    tenantId: input.tenantId,
    businessName: input.businessName,
    requiredPlatforms: scored.filter(s => s.tier === 'REQUIRED'),
    recommendedPlatforms: scored.filter(s => s.tier === 'RECOMMENDED').slice(0, 12),
    optionalPlatforms: scored.filter(s => s.tier === 'OPTIONAL').slice(0, 12),
    excludedCount: scored.filter(s => s.tier === 'EXCLUDED').length,
    comparisons,
    playbooks: PLATFORM_SPECIFIC_PLAYBOOKS,
  };
}

export async function saveRequirementProfileAndRecommend(input: ClientRequirementInput) {
  const result = evaluateRecommendations(input);
  const existing = await db.clientRequirementProfile.findFirst({
    where: { clientId: input.tenantId },
    orderBy: { updatedAt: 'desc' },
  });

  const volumeCount = input.emailVolume === '250000_plus'
    ? 250000
    : input.emailVolume === '50000_to_250000'
      ? 50000
      : input.emailVolume === '2500_to_50000'
        ? 5000
        : 1000;

  const data = {
    clientId: input.tenantId,
    businessName: input.businessName,
    businessType: `${input.industry} (${input.businessModel})`,
    businessLocation: input.targetCountries.join(', ') || 'Global',
    targetMarket: input.targetCountries.join(', ') || 'Global',
    targetAudience: `${input.businessModel} · ${input.teamSize}`,
    marketingBudget: input.monthlyMarketingBudget,
    monthlyContactVolume: volumeCount,
    advertisingBudget: input.monthlyMarketingBudget,
    socialMediaChannels: JSON.stringify(input.requiredChannels),
    emailRequirements: JSON.stringify({ emailVolume: input.emailVolume, domain: input.existingWebsiteDomain }),
    messagingRequirements: JSON.stringify({ requiredChannels: input.requiredChannels }),
    crmRequirements: JSON.stringify({ technicalExperience: input.technicalExperience }),
    ecommerceRequirements: JSON.stringify({ ecommercePlatform: input.ecommercePlatform }),
    automationComplexity: input.automationPreferences,
    reportingRequirements: JSON.stringify({ privacyComplianceNeeds: input.privacyComplianceNeeds, budgetConstraint: input.budgetConstraint }),
    recommendations: JSON.stringify(result),
    selectedProviders: JSON.stringify(input.requiredIntegrations),
  };

  const saved = existing
    ? await db.clientRequirementProfile.update({ where: { id: existing.id }, data })
    : await db.clientRequirementProfile.create({ data });

  return { profile: saved, recommendation: result };
}
