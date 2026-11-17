import { createHash } from 'node:crypto';
import * as zlib from 'node:zlib';
import type { IntegrationProviderRecord } from './types';

export interface ExportVariable { name: string; secret: boolean; required: boolean; purpose: string }
export interface ExportDoc { label: string; url: string }
export interface ExportProvider {
  key: string;
  name: string;
  category: string;
  verificationStatus: string;
  collectedAt: string;
  officialDocs: ExportDoc[];
  apiBaseUrls: string[];
  authentication: string[];
  oauthScopes: string[];
  applicationRequirements: string;
  accountRequirements: string;
  endpoints: string[];
  webhooks: string;
  rateLimitsAndPricing: string;
  developerApproval: string;
  environmentVariables: ExportVariable[];
  automationCapabilities: string[];
  restrictions: string[];
  productionNotes: string;
  lastCheckedAt?: string | null;
  recordedAccounts?: number;
  configuredAccounts?: number;
  authorizedAccounts?: number;
  verifiedAccounts?: number;
}

export function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function csv(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function yaml(value: string): string {
  return JSON.stringify(value);
}

function asYamlList(values: string[]): string[] {
  if (!values.length) return ['  []'];
  return values.map(value => `  - ${yaml(value)}`);
}

function providerYaml(item: ExportProvider): string {
  const lines = [
    `provider: ${yaml(item.key)}`,
    `name: ${yaml(item.name)}`,
    `category: ${yaml(item.category)}`,
    `documentation_status: ${yaml(item.verificationStatus)}`,
    'account_status: "REQUIRES_USER_ACTION"',
    'authorization_status: "NOT_AUTHORIZED_BY_THIS_EXPORT"',
    'official_docs:',
    ...(item.officialDocs.length ? item.officialDocs.flatMap(doc => [`  - label: ${yaml(doc.label)}`, `    url: ${yaml(doc.url)}`]) : ['  []']),
    'api_base_urls:', ...asYamlList(item.apiBaseUrls),
    'authentication:', ...asYamlList(item.authentication),
    'oauth_scopes:', ...asYamlList(item.oauthScopes),
    'application_requirements: >-', `  ${item.applicationRequirements}`,
    'account_requirements: >-', `  ${item.accountRequirements}`,
    'endpoints:', ...asYamlList(item.endpoints),
    'webhooks: >-', `  ${item.webhooks}`,
    'rate_limits_and_pricing: >-', `  ${item.rateLimitsAndPricing}`,
    'developer_approval: >-', `  ${item.developerApproval}`,
    'environment_variables:',
  ];
  if (item.environmentVariables.length) {
    for (const field of item.environmentVariables) {
      lines.push(`  - name: ${yaml(field.name)}`, `    secret: ${field.secret}`, `    required: ${field.required}`, `    purpose: ${yaml(field.purpose)}`, '    value: ""');
    }
  } else lines.push('  []');
  lines.push('automation_capabilities:', ...asYamlList(item.automationCapabilities));
  lines.push('restrictions:', ...asYamlList(item.restrictions));
  lines.push('production_notes: >-', `  ${item.productionNotes}`);
  lines.push('# Never place passwords, OTPs, recovery codes, access tokens, phone numbers, or private account data in this template.');
  return `${lines.join('\n')}\n`;
}

function markdown(providers: ExportProvider[], generatedAt: string): string {
  const code = (value: string) => '`' + value.replace(/`/g, '\\`') + '`';
  const lines = [
    '# ALOAPI Integration Intelligence Export',
    '',
    `Generated: ${generatedAt}`, '',
    '> Documentation and provider setup guidance only. A catalog entry is not proof of account access, authorization, live connectivity, current quota, or app approval.',
    '> This export contains no credentials, phone numbers, account identifiers, raw webhook payloads, or plaintext secrets.',
    '',
    '## Provider index', '',
    '| Provider | Category | State | Official documentation |',
    '|---|---|---|---|',
    ...providers.map(item => `| ${item.name.replace(/\|/g, '\\|')} | ${item.category} | ${item.verificationStatus} | ${item.officialDocs[0] ? `[${item.officialDocs[0].label}](${item.officialDocs[0].url})` : 'Not linked'} |`),
    '',
    '## Provider details', '',
  ];
  for (const item of providers) {
    lines.push(
      `### ${item.name}`, '',
      `- **Key:** ${code(item.key)}`,
      `- **Category:** ${item.category}`,
      `- **Documentation state:** ${item.verificationStatus}`,
      `- **Current check:** ${item.lastCheckedAt ?? 'Not checked from this workspace'}`,
      `- **Account records:** ${item.recordedAccounts ?? 0}; configured: ${item.configuredAccounts ?? 0}; authorized: 0; verified: 0`,
      '', 'Official documentation:',
    );
    if (item.officialDocs.length) for (const doc of item.officialDocs) lines.push(`- [${doc.label}](${doc.url})`);
    else lines.push('- No official documentation URL verified for this inventory entry.');
    lines.push(
      '', '**API base URLs**', '', ...(item.apiBaseUrls.length ? item.apiBaseUrls.map(value => `- ${code(value)}`) : ['- Not verified.']),
      '', '**Authentication**', '', ...(item.authentication.length ? item.authentication.map(value => `- ${value}`) : ['- No authentication pattern asserted.']),
      '', '**OAuth scopes**', '', ...(item.oauthScopes.length ? item.oauthScopes.map(value => `- ${code(value)}`) : ['- None listed.']),
      '', '**Application and account requirements**', '', `- ${item.applicationRequirements}`, `- ${item.accountRequirements}`,
      '', '**Documented endpoint examples**', '', ...(item.endpoints.length ? item.endpoints.map(value => `- ${code(value)}`) : ['- None verified.']),
      '', `**Webhooks:** ${item.webhooks}`, '', `**Rate limits and pricing:** ${item.rateLimitsAndPricing}`,
      '', `**Developer approval:** ${item.developerApproval}`, '',
      '**Environment template keys (all values intentionally empty)**', '',
      ...(item.environmentVariables.length ? item.environmentVariables.map(value => `- ${code(value.name)} — ${value.secret ? 'secret' : 'identifier/config'}, ${value.required ? 'required for documented flow' : 'optional'}, ${value.purpose}`) : ['- None.']),
      '', '**Automation capabilities**', '', ...(item.automationCapabilities.length ? item.automationCapabilities.map(value => `- ${value}`) : ['- Not established.']),
      '', '**Restrictions and cautions**', '', ...(item.restrictions.length ? item.restrictions.map(value => `- ${value}`) : ['- Re-check provider rules before use.']),
      '', `**Workspace note:** ${item.productionNotes}`, '', '---', '',
    );
  }
  return `${lines.join('\n')}\n`;
}

function verificationJson(providers: ExportProvider[], generatedAt: string): string {
  return `${JSON.stringify({
    exportType: 'aloapi-integration-intelligence',
    generatedAt,
    liveProviderChecksPerformed: false,
    oauthAuthorizationsPerformed: false,
    accountVerificationPerformed: false,
    providerStates: providers.map(item => ({
      key: item.key,
      documentationStatus: item.verificationStatus,
      documentationCollectedAt: item.collectedAt,
      lastCheckedAt: item.lastCheckedAt ?? null,
      recordedAccounts: item.recordedAccounts ?? 0,
      configuredAccounts: item.configuredAccounts ?? 0,
      authorizedAccounts: 0,
      verifiedAccounts: 0,
      liveCheckPerformed: false,
    })),
    limitations: [
      'Documentation review is not an OAuth grant or provider health check.',
      'Provider quota, pricing, API versions, app approval and regional eligibility must be re-checked in official provider interfaces before use.',
      'No external actions (publishing, message sending, ad spend, asset mutation) were performed.',
      'This file intentionally contains no secret values, account identifiers, phone numbers, OTPs, or webhook payloads.',
    ],
  }, null, 2)}\n`;
}

function environmentExample(providers: ExportProvider[]): string {
  const names = new Map<string, string>();
  for (const item of providers) for (const variable of item.environmentVariables) {
    if (!names.has(variable.name)) names.set(variable.name, item.key);
  }
  const lines = [
    '# ALOAPI provider environment template — placeholders only.',
    '# Keep real secrets in the encrypted server-side vault, never in Git or browser storage.',
    '# This file contains no working credentials and is not an authorization proof.',
    'ALOAPI_HOST="127.0.0.1"',
    'ALOAPI_PORT="47831"',
    'ALOAPI_VAULT_KEY=""',
    'ALOAPI_PUBLIC_WEBHOOK_BASE_URL=""',
    '',
  ];
  for (const [name, providerKey] of names) lines.push(`# ${providerKey}`, `${name}=""`, '');
  return `${lines.join('\n')}\n`;
}

function tarHeader(path: string, size: number, mtimeSeconds: number): Buffer {
  if (path.length > 100 || path.startsWith('/') || path.split('/').some(part => part === '..')) throw new Error('Invalid archive path');
  const header = Buffer.alloc(512);
  header.write(path, 0, 100, 'utf8');
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, mtimeSeconds);
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const checksumText = checksum.toString(8).padStart(6, '0');
  header.write(checksumText, 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function writeOctal(buffer: Buffer, offset: number, width: number, value: number): void {
  const text = Math.max(0, Math.floor(value)).toString(8).padStart(width - 1, '0');
  if (text.length >= width) throw new Error('Tar field overflow');
  buffer.write(text, offset, width - 1, 'ascii');
  buffer[offset + width - 1] = 0;
}

function createTar(files: Record<string, string>, mtimeSeconds: number): Buffer {
  const chunks: Buffer[] = [];
  for (const [path, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const data = Buffer.from(content, 'utf8');
    chunks.push(tarHeader(path, data.length, mtimeSeconds), data);
    const remainder = data.length % 512;
    if (remainder) chunks.push(Buffer.alloc(512 - remainder));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

export function createIntegrationPackage(providers: ExportProvider[], generatedAt = new Date().toISOString()) {
  const safeProviders: ExportProvider[] = providers.map(item => ({
    // Copy only approved catalog fields: never spread account/secret metadata from callers.
    key: item.key,
    name: item.name,
    category: item.category,
    verificationStatus: item.verificationStatus,
    collectedAt: item.collectedAt,
    officialDocs: (item.officialDocs ?? []).map(doc => ({ label: doc.label, url: doc.url })),
    apiBaseUrls: [...(item.apiBaseUrls ?? [])],
    authentication: [...(item.authentication ?? [])],
    oauthScopes: [...(item.oauthScopes ?? [])],
    applicationRequirements: item.applicationRequirements,
    accountRequirements: item.accountRequirements,
    endpoints: [...(item.endpoints ?? [])],
    webhooks: item.webhooks,
    rateLimitsAndPricing: item.rateLimitsAndPricing,
    developerApproval: item.developerApproval,
    environmentVariables: (item.environmentVariables ?? []).map(variable => ({
      name: variable.name, secret: variable.secret, required: variable.required, purpose: variable.purpose,
    })),
    automationCapabilities: [...(item.automationCapabilities ?? [])],
    restrictions: [...(item.restrictions ?? [])],
    productionNotes: item.productionNotes,
    lastCheckedAt: item.lastCheckedAt ?? null,
    recordedAccounts: Math.max(0, Math.floor(item.recordedAccounts ?? 0)),
    configuredAccounts: Math.max(0, Math.floor(item.configuredAccounts ?? 0)),
    // A documentation export cannot prove these states, even if an untrusted caller provides counts.
    authorizedAccounts: 0,
    verifiedAccounts: 0,
  }));
  const files: Record<string, string> = {
    'README.md': [
      '# ALOAPI Integration Intelligence Package', '',
      `Generated ${generatedAt}.`, '',
      'This package contains official-documentation pointers, manual setup requirements, state metadata, templates, a blank environment example, and integrity data.',
      'It contains no credential values, phone numbers, account identifiers, OTPs, recovery codes, raw webhook payloads, or token ciphertext.', '',
      '## Verify integrity', '',
      '- Check the SHA-256 values listed in `SHA256SUMS` against each named file.',
      '- The compressed archive SHA-256 is returned in the HTTP header `X-ALOAPI-Package-SHA256` and in the CLI `.sha256` sidecar.',
      '- No checksum is self-embedded in the compressed archive because that would be self-referential.', '',
      '## State meanings', '',
      '- `DISCOVERED`: catalogued; docs not yet reviewed.',
      '- `DOCUMENTED`: linked documentation has been inventoried; no live access inferred.',
      '- `CONFIGURED`: a local account/secret record exists in ALOAPI; it is not proof of authorization or token validity.',
      '- `AUTHORIZED`: the provider granted access through its official authorization flow.',
      '- `VERIFIED`: a permitted, read-only provider check succeeded and evidence/time are recorded.',
      '- `BLOCKED`: provider/product access is unavailable or denied for a documented reason.',
      '- `REQUIRES_USER_ACTION`: the provider owner must complete an action in the official portal.', '',
      'This export is an offline manual handoff only. It does not connect to or write into any CRM.', '',
    ].join('\n'),
    'catalog.json': `${JSON.stringify({ catalogVersion: '2026-11-15', generatedAt, providers: safeProviders }, null, 2)}\n`,
    'catalog.md': markdown(safeProviders, generatedAt),
    'providers.csv': [
      ['key', 'name', 'category', 'status', 'official_docs', 'api_base_urls', 'authentication', 'oauth_scopes', 'webhooks', 'rate_limits_and_pricing', 'developer_approval', 'recorded_accounts', 'configured_accounts', 'authorized_accounts', 'verified_accounts', 'last_checked_at'].map(csv).join(','),
      ...safeProviders.map(item => [
        item.key, item.name, item.category, item.verificationStatus,
        item.officialDocs.map(doc => `${doc.label}: ${doc.url}`).join(' | '), item.apiBaseUrls.join(' | '),
        item.authentication.join(' | '), item.oauthScopes.join(' | '), item.webhooks,
        item.rateLimitsAndPricing, item.developerApproval,
        item.recordedAccounts ?? 0, item.configuredAccounts ?? 0, 0, 0, item.lastCheckedAt ?? '',
      ].map(csv).join(',')),
      '',
    ].join('\n'),
    'verification.json': verificationJson(safeProviders, generatedAt),
    'templates/provider-template.yaml': [
      'provider: "REPLACE_WITH_PROVIDER_KEY"',
      'verification_status: "DISCOVERED"',
      'official_docs: []',
      'oauth_scopes: []',
      'environment_variables:',
      '  - name: "EXAMPLE_SECRET_NAME"',
      '    secret: true',
      '    value: ""',
      'authorization: "REQUIRES_USER_ACTION"',
      'note: "Blank, documentation-only template. Never put passwords or OTPs here."',
      '',
    ].join('\n'),
    '.env.example': environmentExample(safeProviders),
  };
  for (const item of safeProviders) files[`templates/${item.key}.yaml`] = providerYaml(item);

  const fileManifest = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => ({
    path, bytes: Buffer.byteLength(content, 'utf8'), sha256: sha256(content),
  }));
  files['manifest.json'] = `${JSON.stringify({
    package: 'aloapi-integration-intelligence',
    version: '2026-11-15',
    generatedAt,
    format: 'tar.gz (ustar)',
    archiveSha256: 'See X-ALOAPI-Package-SHA256 response header or CLI .sha256 sidecar; not self-embedded.',
    checksums: 'SHA256SUMS contains per-file digests for every payload file except itself.',
    secretPolicy: 'No credential values or plaintext secrets included; environment values are blank.',
    files: fileManifest,
  }, null, 2)}\n`;
  files['SHA256SUMS'] = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => `${sha256(content)}  ${path}`).join('\n') + '\n';

  const archive = zlib.gzipSync(createTar(files, Math.floor(new Date(generatedAt).getTime() / 1000)), { level: 9 });
  return { archive, sha256: sha256(archive), files };
}

function crc32Buffer(buf: Buffer): number {
  const fn = (zlib as unknown as { crc32?: (data: Buffer) => number }).crc32;
  if (typeof fn === 'function') return fn(buf) >>> 0;
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Pure Node.js ZIP builder (STORE + deflate) producing standard PKZIP archives with zero native dependencies.
 */
export function createZipArchive(files: Record<string, string>): Buffer {
  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, text] of entries) {
    const cleanName = name.replace(/^\/+/, '');
    if (cleanName.includes('..')) throw new Error('Invalid ZIP entry path.');
    const nameBuf = Buffer.from(cleanName, 'utf8');
    const raw = Buffer.from(text, 'utf8');
    const compressed = zlib.deflateRawSync(raw);
    const crc = crc32Buffer(raw);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    local.writeUInt16LE(8, 8); // Deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    localParts.push(local, compressed);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

/**
 * Generates the complete per-platform multi-file export bundle (Master Spec Section 16).
 * Strictly secret-free: never includes tokens, passwords, raw keys, or PII.
 */
export function buildProviderBundleFiles(
  provider: IntegrationProviderRecord,
  context?: {
    tenantId?: string;
    workflowState?: string;
    liveVerified?: boolean;
    lastVerifiedAt?: string | null;
    generatedAt?: string;
  },
): Record<string, string> {
  const generatedAt = context?.generatedAt ?? new Date().toISOString();
  const baseFolder = `${provider.key}`;

  const envLines = [
    `# ${provider.displayName} environment template (placeholders only — NO SECRETS)`,
    ...provider.environmentVariables.flatMap(v => [
      `# ${v.purpose} (${v.secret ? 'SECRET — keep in encrypted Vault' : 'Config'}, ${v.required ? 'REQUIRED' : 'OPTIONAL'})`,
      `${v.name}=""`,
    ]),
  ];

  const files: Record<string, string> = {
    [`${baseFolder}/provider.json`]: `${JSON.stringify({
      id: provider.id,
      displayName: provider.displayName,
      canonicalCategory: provider.canonicalCategory,
      apiVersion: provider.apiVersion,
      authenticationType: provider.authenticationType,
      oauthSupport: provider.oauthSupport,
      implementationLevel: provider.implementationLevel,
      runtimeVerificationStatus: provider.runtimeVerificationStatus,
      capabilityMatrix: provider.capabilityMatrix,
      supportedOperations: provider.supportedOperations,
      knownLimitations: provider.knownLimitations,
      regionalAvailability: provider.regionalAvailability,
      pricingPlanLimitations: provider.pricingPlanLimitations,
    }, null, 2)}\n`,
    [`${baseFolder}/account-setup.md`]: [
      `# ${provider.displayName} — Account & Portal Setup Guide`,
      '',
      `- **Official Website:** ${provider.officialWebsite}`,
      `- **Developer Portal:** ${provider.officialDeveloperPortal}`,
      `- **Workflow State:** ${context?.workflowState ?? 'NOT_STARTED'}`,
      '',
      '## Prerequisites',
      ...provider.accountPrerequisites.map(p => `- ${p}`),
      '',
      '## Developer & Business Verification Requirements',
      `- ${provider.developerAccountRequirements}`,
      `- ${provider.businessVerificationRequirements}`,
      '',
      '## Step-by-Step Setup Checklist',
      ...provider.setupChecklist.map((step, i) => `${i + 1}. ${step}`),
      '',
      '## Restrictions & Ownership Guardrails',
      ...provider.restrictions.map(r => `- ${r}`),
      '- Never create accounts using fabricated identities or bypass CAPTCHA/MFA checks.',
      '',
    ].join('\n'),
    [`${baseFolder}/api-documentation.md`]: [
      `# ${provider.displayName} — API Documentation Summary`,
      '',
      `- **API Version:** ${provider.apiVersion}`,
      `- **Base URLs:** ${provider.apiBaseUrls.join(', ') || 'None'}`,
      `- **Rate Limits & Pricing:** ${provider.rateLimitsAndPricing}`,
      '',
      '## Documented Endpoints',
      ...(provider.apiSpecs.length
        ? provider.apiSpecs.map(s => `- \`${s.method} ${s.path}\` — ${s.summary}`)
        : ['- No REST endpoints documented for this provider.']),
      '',
      '## Official References',
      ...provider.officialDocs.map(d => `- [${d.label}](${d.url})`),
      '',
    ].join('\n'),
    [`${baseFolder}/authentication.md`]: [
      `# ${provider.displayName} — Authentication & OAuth Specification`,
      '',
      `- **Authentication Type:** \`${provider.authenticationType}\``,
      `- **OAuth Supported:** ${provider.oauthSupport ? 'Yes' : 'No'}`,
      ...(provider.oauthConfig ? [
        `- **Authorization URL:** \`${provider.oauthConfig.authUrl}\``,
        `- **Token URL:** \`${provider.oauthConfig.tokenUrl}\``,
        `- **PKCE S256 Supported:** ${provider.oauthConfig.pkceSupported ? 'Yes' : 'No'}`,
      ] : []),
      '',
      '## Required Scopes',
      ...(provider.requiredScopes.length ? provider.requiredScopes.map(s => `- \`${s}\``) : ['- No OAuth scopes listed.']),
      '',
      '## Notes',
      ...provider.authentication.map(a => `- ${a}`),
      '',
    ].join('\n'),
    [`${baseFolder}/permissions.json`]: `${JSON.stringify({
      providerKey: provider.key,
      requiredScopes: provider.requiredScopes,
      leastPrivilegePolicy: 'Request only scopes strictly required by enabled capabilities.',
      capabilityMatrix: provider.capabilityMatrix,
    }, null, 2)}\n`,
    [`${baseFolder}/environment.example`]: `${envLines.join('\n')}\n`,
    [`${baseFolder}/webhook-configuration.json`]: `${JSON.stringify(provider.webhookSupport, null, 2)}\n`,
    [`${baseFolder}/integration-config.json`]: `${JSON.stringify({
      providerKey: provider.key,
      canonicalCategory: provider.canonicalCategory,
      apiVersion: provider.apiVersion,
      baseUrls: provider.apiBaseUrls,
      authenticationType: provider.authenticationType,
      manualCrmImportNotice: 'ALOAPI never connects to your external marketing CRM automatically. Import verified config manually.',
    }, null, 2)}\n`,
    [`${baseFolder}/api-schemas.json`]: `${JSON.stringify({
      providerKey: provider.key,
      apiVersion: provider.apiVersion,
      endpoints: provider.apiSpecs,
    }, null, 2)}\n`,
    [`${baseFolder}/example-requests.json`]: `${JSON.stringify({
      providerKey: provider.key,
      note: 'Authorization headers use placeholder tokens only.',
      examples: provider.apiSpecs.slice(0, 5).map(spec => ({
        method: spec.method,
        url: `${provider.apiBaseUrls[0] ?? 'https://api.example.com'}${spec.path}`,
        headers: {
          Authorization: 'Bearer <REPLACE_FROM_ENCRYPTED_VAULT>',
          Accept: 'application/json',
        },
        readOnlyProbe: Boolean(spec.readOnlyProbe),
      })),
    }, null, 2)}\n`,
    [`${baseFolder}/validation-report.json`]: `${JSON.stringify({
      providerKey: provider.key,
      generatedAt,
      tenantId: context?.tenantId ?? 'workspace',
      workflowState: context?.workflowState ?? 'NOT_STARTED',
      implementationLevel: provider.implementationLevel,
      runtimeVerificationStatus: provider.runtimeVerificationStatus,
      liveVerified: Boolean(context?.liveVerified),
      lastVerifiedAt: context?.lastVerifiedAt ?? null,
      secretsIncluded: false,
    }, null, 2)}\n`,
    [`${baseFolder}/source-references.json`]: `${JSON.stringify({
      officialWebsite: provider.officialWebsite,
      officialDeveloperPortal: provider.officialDeveloperPortal,
      officialApiDocumentation: provider.officialApiDocumentation,
      officialDocs: provider.officialDocs,
      documentationVerificationTimestamp: provider.documentationVerificationTimestamp,
    }, null, 2)}\n`,
    [`${baseFolder}/version-metadata.json`]: `${JSON.stringify({
      bundleSchemaVersion: '2.0.0',
      catalogVersion: '2026-11-16',
      providerKey: provider.key,
      apiVersion: provider.apiVersion,
      generatedAt,
      exportFormatPolicy: 'Secret-free manual import bundle',
    }, null, 2)}\n`,
  };

  files[`${baseFolder}/SHA256SUMS`] =
    Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([p, content]) => `${sha256(content)}  ${p}`)
      .join('\n') + '\n';

  return files;
}
