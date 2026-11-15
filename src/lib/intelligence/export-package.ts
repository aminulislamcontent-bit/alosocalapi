import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

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

  const archive = gzipSync(createTar(files, Math.floor(new Date(generatedAt).getTime() / 1000)), { level: 9 });
  return { archive, sha256: sha256(archive), files };
}
