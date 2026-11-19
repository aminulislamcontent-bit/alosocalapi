const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const compileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-handover-test-'));
const cache = new Map();

function resetDbModules() {
  for (const key of Array.from(cache.keys())) {
    if (
      key.includes(`${path.sep}src${path.sep}lib${path.sep}db.ts`) ||
      key.includes(`${path.sep}src${path.sep}lib${path.sep}onboarding`) ||
      key.includes(`${path.sep}src${path.sep}lib${path.sep}security`)
    ) {
      cache.delete(key);
    }
  }
  if (globalThis.prisma) globalThis.prisma = undefined;
}

// Lightweight TypeScript CJS compiler loader (same pattern as the other integration tests).
function loadTsModule(relOrAbsPath) {
  const abs = path.isAbsolute(relOrAbsPath) ? relOrAbsPath : path.join(ROOT, relOrAbsPath);
  if (cache.has(abs)) return cache.get(abs);

  const source = fs.readFileSync(abs, 'utf8');
  const rewritten = source.replace(/from\s+['"](@\/|\.\.?\/)([^'"]+)['"]/g, (m, prefix, rest) => {
    if (prefix === '@/') return `from '${path.join(ROOT, 'src', rest).replace(/\\/g, '/')}'`;
    return m;
  });

  const compiled = ts.transpileModule(rewritten, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;

  const outFile = path.join(compileDir, `${Buffer.from(abs).toString('hex')}.cjs`);
  const mod = { exports: {} };
  cache.set(abs, mod.exports);

  const Module = require('node:module');
  const localRequire = (spec) => {
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const baseDir = path.dirname(abs);
      const target = spec.startsWith('/') ? spec : path.resolve(baseDir, spec);
      for (const candidate of [target, `${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts')]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile() && /\.(ts|tsx)$/.test(candidate)) {
          return loadTsModule(candidate);
        }
      }
      return require(target);
    }
    return Module.createRequire(abs)(spec);
  };

  fs.writeFileSync(outFile, compiled);
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled);
  fn(mod.exports, localRequire, mod, outFile, path.dirname(outFile));
  cache.set(abs, mod.exports);
  return mod.exports;
}

function setupFreshDb(t) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-handover-db-'));
  const dbUrl = `file:${path.join(tmpDir, 'handover.db')}`;
  process.env.DATABASE_URL = dbUrl;
  process.env.ALOAPI_VAULT_KEY = '0123456789abcdef0123456789abcdef';
  resetDbModules();

  execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  });

  t.after(() => {
    resetDbModules();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(compileDir, { recursive: true, force: true });
  });

  return loadTsModule('src/lib/db.ts').db;
}

test('integration handover identity normalization emits true E.164 and accepts HTTPS URLs only', () => {
  const { normalizeIdentity, OWNER_CHECKPOINTS } = loadTsModule('src/lib/onboarding/handover-package.ts');

  // Real-world formatting variants all normalize to the same E.164 value.
  for (const raw of ['+880 1712-345 678', '+880 (171) 234.5678', '00880 1712 345678', '8801712345678', '+880–1712–345678']) {
    assert.deepEqual(normalizeIdentity({ kind: 'phone', value: raw }), { kind: 'phone', value: '+8801712345678' }, raw);
  }

  // National numbers without a country code, letters, bad prefixes and empty values are refused.
  for (const raw of ['01712345678', '+8801712345678 ext 12', '++8801712345678', '+0123456789', 'not-a-phone', '   ']) {
    assert.throws(() => normalizeIdentity({ kind: 'phone', value: raw }), /E\.164|country code|valid account URL/i, raw);
  }

  const url = normalizeIdentity({ kind: 'url', value: 'https://Example.COM/account?tab=1' });
  assert.equal(url.hostname, 'example.com');
  assert.match(url.value, /^https:\/\/example\.com\//);

  for (const raw of [
    'http://example.com/account',
    'javascript:alert(1)',
    'https://user:password@example.com/account',
    'not-a-url',
  ]) {
    assert.throws(() => normalizeIdentity({ kind: 'url', value: raw }), /HTTPS|valid HTTPS|embedded credentials/i, raw);
  }

  assert.deepEqual(normalizeIdentity({ kind: 'account', value: '  acct-42  ' }), { kind: 'account', value: 'acct-42' });
  assert.throws(() => normalizeIdentity({ kind: 'account', value: 'x'.repeat(2049) }), /valid account URL/);

  assert.equal(OWNER_CHECKPOINTS.length, 4);
  assert.ok(OWNER_CHECKPOINTS.some(c => /passwords|OTPs|MFA/.test(c)));
  assert.ok(OWNER_CHECKPOINTS.some(c => /CAPTCHA|business verification/i.test(c)));
});

test('integration handover manifest is tenant-scoped, secret-free, honest about verification and keeps owner gates visible', async (t) => {
  const db = setupFreshDb(t);
  const { buildIntegrationHandoverPackage } = loadTsModule('src/lib/onboarding/handover-package.ts');
  const { storeVaultCredential } = loadTsModule('src/lib/onboarding/vault-service.ts');

  const tenantId = 'tenant-handover-1';
  const providerKey = 'sendgrid_api';
  const identity = { kind: 'url', value: 'https://example.com/sendgrid-account' };
  const plaintextSentinel = 'HANDOVER_PLAINTEXT_SENTINEL_424242';

  const first = await buildIntegrationHandoverPackage({ tenantId, providerKey, identity });
  assert.equal(first.schemaVersion, 'aloapi.integration-handover.v1');
  assert.equal(first.tenantId, tenantId);
  assert.equal(first.provider.key, providerKey);
  assert.equal(first.suppliedIdentity.value, 'https://example.com/sendgrid-account');
  assert.equal(first.handover.secretsIncluded, false);
  assert.equal(first.handover.vaultCredentialCount, 0);
  assert.equal(first.verification.verified, false);
  assert.equal(first.preparation.workflowState, 'NOT_STARTED');
  assert.equal(first.preparation.status, 'DISCOVERY_AND_SETUP_REQUIRED');
  assert.ok(first.preparation.requiredCredentials.length > 0, 'required credential types must be listed');
  assert.ok(first.preparation.requiredCredentials.every(c => c.status === 'OWNER_OR_AGENT_ACTION_REQUIRED'));
  assert.ok(first.preparation.setupChecklist.length > 0);
  assert.ok(first.preparation.endpoints.length > 0);
  assert.ok(Array.isArray(first.preparation.requiredScopes));
  assert.ok(first.preparation.ownerApprovalsAndRestrictions.length > 0);
  assert.ok(first.preparation.requiredOwnerActions.length > 0);
  assert.equal(new Set(first.preparation.requiredOwnerActions).size, first.preparation.requiredOwnerActions.length, 'owner actions must be deduplicated');
  assert.equal(first.preparation.ownerCheckpoints.length, 4);
  assert.deepEqual(first.handover.ownerCheckpoints, first.preparation.ownerCheckpoints);
  assert.deepEqual(first.handover.requiredOwnerActions, first.preparation.requiredOwnerActions);
  assert.ok(first.handover.nextSteps.length >= 5);

  // A real encrypted vault record changes only the matching credential status;
  // it must never put the plaintext value anywhere in the manifest.
  const requiredType = first.preparation.requiredCredentials[0].credentialType;
  await storeVaultCredential({
    tenantId,
    providerKey,
    credentialType: requiredType,
    label: 'primary',
    plaintextValue: plaintextSentinel,
    actor: 'handover-test',
  });
  const second = await buildIntegrationHandoverPackage({ tenantId, providerKey, identity });
  assert.equal(second.handover.vaultCredentialCount, 1);
  assert.equal(second.preparation.requiredCredentials[0].status, 'COLLECTED_ENCRYPTED');
  assert.equal(second.preparation.requiredCredentials[0].records[0].label, 'primary');
  assert.equal(second.verification.verified, false, 'saved credentials are not a verified integration');
  assert.ok(!JSON.stringify(second).includes(plaintextSentinel), 'plaintext secret leaked into handover manifest');
  assert.equal(JSON.stringify(second).includes('[ENCRYPTED_AT_REST]'), false, 'even masked previews are not required in a secret-free manifest');

  // Another tenant must not see the first tenant's credential metadata.
  const other = await buildIntegrationHandoverPackage({ tenantId: 'tenant-handover-2', providerKey, identity });
  assert.equal(other.handover.vaultCredentialCount, 0);
  assert.ok(other.preparation.requiredCredentials.every(c => c.status === 'OWNER_OR_AGENT_ACTION_REQUIRED'));

  // VERIFIED is claimed only when the onboarding workflow is actually VERIFIED.
  await db.onboardingWorkflow.create({
    data: { clientId: tenantId, providerKey, state: 'VERIFIED' },
  });
  assert.equal((await buildIntegrationHandoverPackage({tenantId,providerKey,identity})).verification.verified,false,'workflow label alone is not verification evidence');
  await db.vaultCredential.updateMany({where:{clientId:tenantId,providerKey},data:{lastVerifiedAt:new Date()}});
  const third = await buildIntegrationHandoverPackage({ tenantId, providerKey, identity });
  assert.equal(third.verification.verified, true);
  assert.equal(third.preparation.workflowState, 'VERIFIED');
  assert.equal(third.preparation.status, 'API_VERIFIED');
  assert.match(third.verification.claim, /marked VERIFIED/);
  assert.ok(!JSON.stringify(third).includes(plaintextSentinel));

  // An unknown provider is refused rather than generating a fabricated manifest.
  await assert.rejects(
    () => buildIntegrationHandoverPackage({ tenantId, providerKey: 'not_a_real_provider', identity }),
    /Unknown provider/,
  );
});
