const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { gunzipSync } = require('node:zlib');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/lib/intelligence/export-package.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tempPath = path.join(os.tmpdir(), `aloapi-export-package-${process.pid}.cjs`);
fs.writeFileSync(tempPath, compiled, { mode: 0o600 });
const { createIntegrationPackage } = require(tempPath);

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sample = {
  key: 'sample_provider',
  name: 'Sample Provider',
  category: 'test',
  verificationStatus: 'DOCUMENTED',
  collectedAt: '2026-11-15',
  officialDocs: [{ label: 'Official API docs', url: 'https://example.invalid/docs' }],
  apiBaseUrls: ['https://api.example.invalid/v1'],
  authentication: ['OAuth 2.0'],
  oauthScopes: ['read_profile'],
  applicationRequirements: 'A registered developer application.',
  accountRequirements: 'An owner-authorized account.',
  endpoints: ['GET /me'],
  webhooks: 'Optional signed webhook.',
  rateLimitsAndPricing: 'Check the current official provider portal.',
  developerApproval: 'Approval may be required.',
  environmentVariables: [
    { name: 'SAMPLE_CLIENT_ID', secret: false, required: true, purpose: 'Application ID' },
    { name: 'SAMPLE_CLIENT_SECRET', secret: true, required: true, purpose: 'Blank template only' },
  ],
  automationCapabilities: ['Read authorized profile metadata.'],
  restrictions: ['Use the official OAuth flow.'],
  productionNotes: 'No provider account is connected.',
  recordedAccounts: 2,
  configuredAccounts: 1,
  authorizedAccounts: 99,
  verifiedAccounts: 99,
  // These values must not survive a runtime object with unexpected properties.
  secretValue: 'PLAINTEXT_SECRET_SENTINEL',
  phoneNumber: '+8801712345678',
  accountIdentifier: 'must-not-export-account-id',
  ciphertext: 'must-not-export-ciphertext',
};

function readTar(archive) {
  const tar = gunzipSync(archive);
  const result = new Map();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const filename = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const size = Number.parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/s, '').trim() || '0', 8);
    const expectedChecksum = Number.parseInt(header.subarray(148, 154).toString('ascii'), 8);
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    const actualChecksum = checksumHeader.reduce((sum, byte) => sum + byte, 0);
    assert.equal(actualChecksum, expectedChecksum, `valid tar header checksum for ${filename}`);
    const start = offset + 512;
    result.set(filename, tar.subarray(start, start + size).toString('utf8'));
    offset = start + Math.ceil(size / 512) * 512;
  }
  return result;
}

test('integration package has readable Markdown, templates, metadata and valid checksums without secret data', () => {
  const generatedAt = '2026-11-15T00:00:00.000Z';
  const result = createIntegrationPackage([sample], generatedAt);
  const files = readTar(result.archive);

  assert.equal(result.sha256, digest(result.archive));
  assert.deepEqual([...files.keys()].sort(), Object.keys(result.files).sort());
  assert.ok(files.has('catalog.json'));
  assert.ok(files.has('catalog.md'));
  assert.ok(files.has('providers.csv'));
  assert.ok(files.has('verification.json'));
  assert.ok(files.has('manifest.json'));
  assert.ok(files.has('SHA256SUMS'));
  assert.ok(files.has('.env.example'));
  assert.ok(files.has('templates/sample_provider.yaml'));
  assert.ok(files.has('templates/provider-template.yaml'));

  const markdown = files.get('catalog.md');
  assert.match(markdown, /^# ALOAPI Integration Intelligence Export\n/);
  assert.match(markdown, /\n## Provider index\n/);
  assert.match(markdown, /\n### Sample Provider\n/);
  assert.doesNotMatch(markdown, /\\\\n/);

  const catalog = JSON.parse(files.get('catalog.json'));
  const provider = catalog.providers[0];
  assert.equal(provider.recordedAccounts, 2);
  assert.equal(provider.configuredAccounts, 1);
  assert.equal(provider.authorizedAccounts, 0);
  assert.equal(provider.verifiedAccounts, 0);
  assert.equal(Object.hasOwn(provider, 'secretValue'), false);
  assert.equal(Object.hasOwn(provider, 'phoneNumber'), false);
  assert.equal(Object.hasOwn(provider, 'accountIdentifier'), false);
  assert.equal(Object.hasOwn(provider, 'ciphertext'), false);

  const yaml = files.get('templates/sample_provider.yaml');
  assert.match(yaml, /value: ""/);
  assert.match(yaml, /authorization_status: "NOT_AUTHORIZED_BY_THIS_EXPORT"/);
  const env = files.get('.env.example');
  assert.match(env, /SAMPLE_CLIENT_SECRET=""/);
  assert.doesNotMatch(env, /PLAINTEXT_SECRET_SENTINEL/);

  const verification = JSON.parse(files.get('verification.json'));
  assert.equal(verification.liveProviderChecksPerformed, false);
  assert.equal(verification.oauthAuthorizationsPerformed, false);
  assert.equal(verification.accountVerificationPerformed, false);

  const checksumRows = files.get('SHA256SUMS').trimEnd().split('\n');
  const checksummed = new Set();
  for (const row of checksumRows) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(row);
    assert.ok(match, `well-formed checksum row: ${row}`);
    const [, expected, filename] = match;
    assert.ok(files.has(filename), `checksum refers to included file ${filename}`);
    assert.equal(digest(files.get(filename)), expected, `file checksum matches for ${filename}`);
    checksummed.add(filename);
  }
  assert.equal(checksummed.size, files.size - 1);
  assert.equal(checksummed.has('SHA256SUMS'), false);

  const allContent = [...files].map(([name, content]) => `${name}\n${content}`).join('\n');
  for (const forbidden of [
    'PLAINTEXT_SECRET_SENTINEL',
    '+8801712345678',
    'must-not-export-account-id',
    'must-not-export-ciphertext',
  ]) assert.equal(allContent.includes(forbidden), false, `archive excludes ${forbidden}`);
});

test.after(() => { fs.rmSync(tempPath, { force: true }); });
