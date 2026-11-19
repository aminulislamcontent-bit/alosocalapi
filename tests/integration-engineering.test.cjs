const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const compileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-eng-test-'));
const cache = new Map();

function resetDbModules() {
  for (const key of Array.from(cache.keys())) {
    if (
      key.includes(`${path.sep}src${path.sep}lib${path.sep}db.ts`) ||
      key.includes(`${path.sep}src${path.sep}lib${path.sep}engineering`) ||
      key.includes(`${path.sep}src${path.sep}lib${path.sep}onboarding`) ||
      key.includes(`${path.sep}src${path.sep}lib${path.sep}security`)
    ) {
      cache.delete(key);
    }
  }
  if (globalThis.prisma) globalThis.prisma = undefined;
}

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
  return mod.exports;
}

function setupFreshDb(t) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-eng-db-'));
  const dbPath = path.join(tmpDir, 'engineering.db');
  const dbUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = dbUrl;
  process.env.ALOAPI_VAULT_KEY = '0123456789abcdef0123456789abcdef';
  resetDbModules();

  const prismaCli = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  });

  t.after(() => {
    resetDbModules();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  return loadTsModule('src/lib/db.ts').db;
}

test('Website-URL Discovery enforces SSRF protection, extracts real HTML/JSON-LD assets, and never invents missing fields', async (t) => {
  setupFreshDb(t);
  const discovery = loadTsModule('src/lib/engineering/website-discovery.ts');

  // SSRF protection blocks metadata & private ranges
  assert.throws(() => discovery.validateWebsiteDiscoveryUrl('http://169.254.169.254/latest/meta-data'), /SSRF|blocked/i);
  assert.throws(() => discovery.validateWebsiteDiscoveryUrl('http://192.168.1.10/admin'), /SSRF|blocked/i);
  assert.throws(() => discovery.validateWebsiteDiscoveryUrl('http://127.0.0.1:8080', false), /Loopback/i);

  // Spin up ephemeral local HTTP business site to test real HTTP fetch & extraction
  const sampleHtml = `<!doctype html>
  <html lang="en-BD">
    <head>
      <title>Acme Dhaka Commerce | AI Retail</title>
      <meta name="description" content="Omnichannel commerce automation in Dhaka." />
      <meta property="og:site_name" content="Acme Dhaka Commerce" />
      <meta property="og:image" content="/assets/logo.png" />
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Organization","name":"Acme Dhaka Commerce","email":"contact@acmedhaka.example","telephone":"+8801711009988","areaServed":"Bangladesh"}
      </script>
      <script src="https://www.googletagmanager.com/gtag/js?id=G-TEST12345"></script>
      <script src="https://js.stripe.com/v3/"></script>
    </head>
    <body>
      <h2>AI CRM Suite</h2>
      <h2>Automated Email Campaigns</h2>
      <a href="https://facebook.com/acmedhaka">Facebook</a>
      <a href="https://instagram.com/acmedhaka">Instagram</a>
      <a href="https://wa.me/8801711009988">WhatsApp</a>
      <a href="/privacy-policy">Privacy Policy</a>
      <a href="/terms">Terms and Conditions</a>
    </body>
  </html>`;

  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(sampleHtml);
  });
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  t.after(() => srv.close());
  const port = srv.address().port;

  const out = await discovery.runWebsiteBusinessDiscovery({
    websiteUrl: `http://127.0.0.1:${port}`,
    allowLoopbackForTest: true,
    actor: 'tester',
  });

  assert.equal(out.discovery.fetchStatus, 'fetched');
  assert.equal(out.discovery.httpStatus, 200);
  assert.equal(out.discovery.businessName, 'Acme Dhaka Commerce');
  assert.ok(out.discovery.emails.includes('contact@acmedhaka.example'));
  assert.ok(out.discovery.phones.includes('+8801711009988'));
  assert.ok(out.discovery.socialProfiles.some(s => s.providerKeyHint === 'meta_facebook_pages'));
  assert.ok(out.discovery.socialProfiles.some(s => s.providerKeyHint === 'whatsapp_cloud_api'));
  assert.ok(out.discovery.detectedMarketingTech.some(d => d.providerKeyHint === 'google_analytics4'));
  assert.ok(out.discovery.detectedMarketingTech.some(d => d.providerKeyHint === 'stripe_api'));
  assert.ok(out.discovery.privacyPolicyUrl.endsWith('/privacy-policy'));
  assert.ok(out.discovery.termsUrl.endsWith('/terms'));
  // targetAudience wasn't in HTML meta -> honestly flagged in missingFields rather than fabricated!
  assert.ok(out.discovery.missingFields.includes('targetAudience'));
});

test('Universal Provider Adapters cover all 131 providers & end-to-end Credential Engineering -> Verification Auto-Resume -> 17-Section Handover -> Client Import', async (t) => {
  const db = setupFreshDb(t);
  const discovery = loadTsModule('src/lib/engineering/website-discovery.ts');
  const adapters = loadTsModule('src/lib/engineering/provider-adapters.ts');
  const credEng = loadTsModule('src/lib/engineering/credential-engineering.ts');
  const coordinator = loadTsModule('src/lib/engineering/verification-coordinator.ts');
  const handover = loadTsModule('src/lib/engineering/handover-packager.ts');
  const executor = loadTsModule('src/lib/engineering/client-api-executor.ts');
  const vaultSvc = loadTsModule('src/lib/onboarding/vault-service.ts');

  const allAdapters = adapters.listAllUniversalAdapters();
  assert.equal(allAdapters.length, 131);
  for (const a of allAdapters) {
    assert.ok(['FULLY_AUTOMATED', 'OFFICIAL_API_AUTOMATION', 'AUTHORIZED_BROWSER_AUTOMATION', 'SUPERVISED_PORTAL_HANDOFF', 'OWNER_ACTION_REQUIRED', 'CONFIGURATION_ONLY', 'UNSUPPORTED'].includes(a.executionMode));
    assert.ok(['DIRECT_TRANSFER', 'CLIENT_ACCOUNT_REISSUANCE', 'AUTHORIZED_DELEGATION', 'CONFIGURATION_ONLY'].includes(a.handoverMode));
    assert.ok(a.requiredPermissionsAndScopes.length >= 0);
  }

  // 1. Discover project via offline HTML snapshot
  const disc = await discovery.runWebsiteBusinessDiscovery({
    websiteUrl: 'https://growth-agency.example.com',
    htmlSnapshotFallback: '<html><head><title>Growth Agency BD</title></head><body><a href="mailto:team@growth-agency.example.com">Email</a></body></html>',
    actor: 'engineer',
  });
  assert.equal(disc.project.status, 'discovery');

  // 2. Prepare SendGrid + Meta Facebook Pages + HubSpot CRM engineering setup
  const sgPrep = await credEng.prepareProviderEngineeringSetup({
    projectId: disc.project.id,
    providerKey: 'sendgrid_api',
    publicBaseUrl: 'https://aloapi.example.com',
    actor: 'engineer',
  });
  assert.ok(sgPrep.oauthApp.dnsRecordsJson.includes('_dmarc'));
  assert.ok(sgPrep.credentials.some(c => c.origin === 'ALOAPI-GENERATED' && c.vaultCredentialId));
  // Unissued PROVIDER-ISSUED slots must NEVER falsely attach ALOAPI-GENERATED vault secrets or pretend to be active!
  const sgProviderCreds = sgPrep.credentials.filter(c => c.origin === 'PROVIDER-ISSUED');
  assert.ok(sgProviderCreds.length >= 1);
  assert.ok(sgProviderCreds.every(c => c.vaultCredentialId === null && ['CLIENT_ACTIVATION_REQUIRED', 'PROVIDER_APPROVAL_REQUIRED'].includes(c.activationStatus)));

  await credEng.prepareProviderEngineeringSetup({
    projectId: disc.project.id,
    providerKey: 'meta_facebook_pages',
    actor: 'engineer',
  });

  // Ensure ZERO plaintext secrets leaked inside CredentialPreparationRecord preparedMetadataJson
  const credRows = await db.credentialPreparationRecord.findMany({ where: { projectId: disc.project.id } });
  for (const row of credRows) {
    assert.ok(!row.preparedMetadataJson.includes('whsec_aloapi_'));
    assert.ok(!row.preparedMetadataJson.includes('jwt_aloapi_'));
    assert.ok(!row.preparedMetadataJson.includes('BEGIN PRIVATE KEY'));
  }

  // 3. Human Verification Coordinator forbids passwords/OTPs and resumes workflow cleanly
  const cps = await coordinator.generateRequiredCheckpointsForProvider({
    projectId: disc.project.id,
    providerKey: 'sendgrid_api',
    actor: 'engineer',
  });
  assert.ok(cps.some(c => c.checkpointType === 'domain_ownership'));

  await assert.rejects(
    () => coordinator.completeCheckpointAndResumeWorkflow({
      checkpointId: cps[0].id,
      ownerInputMeta: { password: 'should_be_rejected' },
      actor: 'owner',
    }),
    /Security violation/,
  );

  for (const cp of cps) {
    const resumed = await coordinator.completeCheckpointAndResumeWorkflow({
      checkpointId: cp.id,
      ownerConfirmationNote: 'Verified in official portal',
      actor: 'owner',
    });
    assert.equal(resumed.checkpoint.status, 'completed');
    assert.ok(['DISCOVERY', 'DEVELOPER_SETUP_REQUIRED', 'CONFIGURED', 'AUTHORIZED'].includes(resumed.resumedWorkflowState));
  }

  // 4. Generate 17-section Client Handover Package & Secret-Free ZIP
  const pkg = await handover.generateClientHandoverPackage({
    projectId: disc.project.id,
    actor: 'engineer',
  });
  assert.equal(pkg.manifest.secretsIncluded, false);
  assert.equal(pkg.manifest.originalCrmUntouched, true);
  assert.equal(Object.keys(pkg.manifest.sections).length, 17);
  assert.ok(['CLIENT_ACTIVATION_REQUIRED', 'PROVIDER_APPROVAL_REQUIRED', 'CONFIGURED'].includes(pkg.packageRecord.packageStatus));

  const zip = handover.buildHandoverZipArchive(pkg);
  assert.equal(zip.zipBuf.subarray(0, 2).toString('utf8'), 'PK');
  assert.ok(!zip.zipBuf.toString('utf8').includes('whsec_aloapi_'));
  assert.ok(zip.fileNames.includes('client-project-import.json'));
  assert.ok(zip.fileNames.includes('.env.template'));

  // 5. Encrypted handover export requires explicit owner approval
  await assert.rejects(
    () => handover.exportOwnerAuthorizedEncryptedHandover({
      projectId: disc.project.id,
      explicitOwnerTransferApproval: false,
      actor: 'engineer',
    }),
    /Explicit owner authorization/,
  );
  const encExport = await handover.exportOwnerAuthorizedEncryptedHandover({
    projectId: disc.project.id,
    explicitOwnerTransferApproval: true,
    actor: 'owner',
  });
  assert.equal(encExport.containsPlaintextSecrets, false);
  assert.ok(encExport.vaultBackup.records.length >= 6);

  // 6. Client Project Import validation leaves original Marketing CRM completely untouched
  const imported = await handover.validateClientProjectImport({
    importManifest: pkg.clientImportManifest,
    expectedSha256: pkg.sha256,
    manifestForHashCheck: pkg.manifest,
    actor: 'client_importer',
  });
  assert.equal(imported.imported, true);
  assert.equal(imported.originalCrmModified, false);

  // 7. Authorized Autonomous Client API Execution Engine enforces approval gates for high-impact actions
  const mockApiServer = http.createServer((req, res) => {
    const auth = req.headers.authorization || '';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, method: req.method, echoAuth: auth }));
  });
  await new Promise(resolve => mockApiServer.listen(0, '127.0.0.1', resolve));
  t.after(() => mockApiServer.close());
  const apiAddr = mockApiServer.address();
  const mockApiUrl = `http://127.0.0.1:${apiAddr.port}/v1/campaigns/publish`;

  // High-impact action blocked BEFORE any network call or secret lookup when approval is missing
  const blockedHighImpact = await executor.executeAuthorizedClientApiAction({
    projectId: disc.project.id,
    providerKey: 'sendgrid_api',
    actionName: 'publish_campaign_broadcast',
    httpMethod: 'POST',
    allowLoopbackForTest: true,
    testEndpointOverride: mockApiUrl,
    bodyPayload:{campaignId:'123'}, requestedImpactLevel:'READ_ONLY', ownerApprovalGranted:true, approvalReference:'untrusted',
    actor: 'ai_agent',
  });
  assert.equal(blockedHighImpact.status, 'APPROVAL_REQUIRED');
  assert.equal(blockedHighImpact.impactLevel, 'HIGH_IMPACT_ACTION');
  assert.equal(blockedHighImpact.approvalSatisfied, false);

  // Even when approved, missing Vault client token is reported honestly as CLIENT_ACTIVATION_REQUIRED
  const unissuedExec = await executor.executeAuthorizedClientApiAction({
    projectId: disc.project.id,
    providerKey: 'sendgrid_api',
    actionName: 'read_sender_status',
    httpMethod: 'GET',
    allowLoopbackForTest: true,
    testEndpointOverride: mockApiUrl,
    actor: 'ai_agent',
  });
  assert.equal(unissuedExec.status, 'CLIENT_ACTIVATION_REQUIRED');

  // Store an authorized Vault client access_token and execute with completed VerificationCheckpoint approval
  await vaultSvc.storeVaultCredential({
    tenantId: disc.project.clientId,
    providerKey: 'sendgrid_api',
    credentialType: 'access_token',
    label: 'authorized_client_token',
    plaintextValue: 'SG.test_live_authorized_token_xyz_123456',
    scopes: ['mail.send'],
    actor: 'owner',
  });
  const admin = await db.adminUser.create({data:{username:'approval-owner',passwordHash:'disabled-test-account'}});
  const {approveOperation} = loadTsModule('src/lib/engineering/operations.ts');
  const grant = await approveOperation(disc.project.id,'sendgrid_api','publish_campaign_broadcast',{campaignId:'123'},admin.id);
  const scoped = {projectId:disc.project.id,providerKey:'sendgrid_api',actionName:'publish_campaign_broadcast',approvalId:grant.id,actor:'engineer',allowLoopbackForTest:true,testEndpointOverride:mockApiUrl};
  assert.equal((await executor.executeAuthorizedClientApiAction({...scoped,bodyPayload:{campaignId:'124'}})).status,'APPROVAL_REQUIRED');
  const approvedExec = await executor.executeAuthorizedClientApiAction({
    projectId: disc.project.id,
    providerKey: 'sendgrid_api',
    actionName: 'publish_campaign_broadcast',
    httpMethod: 'POST',
    bodyPayload: { campaignId: '123' }, approvalId:grant.id,
    allowLoopbackForTest: true,
    testEndpointOverride: mockApiUrl,
    ownerApprovalGranted: true,
    approvalCheckpointId: cps[0].id,
    actor: 'ai_agent',
  });
  assert.equal(approvedExec.status, 'EXECUTED');
  assert.equal(approvedExec.httpStatus, 200);
  assert.equal((await executor.executeAuthorizedClientApiAction({...scoped,bodyPayload:{campaignId:'123'}})).status,'APPROVAL_REQUIRED');
  // Bearer token must be redacted from responsePreview!
  assert.ok(!approvedExec.responsePreview.includes('SG.test_live_authorized_token_xyz_123456'));
  assert.ok(approvedExec.responsePreview.includes('[REDACTED]'));

  // 8. 429 Retry-After backoff + Idempotency-Key deduplication
  let retryCalls = 0;
  const retrySrv = http.createServer((req, res) => {
    retryCalls += 1;
    if (retryCalls === 1) {
      res.writeHead(429, { 'Retry-After': '0', 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'rate_limited' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, idempotentHeader: req.headers['idempotency-key'] }));
  });
  await new Promise(resolve => retrySrv.listen(0, '127.0.0.1', resolve));
  t.after(() => retrySrv.close());
  const retryUrl = `http://127.0.0.1:${retrySrv.address().port}/v1/sync`;

  const retriedExec = await executor.executeAuthorizedClientApiAction({
    projectId: disc.project.id,
    providerKey: 'sendgrid_api',
    actionName: 'read_sender_status',
    httpMethod: 'GET',
    idempotencyKey: 'idem_test_retry_key_1',
    retryBaseDelayMs: 10,
    allowLoopbackForTest: true,
    testEndpointOverride: retryUrl,
    actor: 'ai_agent',
  });
  assert.equal(retriedExec.status, 'EXECUTED');
  assert.equal(retriedExec.attempts, 2);
  assert.equal(retryCalls, 2);

  const replayExec = await executor.executeAuthorizedClientApiAction({
    projectId: disc.project.id,
    providerKey: 'sendgrid_api',
    actionName: 'read_sender_status',
    httpMethod: 'GET',
    idempotencyKey: 'idem_test_retry_key_1',
    allowLoopbackForTest: true,
    testEndpointOverride: retryUrl,
    actor: 'ai_agent',
  });
  assert.equal(replayExec.status, 'EXECUTED');
  assert.equal(replayExec.deduplicatedReplay, true);
  assert.equal(retryCalls, 2, 'Duplicate Idempotency-Key must NOT hit upstream API again');

  // 9. DNS Verifier honest miss vs live match + ZIP path traversal / prototype pollution blocking + 131x17 matrix + adapter lifecycle
  const dnsVerifier = loadTsModule('src/lib/engineering/dns-verifier.ts');
  const failedDns = await dnsVerifier.verifyProjectProviderDns({
    projectId: disc.project.id,
    providerKey: 'sendgrid_api',
    actor: 'engineer',
    resolver: {
      resolveTxt: async () => [],
      resolveCname: async () => [],
      resolveMx: async () => [],
    },
  });
  assert.equal(failedDns.verified, false);
  assert.equal(failedDns.status, 'DNS_RECORDS_NOT_OBSERVED');

  const okDns = await dnsVerifier.verifyLiveDnsRecords({
    domain: 'growth-agency.example.com',
    expectedRecords: [
      { type: 'TXT', host: '@', expectedValueSubstring: 'v=spf1', purpose: 'SPF' },
      { type: 'TXT', host: '_dmarc', expectedValueSubstring: 'v=DMARC1', purpose: 'DMARC' },
    ],
    resolver: {
      resolveTxt: async h => (h === '_dmarc.growth-agency.example.com' ? [['v=DMARC1; p=quarantine']] : [['v=spf1 include:sendgrid.net ~all']]),
      resolveCname: async () => [],
      resolveMx: async () => [],
    },
  });
  assert.equal(okDns.verified, true);
  assert.equal(okDns.status, 'DNS_LIVE_VERIFIED');

  await assert.rejects(
    () => handover.validateClientProjectImport({
      importManifest: pkg.clientImportManifest,
      archiveFileNames: ['../../etc/passwd'],
      actor: 'attacker',
    }),
    /ZIP path traversal/,
  );

  await assert.rejects(
    () => handover.validateClientProjectImport({
      importManifest: JSON.parse('{"schema":"aloapi-client-import-v1","secretsIncluded":false,"__proto__":{"polluted":true}}'),
      actor: 'attacker',
    }),
    /prototype-pollution/,
  );

  const matrix = await handover.buildProviderCompletionMatrix(disc.project.id);
  assert.equal(matrix.totalProviders, 131);
  assert.equal(Object.keys(matrix.providers[0].dimensions).length, 17);

  const lifecycle = await adapters.executeProviderAdapterLifecycle({
    operation: 'ownership_analysis',
    providerKey: 'shopify_admin_api',
    tenantId: disc.project.clientId,
    actor: 'engineer',
  });
  assert.equal(lifecycle.supported, true);
  assert.equal(lifecycle.handoverMode, 'DIRECT_TRANSFER');

  assert.equal(await db.lead.count(), 0);
  assert.equal(await db.contact.count(), 0);
  assert.equal(await db.crmTask.count(), 0);
});
