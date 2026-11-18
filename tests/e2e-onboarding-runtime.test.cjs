const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const STANDALONE_SERVER = path.join(ROOT, '.next', 'standalone', 'server.js');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => resolve(addr.port));
    });
  });
}

async function waitForHealth(baseUrl, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') return data;
      }
    } catch {
      // Server still booting
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/health`);
}

test('full end-to-end runtime: migration -> post-login init -> 13 onboarding APIs -> ZIP export', async (t) => {
  if (!fs.existsSync(STANDALONE_SERVER)) {
    assert.fail(`Standalone build missing at ${STANDALONE_SERVER}. Run npm run build first.`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-e2e-runtime-'));
  const dbPath = path.join(tmpDir, 'runtime.db');
  const dbUrl = `file:${dbPath}`;
  const vaultKey = '0123456789abcdef0123456789abcdef';
  const rotatedKey = 'fedcba9876543210fedcba9876543210';

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 1. Deploy all 3 Prisma migrations onto isolated fresh SQLite DB
  const prismaCli = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  });

  // 2. Boot real production standalone Next.js server
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverLogs = [];

  const child = spawn(process.execPath, [STANDALONE_SERVER], {
    cwd: path.join(ROOT, '.next', 'standalone'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: dbUrl,
      ALOAPI_VAULT_KEY: vaultKey,
      ADMIN_BOOTSTRAP_USERNAME: 'e2eadmin',
      ADMIN_BOOTSTRAP_PASSWORD: 'E2eSuperStrongPassword2026!',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', c => serverLogs.push(c.toString()));
  child.stderr.on('data', c => serverLogs.push(c.toString()));

  t.after(() => {
    if (!child.killed) child.kill('SIGTERM');
  });

  try {
    const health = await waitForHealth(baseUrl);
    assert.equal(health.database, 'reachable');

    // 3. Unauthenticated & cross-origin access denied across onboarding endpoints
    for (const ep of [
      '/api/onboarding/overview',
      '/api/onboarding/catalog',
      '/api/onboarding/vault',
      '/api/onboarding/workflows',
      '/api/onboarding/system',
      '/api/onboarding/export?format=json',
    ]) {
      const unauth = await fetch(`${baseUrl}${ep}`);
      assert.equal(unauth.status, 401, `Expected 401 on unauthenticated ${ep}`);
    }
    const crossOriginPost = await fetch(`${baseUrl}/api/onboarding/workflows`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example.com' },
      body: JSON.stringify({ action: 'init', tenantId: 'x', providerKey: 'whatsapp_cloud_api' }),
    });
    assert.equal(crossOriginPost.status, 403);

    // 4. Admin login triggers 13-step Post-Login Auto Initialization
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({
        username: 'e2eadmin',
        password: 'E2eSuperStrongPassword2026!',
        role: 'admin',
      }),
    });
    assert.equal(loginRes.status, 200, `Login failed: ${await loginRes.clone().text()}`);
    const setCookie = loginRes.headers.get('set-cookie') || '';
    const sessionMatch = /aia_session=([^;]+)/.exec(setCookie);
    assert.ok(sessionMatch, 'Expected session cookie from admin login');
    const cookieHeader = `aia_session=${sessionMatch[1]}`;

    const api = async (pathName, opts = {}) => {
      return fetch(`${baseUrl}${pathName}`, {
        ...opts,
        headers: {
          cookie: cookieHeader,
          origin: baseUrl,
          'content-type': 'application/json',
          ...(opts.headers || {}),
        },
      });
    };

    // 5. Overview reflects post-login initialization + catalog metrics
    const ovRes = await api('/api/onboarding/overview');
    assert.equal(ovRes.status, 200);
    const ov = await ovRes.json();
    assert.ok(ov.catalogSummary.total >= 120);
    assert.ok(Array.isArray(ov.initRuns) && ov.initRuns.length >= 1, 'Expected post-login init run created on login');

    // 6. Create client tenant
    const clientRes = await api('/api/admin/clients', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Dhaka Growth Client',
        business: 'Dhaka Learning Ltd',
        phone: '+8801711000001',
        platforms: ['facebook', 'whatsapp'],
      }),
    });
    assert.equal(clientRes.status, 200);
    const { client } = await clientRes.json();
    assert.ok(client?.id);

    // 6b. Identity-first integration handover: strict inputs, tenant scope, real DB snapshot, owner portal checkpoint.
    const badPhoneHandover = await api('/api/onboarding/handover', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: client.id,
        providerKey: 'whatsapp_cloud_api',
        identityKind: 'phone',
        identityValue: '8801711000001',
      }),
    });
    assert.equal(badPhoneHandover.status, 400, 'Phone handover must require an explicit E.164 + prefix.');

    const badUrlHandover = await api('/api/onboarding/handover', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: client.id,
        providerKey: 'meta_facebook_pages',
        identityKind: 'url',
        identityValue: 'http://facebook.com/example',
      }),
    });
    assert.equal(badUrlHandover.status, 400, 'Provider account URLs must use HTTPS.');

    const whatsappHandover = await api('/api/onboarding/handover', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: client.id,
        providerKey: 'whatsapp_cloud_api',
        identityKind: 'phone',
        identityValue: '+8801711000001',
      }),
    });
    assert.equal(whatsappHandover.status, 200, `WhatsApp handover failed: ${await whatsappHandover.clone().text()}`);
    const whatsappPackage = await whatsappHandover.json();
    assert.equal(whatsappPackage.handover.suppliedIdentity.value, '+8801711000001');
    assert.equal(whatsappPackage.handover.handover.secretsIncluded, false);
    assert.equal(whatsappPackage.handover.verification.verified, false);
    assert.equal(whatsappPackage.discovery.fetchStatus, 'SNAPSHOT_CATALOG_SYNCED');

    const noTokenAssetDiscovery = await api('/api/onboarding/discovery', {
      method: 'POST',
      body: JSON.stringify({
        action: 'discover_accounts',
        tenantId: client.id,
        providerKey: 'whatsapp_cloud_api',
        identityValue: '+8801711000001',
      }),
    });
    assert.equal(noTokenAssetDiscovery.status, 400, 'Account discovery must require an actual provider-issued OAuth token.');

    // Provider-issued identifiers may be included in owner handover; access tokens must remain encrypted and absent.
    for (const credential of [
      { providerKey: 'meta_facebook_pages', credentialType: 'account_identifier', label: 'page_123456', value: '123456' },
      { providerKey: 'meta_facebook_pages', credentialType: 'page_access_token', label: '123456', value: 'PAGE_ACCESS_TOKEN_SENTINEL_778899' },
      { providerKey: 'whatsapp_cloud_api', credentialType: 'business_identifier', label: 'primary', value: 'WABA_123456' },
      { providerKey: 'whatsapp_cloud_api', credentialType: 'account_identifier', label: 'primary', value: 'PHONE_ID_98765' },
    ]) {
      const storedIdentifier = await api('/api/onboarding/vault', {
        method: 'POST',
        body: JSON.stringify({
          action: 'store',
          tenantId: client.id,
          providerKey: credential.providerKey,
          credentialType: credential.credentialType,
          label: credential.label,
          value: credential.value,
        }),
      });
      assert.equal(storedIdentifier.status, 200);
      assert.equal(JSON.stringify(await storedIdentifier.json()).includes(credential.value), false);
    }
    const idHandover = await api('/api/onboarding/handover', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: client.id,
        providerKey: 'whatsapp_cloud_api',
        identityKind: 'phone',
        identityValue: '+8801711000001',
      }),
    });
    assert.equal(idHandover.status, 200);
    const idHandoverData = await idHandover.json();
    const issuedIds = idHandoverData.handover.handover.providerIssuedIdentifiers.map(item => item.value);
    assert.ok(issuedIds.includes('WABA_123456'));
    assert.ok(issuedIds.includes('PHONE_ID_98765'));
    assert.equal(JSON.stringify(idHandoverData).includes('PAGE_ACCESS_TOKEN_SENTINEL_778899'), false, 'Handover must never expose provider access tokens.');

    const accessOnlyVault = await api('/api/onboarding/vault', {
      method: 'POST',
      body: JSON.stringify({
        action: 'store',
        tenantId: client.id,
        providerKey: 'hubspot_crm_api',
        credentialType: 'api_key',
        label: 'access_only_test',
        value: 'HUBSPOT_ACCESS_ONLY_SENTINEL',
      }),
    });
    assert.equal(accessOnlyVault.status, 200);
    const honestProbe = await api('/api/onboarding/discovery', {
      method: 'POST',
      body: JSON.stringify({ action: 'verify_live', tenantId: client.id, providerKey: 'hubspot_crm_api' }),
    });
    assert.equal(honestProbe.status, 200);
    assert.equal((await honestProbe.json()).verification.verified, false);
    const accessOnlyMetadata = await api(`/api/onboarding/vault?tenantId=${encodeURIComponent(client.id)}&providerKey=hubspot_crm_api`);
    const accessOnlyRows = (await accessOnlyMetadata.json()).credentials;
    assert.equal(accessOnlyRows.find(row => row.credentialType === 'api_key')?.lastVerifiedAt, null, 'Reading/decrypting a credential must not mark it API-verified.');

    const facebookHandover = await api('/api/onboarding/handover', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: client.id,
        providerKey: 'meta_facebook_pages',
        identityKind: 'url',
        identityValue: 'https://www.facebook.com/alo.education',
        startOfficialPortal: true,
      }),
    });
    assert.equal(facebookHandover.status, 200, `Facebook handover failed: ${await facebookHandover.clone().text()}`);
    const facebookPackage = await facebookHandover.json();
    assert.equal(facebookPackage.handover.suppliedIdentity.hostname, 'www.facebook.com');
    assert.equal(facebookPackage.browserSession.status, 'WAITING_FOR_OWNER');
    assert.match(facebookPackage.browserSession.officialUrl, /^https:\/\//);
    assert.equal(facebookPackage.handover.handover.secretsIncluded, false);

    // 7. Submit Requirements + Recommendations
    const reqRes = await api('/api/onboarding/requirements', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: client.id,
        businessName: 'Dhaka Learning Ltd',
        industry: 'Education',
        businessModel: 'education',
        targetCountries: ['BD'],
        monthlyMarketingBudget: 'bootstrap',
        technicalExperience: 'intermediate',
        requiredChannels: ['social', 'messaging', 'email', 'crm'],
        emailVolume: '2500_to_50000',
        ecommercePlatform: 'none',
        existingWebsiteDomain: 'https://aloapi.test',
        existingAccounts: ['meta_facebook_pages'],
        requiredIntegrations: ['whatsapp_cloud_api', 'brevo_api'],
        budgetConstraint: 'free_and_open_source_first',
        teamSize: 'small_2_10',
        privacyComplianceNeeds: ['GDPR'],
        automationPreferences: 'self_hosted_open_source',
      }),
    });
    assert.equal(reqRes.status, 200, `Requirements failed: ${await reqRes.clone().text()}`);
    const reqData = await reqRes.json();
    assert.equal(reqData.recommendation.playbooks.length, 6);

    // 8. Create Workflow & Verify State Machine Guards
    const wfCreate = await api('/api/onboarding/workflows', {
      method: 'POST',
      body: JSON.stringify({ action: 'init', tenantId: client.id, providerKey: 'whatsapp_cloud_api' }),
    });
    assert.equal(wfCreate.status, 200);
    const { workflow } = await wfCreate.json();
    assert.equal(workflow.state, 'NOT_STARTED');

    const badJump = await api('/api/onboarding/workflows', {
      method: 'POST',
      body: JSON.stringify({ action: 'transition', workflowId: workflow.id, nextState: 'VERIFIED', reason: 'illegal' }),
    });
    assert.equal(badJump.status, 400);

    const goodStep = await api('/api/onboarding/workflows', {
      method: 'POST',
      body: JSON.stringify({ action: 'transition', workflowId: workflow.id, nextState: 'DISCOVERY', reason: 'catalog selected' }),
    });
    assert.equal(goodStep.status, 200);
    assert.equal((await goodStep.json()).workflow.state, 'DISCOVERY');

    // 9. Browser Orchestrator Guardrail & Session Lifecycle
    const badBrowser = await api('/api/onboarding/browser', {
      method: 'POST',
      body: JSON.stringify({
        action: 'start',
        tenantId: client.id,
        providerKey: 'whatsapp_cloud_api',
        targetUrl: 'https://evil-phishing-whatsapp.invalid/login',
      }),
    });
    assert.equal(badBrowser.status, 400);

    const goodBrowser = await api('/api/onboarding/browser', {
      method: 'POST',
      body: JSON.stringify({
        action: 'start',
        tenantId: client.id,
        providerKey: 'whatsapp_cloud_api',
        targetUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
      }),
    });
    assert.equal(goodBrowser.status, 200);

    // 10. OAuth PKCE Creation + Invalid Redirect Rejected + Replay Rejection + Token Revocation
    const badRedirect = await api('/api/onboarding/oauth', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create_flow',
        tenantId: client.id,
        providerKey: 'google_analytics4',
        redirectUri: 'javascript:alert(1)',
      }),
    });
    assert.equal(badRedirect.status, 400);

    const oauthRes = await api('/api/onboarding/oauth', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create_flow',
        tenantId: client.id,
        providerKey: 'google_analytics4',
        redirectUri: `${baseUrl}/api/onboarding/oauth/callback`,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
      }),
    });
    assert.equal(oauthRes.status, 200, `OAuth failed: ${await oauthRes.clone().text()}`);
    const oauthData = await oauthRes.json();
    assert.match(oauthData.authorizationUrl, /code_challenge_method=S256/);

    // Simulated provider denial callback consumes single-use state token and blocks replay
    const denyCb = await api(`/api/onboarding/oauth/callback?state=${encodeURIComponent(oauthData.stateToken)}&error=access_denied`);
    assert.equal(denyCb.status, 400);
    const replayCb = await api(`/api/onboarding/oauth/callback?state=${encodeURIComponent(oauthData.stateToken)}&code=abc`);
    assert.equal(replayCb.status, 400);
    assert.match(await replayCb.text(), /replay rejected/i);

    const revokeOAuth = await api('/api/onboarding/oauth', {
      method: 'POST',
      body: JSON.stringify({ action: 'revoke', tenantId: client.id, providerKey: 'google_analytics4' }),
    });
    assert.equal(revokeOAuth.status, 200);

    // 11. Vault Store -> Never leaks plaintext -> Rotate Key -> Encrypted Backup -> Revoke
    const secretSentinel = 'LIVE_SECRET_SENTINEL_99887766';
    const vaultStore = await api('/api/onboarding/vault', {
      method: 'POST',
      body: JSON.stringify({
        action: 'store',
        tenantId: client.id,
        providerKey: 'whatsapp_cloud_api',
        credentialType: 'access_token',
        label: 'access_token',
        value: secretSentinel,
        scopes: ['whatsapp_business_messaging'],
      }),
    });
    assert.equal(vaultStore.status, 200, `Vault store failed: ${await vaultStore.clone().text()}`);
    const stored = await vaultStore.json();
    assert.equal(JSON.stringify(stored).includes(secretSentinel), false, 'Plaintext secret must NEVER appear in API response');

    const vaultRotate = await api('/api/onboarding/vault', {
      method: 'POST',
      body: JSON.stringify({ action: 'rotate', tenantId: client.id, newKey: rotatedKey }),
    });
    assert.equal(vaultRotate.status, 200);
    assert.equal((await vaultRotate.json()).rotatedCount, 1);

    const vaultBackup = await api(`/api/onboarding/vault?mode=backup&tenantId=${encodeURIComponent(client.id)}`);
    assert.equal(vaultBackup.status, 200);
    const backupJson = await vaultBackup.json();
    assert.equal(JSON.stringify(backupJson).includes(secretSentinel), false, 'Encrypted backup must NEVER contain plaintext');

    // Tampered backup restoration rejected before touching DB; cross-tenant restore rejected
    const tamperedRestore = await api('/api/onboarding/vault', {
      method: 'POST',
      body: JSON.stringify({
        action: 'restore_backup',
        tenantId: client.id,
        backup: {
          tenantId: client.id,
          records: [{ providerKey: 'whatsapp_cloud_api', credentialType: 'api_key', label: 'bad', ciphertext: 'v1:invalid.cipher.text' }],
        },
      }),
    });
    assert.equal(tamperedRestore.status, 400);

    // Rotate key back and verify clean restore on valid encrypted backup exported under original key
    const restoreWrongKey = await api('/api/onboarding/vault', {
      method: 'POST',
      body: JSON.stringify({ action: 'restore_backup', tenantId: client.id, backup: backupJson }),
    });
    // backupJson was encrypted under rotatedKey, whereas active server key is vaultKey -> wrong-key restore MUST reject!
    assert.equal(restoreWrongKey.status, 400);

    // Cross-tenant Vault isolation enforcement
    const crossTenantRevoke = await api('/api/onboarding/vault', {
      method: 'POST',
      body: JSON.stringify({
        action: 'revoke',
        credentialId: stored.credential.id,
        tenantId: 'other-tenant-id',
      }),
    });
    assert.equal(crossTenantRevoke.status, 400);

    // Valid active-key store + backup + revoke + restore_backup round-trip
    const freshStore = await api('/api/onboarding/vault', {
      method: 'POST',
      body: JSON.stringify({
        action: 'store',
        tenantId: client.id,
        providerKey: 'brevo_api',
        credentialType: 'api_key',
        label: 'restore_test',
        value: 'BREVO_SECRET_RESTORE_CHECK',
      }),
    });
    assert.equal(freshStore.status, 200);
    const freshCred = (await freshStore.json()).credential;
    const brevoBackupRes = await api(`/api/onboarding/vault?mode=backup&tenantId=${encodeURIComponent(client.id)}`);
    const brevoBackup = await brevoBackupRes.json();
    brevoBackup.records = brevoBackup.records.filter(r => r.providerKey === 'brevo_api');
    await api('/api/onboarding/vault', {
      method: 'POST',
      body: JSON.stringify({ action: 'revoke', credentialId: freshCred.id, tenantId: client.id }),
    });
    const restoreGood = await api('/api/onboarding/vault', {
      method: 'POST',
      body: JSON.stringify({ action: 'restore_backup', tenantId: client.id, backup: brevoBackup }),
    });
    assert.equal(restoreGood.status, 200);
    assert.equal((await restoreGood.json()).restoredCount, 1);

    // 11b. Live Webhook HMAC Verification Tester
    const webhookPass = await api('/api/onboarding/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: client.id,
        providerKey: 'whatsapp_cloud_api',
        scheme: 'meta_hmac_sha256',
        payloadRaw: '{"event":"messages"}',
        testSecret: 'ephemeral-webhook-signing-key',
      }),
    });
    assert.equal(webhookPass.status, 200);
    assert.equal((await webhookPass.json()).verified, true);

    // 12. Discovery + Honest Live Verification Guard
    const verifyRes = await api('/api/onboarding/discovery', {
      method: 'POST',
      body: JSON.stringify({ action: 'verify_live', tenantId: client.id, providerKey: 'hubspot_crm_api' }),
    });
    assert.equal(verifyRes.status, 200);
    assert.equal((await verifyRes.json()).verification.verified, false);

    // 13. Autonomous Agents A-H Execution
    for (const [agentCode, action] of [
      ['A', 'evaluate_requirements'],
      ['B', 'check_duplicate_accounts'],
      ['C', 'prepare_developer_app_checklist'],
      ['D', 'inspect_credential_expiry'],
      ['E', 'generate_discovery_snapshot'],
      ['F', 'generate_schema_mapping'],
      ['G', 'audit_vault_redaction'],
      ['H', 'compile_secret_free_export_bundle'],
    ]) {
      const aRes = await api('/api/onboarding/agents', {
        method: 'POST',
        body: JSON.stringify({ agentCode, action, tenantId: client.id, providerKey: 'whatsapp_cloud_api' }),
      });
      assert.equal(aRes.status, 200, `Agent ${agentCode} failed: ${await aRes.clone().text()}`);
    }

    // 14. Omni-Routing: Source Guard + Payload Validation + Idempotency + Retry Schedule + Dead-Letter + Replay + Cancellation
    const badSource = await api('/api/onboarding/omni-events', {
      method: 'POST',
      body: JSON.stringify({
        action: 'dispatch',
        tenantId: client.id,
        sourceChannel: 'arbitrary_untrusted_shell',
        eventType: 'lead.captured',
        payload: { x: 1 },
      }),
    });
    assert.equal(badSource.status, 400);

    const badPayload = await api('/api/onboarding/omni-events', {
      method: 'POST',
      body: JSON.stringify({
        action: 'dispatch',
        tenantId: client.id,
        sourceChannel: 'whatsapp',
        eventType: 'lead.captured',
        payload: ['not-an-object'],
      }),
    });
    assert.equal(badPayload.status, 400);

    const ev1 = await api('/api/onboarding/omni-events', {
      method: 'POST',
      body: JSON.stringify({
        action: 'dispatch',
        tenantId: client.id,
        sourceChannel: 'whatsapp',
        eventType: 'lead.captured',
        idempotencyKey: 'e2e-idem-1',
        payload: { phone: '+8801700000000' },
      }),
    });
    assert.equal(ev1.status, 200, `Omni dispatch failed: ${await ev1.clone().text()}`);
    const ev2 = await api('/api/onboarding/omni-events', {
      method: 'POST',
      body: JSON.stringify({
        action: 'dispatch',
        tenantId: client.id,
        sourceChannel: 'whatsapp',
        eventType: 'lead.captured',
        idempotencyKey: 'e2e-idem-1',
        payload: { phone: '+8801700000000' },
      }),
    });
    assert.equal(ev2.status, 200);
    assert.equal((await ev2.json()).deduplicated, true);

    const dlq = await api('/api/onboarding/omni-events', {
      method: 'POST',
      body: JSON.stringify({
        action: 'dispatch',
        tenantId: client.id,
        sourceChannel: 'telegram',
        eventType: 'lead.captured',
        idempotencyKey: 'e2e-dlq-1',
        maxAttempts: 1,
        payload: { simulateTransientFailure: true, chat: 123 },
      }),
    });
    assert.equal(dlq.status, 200);
    const dlqBody = await dlq.json();
    assert.equal(dlqBody.event.status, 'DEAD_LETTER');

    const replay = await api('/api/onboarding/omni-events', {
      method: 'POST',
      body: JSON.stringify({ action: 'replay', eventId: dlqBody.event.id }),
    });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).event.status, 'COMPLETED');

    const retryEv = await api('/api/onboarding/omni-events', {
      method: 'POST',
      body: JSON.stringify({
        action: 'dispatch',
        tenantId: client.id,
        sourceChannel: 'telegram',
        eventType: 'lead.captured',
        idempotencyKey: 'e2e-cancel-1',
        maxAttempts: 3,
        payload: { simulateTransientFailure: true },
      }),
    });
    assert.equal(retryEv.status, 200);
    const retryBody = await retryEv.json();
    assert.equal(retryBody.event.status, 'RETRY_SCHEDULED');
    assert.ok(retryBody.event.nextAttemptAt);

    const cancelEv = await api('/api/onboarding/omni-events', {
      method: 'POST',
      body: JSON.stringify({ action: 'cancel', eventId: retryBody.event.id, reason: 'Operator cancelled' }),
    });
    assert.equal(cancelEv.status, 200);
    assert.equal((await cancelEv.json()).event.status, 'CANCELLED');

    // 15. Integrity Audit + Idempotent Re-Init + User Row Preservation + Protected Path Refusal
    const reInit = await api('/api/onboarding/system', {
      method: 'POST',
      body: JSON.stringify({ action: 'initialize' }),
    });
    assert.equal(reInit.status, 200);
    assert.equal((await reInit.json()).init.steps.length, 13);

    // Existing client records preserved across repeated initialization
    const clientsAfterInit = await api('/api/admin/clients');
    assert.equal(clientsAfterInit.status, 200);
    const clientList = (await clientsAfterInit.json()).clients;
    assert.ok(clientList.some(c => c.id === client.id && c.business === 'Dhaka Learning Ltd'), 'Existing client data must survive repeated init');

    const integrityAudit = await api('/api/onboarding/system', {
      method: 'POST',
      body: JSON.stringify({ action: 'integrity_check' }),
    });
    assert.equal(integrityAudit.status, 200);
    const auditBody = await integrityAudit.json();
    assert.ok(auditBody.report.findings.length >= 4);

    const protectedRepair = await api('/api/onboarding/system', {
      method: 'POST',
      body: JSON.stringify({ action: 'safe_repair', targets: ['prisma/schema.prisma'] }),
    });
    assert.equal(protectedRepair.status, 200);
    const repairData = await protectedRepair.json();
    assert.equal(repairData.repairs[0].repaired, false);
    assert.match(repairData.repairs[0].message, /Refused: protected/);

    // 16. Secret-Free Multi-Format Exports (ZIP, JSON, YAML, Markdown, CSV)
    const exportZip = await api(`/api/onboarding/export?providerKey=whatsapp_cloud_api&tenantId=${encodeURIComponent(client.id)}&format=zip`);
    assert.equal(exportZip.status, 200);
    assert.equal(exportZip.headers.get('x-aloapi-secrets-included'), 'false');
    const zipBuf = Buffer.from(await exportZip.arrayBuffer());
    assert.equal(zipBuf.subarray(0, 4).toString('binary'), 'PK\x03\x04');
    assert.equal(zipBuf.toString('utf8').includes(secretSentinel), false, 'ZIP archive must NEVER include secret plaintext');

    for (const fmt of ['json', 'yaml', 'markdown', 'csv']) {
      const fmtRes = await api(`/api/onboarding/export?providerKey=whatsapp_cloud_api&tenantId=${encodeURIComponent(client.id)}&format=${fmt}`);
      assert.equal(fmtRes.status, 200, `Export format ${fmt} failed`);
      assert.equal(fmtRes.headers.get('x-aloapi-secrets-included'), 'false');
      const txt = await fmtRes.text();
      assert.equal(txt.includes(secretSentinel), false, `Export format ${fmt} must NEVER include secret plaintext`);
    }

    // 17. Homepage renders cleanly with status 200
    const homeRes = await fetch(`${baseUrl}/`);
    assert.equal(homeRes.status, 200);
    const homeHtml = await homeRes.text();
    assert.match(homeHtml, /<!DOCTYPE html>/i);
  } catch (err) {
    console.error('Server logs during E2E test:\n', serverLogs.join(''));
    throw err;
  }
});

test('missing vault key triggers DEGRADED post-login init without losing existing data and recovers once configured', async (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-e2e-recovery-'));
  const dbPath = path.join(tmpDir, 'recovery.db');
  const dbUrl = `file:${dbPath}`;
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  // Seed legacy baseline + security DB with existing client record BEFORE running v2 migration
  const baselineSql = fs.readFileSync(path.join(ROOT, 'prisma/migrations/20261115000000_baseline/migration.sql'), 'utf8');
  const securitySql = fs.readFileSync(path.join(ROOT, 'prisma/migrations/20261115000100_security_integrations/migration.sql'), 'utf8');
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec(`CREATE TABLE "_prisma_migrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  );`);
  sqlite.exec(baselineSql);
  sqlite.exec(securitySql);
  sqlite.prepare('INSERT INTO "ClientAccount" ("id", "name", "business", "username", "passwordHash", "platforms", "status") VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('legacy-client-1', 'Existing Owner', 'Legacy Shop BD', 'legacyshop', 'salt:hash', '["facebook"]', 'active');
  sqlite.prepare(`INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count") VALUES (?, ?, ?, ?, ?, ?)`)
    .run('m1', 'c1', '2026-11-15T00:00:00.000Z', '20261115000000_baseline', '2026-11-15T00:00:00.000Z', 1);
  sqlite.prepare(`INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count") VALUES (?, ?, ?, ?, ?, ?)`)
    .run('m2', 'c2', '2026-11-15T00:01:00.000Z', '20261115000100_security_integrations', '2026-11-15T00:01:00.000Z', 1);
  sqlite.close();

  // Apply additive v2 migration on top of existing database
  const prismaCli = path.join(ROOT, 'node_modules', 'prisma', 'build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  });

  // Boot server WITHOUT ALOAPI_VAULT_KEY to simulate missing vault config failure
  const port1 = await getFreePort();
  const url1 = `http://127.0.0.1:${port1}`;
  const envNoKey = { ...process.env };
  delete envNoKey.ALOAPI_VAULT_KEY;

  const s1 = spawn(process.execPath, [STANDALONE_SERVER], {
    cwd: path.join(ROOT, '.next', 'standalone'),
    env: {
      ...envNoKey,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port1),
      DATABASE_URL: dbUrl,
      ADMIN_BOOTSTRAP_USERNAME: 'recadmin',
      ADMIN_BOOTSTRAP_PASSWORD: 'RecoveryStrongPassword2026!',
    },
    stdio: 'ignore',
  });
  try {
    await waitForHealth(url1);
    const l1 = await fetch(`${url1}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: url1 },
      body: JSON.stringify({ username: 'recadmin', password: 'RecoveryStrongPassword2026!', role: 'admin' }),
    });
    assert.equal(l1.status, 200);
    const cookie1 = `aia_session=${/aia_session=([^;]+)/.exec(l1.headers.get('set-cookie') || '')[1]}`;

    const ov1 = await (await fetch(`${url1}/api/onboarding/overview`, { headers: { cookie: cookie1 } })).json();
    assert.equal(ov1.vaultReady, false);
    assert.equal(ov1.initRuns[0].status, 'DEGRADED');
    assert.ok(ov1.clients.some(c => c.id === 'legacy-client-1' && c.business === 'Legacy Shop BD'));
  } finally {
    if (!s1.killed) s1.kill('SIGTERM');
  }

  // Restart with valid ALOAPI_VAULT_KEY -> verify recovery without data loss
  const port2 = await getFreePort();
  const url2 = `http://127.0.0.1:${port2}`;
  const s2 = spawn(process.execPath, [STANDALONE_SERVER], {
    cwd: path.join(ROOT, '.next', 'standalone'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port2),
      DATABASE_URL: dbUrl,
      ALOAPI_VAULT_KEY: '0123456789abcdef0123456789abcdef',
    },
    stdio: 'ignore',
  });
  t.after(() => {
    if (!s2.killed) s2.kill('SIGTERM');
  });

  await waitForHealth(url2);
  const l2 = await fetch(`${url2}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: url2 },
    body: JSON.stringify({ username: 'recadmin', password: 'RecoveryStrongPassword2026!', role: 'admin' }),
  });
  assert.equal(l2.status, 200);
  const cookie2 = `aia_session=${/aia_session=([^;]+)/.exec(l2.headers.get('set-cookie') || '')[1]}`;
  const ov2 = await (await fetch(`${url2}/api/onboarding/overview`, { headers: { cookie: cookie2 } })).json();
  assert.equal(ov2.vaultReady, true);
  assert.notEqual(ov2.initRuns[0].status, 'DEGRADED');
  assert.ok(ov2.clients.some(c => c.id === 'legacy-client-1' && c.business === 'Legacy Shop BD'));
});
