import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { ALL_INTEGRATION_CATALOG } from '@/lib/intelligence/catalog';
import { sanitizeExternalDocContent } from '@/lib/onboarding/api-discovery';
import { redactSecretText } from '@/lib/onboarding/vault-service';
import { auditEvent } from '@/lib/security/audit';

export interface DiscoveredSocialProfile {
  network: string;
  providerKeyHint: string;
  url: string;
  handle: string | null;
}

export interface DiscoveredMarketingTech {
  name: string;
  providerKeyHint: string;
  evidence: string;
}

export interface WebsiteDiscoveryOutput {
  targetUrl: string;
  fetchStatus: 'fetched' | 'snapshot_provided' | 'error';
  httpStatus: number | null;
  businessName: string | null;
  logoUrl: string | null;
  domain: string;
  subdomains: string[];
  emails: string[];
  phones: string[];
  description: string | null;
  productsServices: string[];
  targetAudience: string | null;
  geographicMarkets: string[];
  socialProfiles: DiscoveredSocialProfile[];
  detectedMarketingTech: DiscoveredMarketingTech[];
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
  missingFields: string[];
  recommendedProviderKeys: string[];
  contentHash: string;
}

export function validateWebsiteDiscoveryUrl(rawUrl: string, allowLoopbackForTest = false): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid website URL.');
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('Website URL must use HTTPS or HTTP.');
  }
  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (isLoopback && !allowLoopbackForTest) {
    throw new Error('Loopback addresses are blocked in production website discovery.');
  }
  if (
    !isLoopback &&
    (host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '169.254.169.254' ||
      /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host))
  ) {
    throw new Error('Private/internal network hosts are blocked for SSRF protection.');
  }
  return parsed;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function extractMetaTag(html: string, attrName: 'name' | 'property', key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`<meta\\b[^>]*${attrName}=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const re2 = new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${escaped}["'][^>]*>`, 'i');
  const match = re1.exec(html) || re2.exec(html);
  return match ? decodeHtmlEntities(match[1]) : null;
}

function extractJsonLdObjects(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) {
        for (const item of parsed) if (item && typeof item === 'object') out.push(item as Record<string, unknown>);
      } else if (parsed && typeof parsed === 'object') {
        out.push(parsed as Record<string, unknown>);
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return out;
}

function resolveMaybeRelativeUrl(baseUrl: URL, candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

const SOCIAL_PATTERNS: { network: string; providerKeyHint: string; hostRe: RegExp }[] = [
  { network: 'Facebook', providerKeyHint: 'meta_facebook_pages', hostRe: /(?:^|\.)(?:facebook\.com|fb\.com)$/i },
  { network: 'Instagram', providerKeyHint: 'instagram_graph', hostRe: /(?:^|\.)instagram\.com$/i },
  { network: 'YouTube', providerKeyHint: 'youtube_data', hostRe: /(?:^|\.)(?:youtube\.com|youtu\.be)$/i },
  { network: 'TikTok', providerKeyHint: 'tiktok_business', hostRe: /(?:^|\.)tiktok\.com$/i },
  { network: 'LinkedIn', providerKeyHint: 'linkedin_marketing', hostRe: /(?:^|\.)linkedin\.com$/i },
  { network: 'X (Twitter)', providerKeyHint: 'x_api', hostRe: /(?:^|\.)(?:x\.com|twitter\.com)$/i },
  { network: 'Pinterest', providerKeyHint: 'pinterest_api', hostRe: /(?:^|\.)pinterest\.com$/i },
  { network: 'Snapchat', providerKeyHint: 'snapchat_marketing', hostRe: /(?:^|\.)snapchat\.com$/i },
  { network: 'WhatsApp', providerKeyHint: 'whatsapp_cloud_api', hostRe: /(?:^|\.)(?:wa\.me|whatsapp\.com)$/i },
  { network: 'Telegram', providerKeyHint: 'telegram_bot_api', hostRe: /(?:^|\.)(?:t\.me|telegram\.me)$/i },
];

export function parseWebsiteHtml(htmlRaw: string, baseUrl: URL): Omit<WebsiteDiscoveryOutput, 'targetUrl' | 'fetchStatus' | 'httpStatus'> {
  const { sanitized } = sanitizeExternalDocContent(htmlRaw);
  const rootParts = baseUrl.hostname.toLowerCase().split('.');
  const rootDomain = rootParts.length >= 2 ? rootParts.slice(-2).join('.') : baseUrl.hostname.toLowerCase();

  const jsonLd = extractJsonLdObjects(htmlRaw);
  const orgNode = jsonLd.find(o => /Organization|LocalBusiness|Corporation/i.test(String(o['@type'] || '')));

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(sanitized);
  const cleanTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]).split(/[|\-–—]/)[0].trim() : null;
  const businessName =
    (typeof orgNode?.name === 'string' && orgNode.name.trim()) ||
    extractMetaTag(sanitized, 'property', 'og:site_name') ||
    extractMetaTag(sanitized, 'property', 'og:title') ||
    cleanTitle ||
    null;

  const iconMatch = /<link\b[^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*href=["']([^"']+)["'][^>]*>/i.exec(sanitized);
  const logoRaw =
    (typeof orgNode?.logo === 'string' ? orgNode.logo : null) ||
    extractMetaTag(sanitized, 'property', 'og:image') ||
    (iconMatch ? iconMatch[1] : null);
  const logoUrl = resolveMaybeRelativeUrl(baseUrl, logoRaw);

  const description =
    (typeof orgNode?.description === 'string' && orgNode.description.trim()) ||
    extractMetaTag(sanitized, 'name', 'description') ||
    extractMetaTag(sanitized, 'property', 'og:description') ||
    null;

  const subdomainsSet = new Set<string>();
  const emailsSet = new Set<string>();
  const phonesSet = new Set<string>();
  const socialProfiles: DiscoveredSocialProfile[] = [];
  const seenSocialUrls = new Set<string>();
  let privacyPolicyUrl: string | null = null;
  let termsUrl: string | null = null;

  // Emails & phones from JSON-LD
  if (typeof orgNode?.email === 'string') emailsSet.add(orgNode.email.trim().toLowerCase());
  if (typeof orgNode?.telephone === 'string') phonesSet.add(orgNode.telephone.trim());

  // Extract all href attributes cleanly
  const hrefRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = hrefRe.exec(htmlRaw)) !== null) {
    const rawHref = decodeHtmlEntities(linkMatch[1]);
    const linkText = linkMatch[2].replace(/<[^>]+>/g, ' ').trim().toLowerCase();

    if (rawHref.toLowerCase().startsWith('mailto:')) {
      const em = rawHref.slice(7).split('?')[0].trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) emailsSet.add(em);
      continue;
    }
    if (rawHref.toLowerCase().startsWith('tel:')) {
      const ph = rawHref.slice(4).trim();
      if (ph.length >= 6) phonesSet.add(ph);
      continue;
    }

    const resolved = resolveMaybeRelativeUrl(baseUrl, rawHref);
    if (!resolved) continue;

    let parsedLink: URL;
    try {
      parsedLink = new URL(resolved);
    } catch {
      continue;
    }

    const linkHost = parsedLink.hostname.toLowerCase();
    if (linkHost !== baseUrl.hostname.toLowerCase() && linkHost.endsWith(`.${rootDomain}`)) {
      subdomainsSet.add(linkHost);
    }

    for (const soc of SOCIAL_PATTERNS) {
      if (soc.hostRe.test(linkHost) && !seenSocialUrls.has(resolved)) {
        seenSocialUrls.add(resolved);
        const pathSeg = parsedLink.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || null;
        socialProfiles.push({
          network: soc.network,
          providerKeyHint: soc.providerKeyHint,
          url: resolved,
          handle: pathSeg,
        });
      }
    }

    const combined = `${parsedLink.pathname.toLowerCase()} ${linkText}`;
    if (!privacyPolicyUrl && /privacy/.test(combined)) privacyPolicyUrl = resolved;
    if (!termsUrl && /(?:terms|tos|conditions)/.test(combined)) termsUrl = resolved;
  }

  // Also check explicit email matches inside plain visible text
  const textOnly = sanitized.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
  for (const em of textOnly.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []) {
    if (!/\.(png|jpg|jpeg|svg|webp)$/i.test(em)) emailsSet.add(em.toLowerCase());
  }

  // Products / services from JSON-LD or <h2> headings
  const productsSet = new Set<string>();
  for (const node of jsonLd) {
    if (/Product|Service|Offer/i.test(String(node['@type'] || '')) && typeof node.name === 'string') {
      productsSet.add(node.name.trim());
    }
  }
  const h2Re = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
  let h2Match: RegExpExecArray | null;
  while ((h2Match = h2Re.exec(sanitized)) !== null && productsSet.size < 8) {
    const clean = h2Match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length >= 4 && clean.length <= 80) productsSet.add(clean);
  }

  // Explicit geographic & language evidence only
  const marketsSet = new Set<string>();
  const htmlLang = /<html\b[^>]*lang=["']([a-zA-Z-]+)["']/i.exec(htmlRaw)?.[1];
  if (htmlLang) marketsSet.add(htmlLang);
  if (typeof orgNode?.areaServed === 'string') marketsSet.add(orgNode.areaServed.trim());

  const targetAudience = extractMetaTag(sanitized, 'name', 'audience') || extractMetaTag(sanitized, 'name', 'keywords') || null;

  // Detect existing marketing/analytics/payment integrations from HTML tags
  const detectedMarketingTech: DiscoveredMarketingTech[] = [];
  const techChecks: { name: string; providerKeyHint: string; re: RegExp }[] = [
    { name: 'Google Analytics 4', providerKeyHint: 'google_analytics4', re: /gtag\(['"]config['"],\s*['"]G-[A-Z0-9]+|googletagmanager\.com\/gtag\/js\?id=G-/i },
    { name: 'Google Tag Manager', providerKeyHint: 'google_tag_manager', re: /GTM-[A-Z0-9]{4,}/i },
    { name: 'Meta Pixel', providerKeyHint: 'meta_marketing_api', re: /connect\.facebook\.net|fbq\(['"]init['"]/i },
    { name: 'Shopify Storefront', providerKeyHint: 'shopify_admin', re: /cdn\.shopify\.com|Shopify\.shop/i },
    { name: 'Stripe Payments', providerKeyHint: 'stripe_api', re: /js\.stripe\.com/i },
    { name: 'HubSpot Tracking', providerKeyHint: 'hubspot_crm', re: /js\.hs-scripts\.com|hsforms\.net/i },
    { name: 'Mailchimp', providerKeyHint: 'mailchimp_api', re: /chimpstatic\.com|list-manage\.com/i },
    { name: 'Intercom', providerKeyHint: 'intercom_api', re: /widget\.intercom\.io/i },
    { name: 'Zendesk', providerKeyHint: 'zendesk_api', re: /static\.zdassets\.com/i },
  ];
  for (const tc of techChecks) {
    const m = tc.re.exec(htmlRaw);
    if (m) detectedMarketingTech.push({ name: tc.name, providerKeyHint: tc.providerKeyHint, evidence: m[0].slice(0, 80) });
  }

  const missingFields: string[] = [];
  if (!businessName) missingFields.push('businessName');
  if (!description) missingFields.push('description');
  if (emailsSet.size === 0) missingFields.push('businessEmail');
  if (phonesSet.size === 0) missingFields.push('businessPhone');
  if (!privacyPolicyUrl) missingFields.push('privacyPolicyUrl');
  if (!termsUrl) missingFields.push('termsUrl');
  if (socialProfiles.length === 0) missingFields.push('socialProfiles');
  if (!targetAudience) missingFields.push('targetAudience');

  // Map discovered profiles & marketing tech to verified external catalog providers (no duplicates)
  const catalogSet = new Set(ALL_INTEGRATION_CATALOG.map(p => p.key));
  const recSet = new Set<string>();
  for (const sp of socialProfiles) if (catalogSet.has(sp.providerKeyHint)) recSet.add(sp.providerKeyHint);
  for (const dt of detectedMarketingTech) if (catalogSet.has(dt.providerKeyHint)) recSet.add(dt.providerKeyHint);
  // Always include foundational growth stack recommendations if present in catalog
  for (const core of ['meta_facebook_pages', 'google_analytics4', 'sendgrid_api', 'whatsapp_cloud_api', 'hubspot_crm']) {
    if (catalogSet.has(core)) recSet.add(core);
  }

  const contentHash = createHash('sha256').update(sanitized).digest('hex');

  return {
    businessName,
    logoUrl,
    domain: baseUrl.hostname.toLowerCase(),
    subdomains: Array.from(subdomainsSet),
    emails: Array.from(emailsSet),
    phones: Array.from(phonesSet),
    description,
    productsServices: Array.from(productsSet),
    targetAudience,
    geographicMarkets: Array.from(marketsSet),
    socialProfiles,
    detectedMarketingTech,
    privacyPolicyUrl,
    termsUrl,
    missingFields,
    recommendedProviderKeys: Array.from(recSet),
    contentHash,
  };
}

export async function runWebsiteBusinessDiscovery(params: {
  clientId?: string;
  projectName?: string;
  websiteUrl: string;
  htmlSnapshotFallback?: string;
  allowLoopbackForTest?: boolean;
  actor: string;
  ip?: string;
}) {
  const parsedUrl = validateWebsiteDiscoveryUrl(params.websiteUrl, Boolean(params.allowLoopbackForTest));
  let fetchStatus: 'fetched' | 'snapshot_provided' | 'error' = 'snapshot_provided';
  let httpStatus: number | null = null;
  let html = params.htmlSnapshotFallback || '';
  let fetchError: string | null = null;

  if (!html) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(parsedUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'ALOAPI-DiscoveryAgent/1.0 (+https://aloapi.local)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });
      httpStatus = res.status;
      html = await res.text();
      fetchStatus = res.ok ? 'fetched' : 'error';
      if (!res.ok) fetchError = `Remote website returned HTTP ${res.status}.`;
    } catch (err) {
      fetchStatus = 'error';
      fetchError = redactSecretText(err instanceof Error ? err.message : 'Website fetch failed');
    } finally {
      clearTimeout(timer);
    }
  }

  const parsed = html
    ? parseWebsiteHtml(html, parsedUrl)
    : {
        businessName: null,
        logoUrl: null,
        domain: parsedUrl.hostname.toLowerCase(),
        subdomains: [],
        emails: [],
        phones: [],
        description: null,
        productsServices: [],
        targetAudience: null,
        geographicMarkets: [],
        socialProfiles: [],
        detectedMarketingTech: [],
        privacyPolicyUrl: null,
        termsUrl: null,
        missingFields: ['websiteReachable', 'businessName', 'businessEmail', 'privacyPolicyUrl', 'termsUrl'],
        recommendedProviderKeys: ['meta_facebook_pages', 'google_analytics4', 'sendgrid_api', 'whatsapp_cloud_api', 'hubspot_crm'],
        contentHash: createHash('sha256').update(parsedUrl.toString()).digest('hex'),
      };

  const clientId = params.clientId || 'default-workspace';
  const projectName = params.projectName?.trim() || parsed.businessName || `Project (${parsed.domain})`;

  const project = await db.integrationProject.create({
    data: {
      clientId,
      name: projectName,
      websiteUrl: parsedUrl.toString(),
      domain: parsed.domain,
      businessProfileJson: JSON.stringify({
        businessName: parsed.businessName,
        logoUrl: parsed.logoUrl,
        domain: parsed.domain,
        subdomains: parsed.subdomains,
        emails: parsed.emails,
        phones: parsed.phones,
        description: parsed.description,
        productsServices: parsed.productsServices,
        targetAudience: parsed.targetAudience,
        geographicMarkets: parsed.geographicMarkets,
        privacyPolicyUrl: parsed.privacyPolicyUrl,
        termsUrl: parsed.termsUrl,
      }),
      missingFieldsJson: JSON.stringify(parsed.missingFields),
      recommendedProvidersJson: JSON.stringify(parsed.recommendedProviderKeys),
      selectedProvidersJson: JSON.stringify(parsed.recommendedProviderKeys),
      status: 'discovery',
      createdBy: params.actor,
    },
  });

  const report = await db.websiteDiscoveryReport.create({
    data: {
      projectId: project.id,
      targetUrl: parsedUrl.toString(),
      fetchStatus,
      httpStatus,
      businessName: parsed.businessName,
      logoUrl: parsed.logoUrl,
      domainsJson: JSON.stringify([parsed.domain, ...parsed.subdomains]),
      emailsJson: JSON.stringify(parsed.emails),
      phonesJson: JSON.stringify(parsed.phones),
      description: parsed.description,
      productsJson: JSON.stringify(parsed.productsServices),
      targetAudience: parsed.targetAudience,
      geographicMarkets: JSON.stringify(parsed.geographicMarkets),
      socialProfilesJson: JSON.stringify(parsed.socialProfiles),
      detectedTechJson: JSON.stringify(parsed.detectedMarketingTech),
      privacyPolicyUrl: parsed.privacyPolicyUrl,
      termsUrl: parsed.termsUrl,
      missingFieldsJson: JSON.stringify(parsed.missingFields),
      contentHash: parsed.contentHash,
      rawEvidenceJson: JSON.stringify({ fetchError, httpStatus }),
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'engineering.discovery.website',
    target: `${project.id}:${parsed.domain}`,
    ip: params.ip,
    metadata: {
      fetchStatus,
      httpStatus,
      foundSocialCount: parsed.socialProfiles.length,
      detectedTechCount: parsed.detectedMarketingTech.length,
      missingFieldsCount: parsed.missingFields.length,
    },
  });

  return {
    project,
    report,
    discovery: {
      ...parsed,
      targetUrl: parsedUrl.toString(),
      fetchStatus,
      httpStatus,
      fetchError,
    },
  };
}
