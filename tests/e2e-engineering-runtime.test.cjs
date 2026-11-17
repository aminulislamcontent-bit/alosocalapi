const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const http = require('node:http');
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
      if (res.ok && (await res.json()).status === 'ok') return;
    } catch {
      // booting
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/health`);
}

test('full E2E Integration Engineering HTTP runtime: URL discovery -> 131 adapters -> crypto Vault prep -> checkpoints -> ZIP handover -> client import', async (t) => {
  if (!fs.existsSync(STANDALONE_SERVER)) {
    assert.fail(`Standalone build missing at ${STANDALONE_SERVER}. Run npm run build first.`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-eng-e2e-'));
  const dbPath = path.join(tmpDir, 'eng-e2e.db');
  const dbUrl = `file:${dbPath}`;
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const prismaCli = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  });

  // Mock target business website for live HTTP discovery test
  const siteSrv = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<html><head><title>Dhaka Labs</title><meta property="og:site_name" content="Dhaka Labs" /></head>
      <body><a href="mailto:founders@dhakalabs.example">Email</a><a href="https://linkedin.com/company/dhakalabs">LinkedIn</a></body></html>`);
  });
  await new Promise(r => siteSrv.listen(0, '127.0.0.1', r));
  t.after(() => siteSrv.close());
  const sitePort = siteSrv.address().port;

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  const child = spawn(process.execPath, [STANDALONE_SERVER], {
    cwd: path.join(ROOT, '.next', 'standalone'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: dbUrl,
      ALOAPI_VAULT_KEY: '0123456789abcdef0123456789abcdef',
      ALOAPI_ALLOW_TEST_LOOPBACK_DISCOVERY: 'true',
      ADMIN_BOOTSTRAP_USERNAME: 'engadmin',
      ADMIN_BOOTSTRAP_PASSWORD: 'EngineeringPassword2026!',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', d => logs.push(d.toString()));
  child.stderr.on('data', d => logs.push(d.toString()));
  t.after(() => {
    if (!child.killed) child.kill('SIGTERM');
  });

  try {
    await waitForHealth(baseUrl);

    // 1. Auth & CSRF enforcement
    const unauth = await fetch(`${baseUrl}/api/engineering/projects`);
    assert.equal(unauth.status, 401);

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ username: 'engadmin', password: 'EngineeringPassword2026!', role: 'admin' }),
    });
    assert.equal(loginRes.status, 200);
    const cookieHeader = `aia_session=${/aia_session=([^;]+)/.exec(loginRes.headers.get('set-cookie') || '')[1]}`;
    const api = (p, opts = {}) =>
      fetch(`${baseUrl}${p}`, {
        ...opts,
        headers: { cookie: cookieHeader, origin: baseUrl, 'content-type': 'application/json', ...(opts.headers || {}) },
      });

    // 2. /engineering UI page returns 200
    const uiRes = await fetch(`${baseUrl}/engineering`, { headers: { cookie: cookieHeader } });
    assert.equal(uiRes.status, 200);

    // 3. Universal provider adapters list all 131 providers
    const adapRes = await api('/api/engineering/providers');
    assert.equal(adapRes.status, 200);
    assert.equal((await adapRes.json()).total, 131);

    // 4. Website URL discovery
    const discRes = await api('/api/engineering/projects', {
      method: 'POST',
      body: JSON.stringify({ action: 'discover_website', websiteUrl: `http://127.0.0.1:${sitePort}`, allowLoopbackForTest: true }),
    });
    assert.equal(discRes.status, 201);
    const { project, discovery } = await discRes.json();
    assert.equal(discovery.businessName, 'Dhaka Labs');

    // 5. Prepare SendGrid + LinkedIn + HubSpot
    const prepRes = await api('/api/engineering/projects', {
      method: 'POST',
      body: JSON.stringify({ action: 'prepare_providers', projectId: project.id, providerKeys: ['sendgrid_api', 'linkedin_marketing_api', 'hubspot_crm_api'] }),
    });
    assert.equal(prepRes.status, 200);
    assert.equal((await prepRes.json()).prepared.length, 3);

    // 6. Live connection probe accurately reports CLIENT_ACTIVATION_REQUIRED (never fakes VERIFIED)
    const probeRes = await api('/api/engineering/providers', {
      method: 'POST',
      body: JSON.stringify({ action: 'test_connection', projectId: project.id, providerKey: 'sendgrid_api' }),
    });
    assert.equal(probeRes.status, 200);
    const probeBody = await probeRes.json();
    assert.equal(probeBody.probe.verified, false);
    assert.equal(probeBody.updatedVerificationStatus, 'CLIENT_ACTIVATION_REQUIRED');

    // 7. Complete first checkpoint & verify auto-resume
    const cpList = await (await api(`/api/engineering/checkpoints?projectId=${project.id}`)).json();
    assert.ok(cpList.checkpoints.length >= 3);
    const cpDone = await api('/api/engineering/checkpoints', {
      method: 'POST',
      body: JSON.stringify({ action: 'complete_and_resume', checkpointId: cpList.checkpoints[0].id }),
    });
    assert.equal(cpDone.status, 200);

    // 8. Generate Handover Package + Secret-Free ZIP + Validate Client Import
    const pkgRes = await api('/api/engineering/handover', {
      method: 'POST',
      body: JSON.stringify({ action: 'generate_package', projectId: project.id }),
    });
    assert.equal(pkgRes.status, 201);
    const pkgBody = await pkgRes.json();
    assert.equal(pkgBody.manifest.secretsIncluded, false);

    const zipRes = await fetch(`${baseUrl}/api/engineering/handover?projectId=${project.id}&format=zip`, { headers: { cookie: cookieHeader } });
    assert.equal(zipRes.status, 200);
    assert.equal(zipRes.headers.get('x-aloapi-secrets-included'), 'false');
    const zipBytes = Buffer.from(await zipRes.arrayBuffer());
    assert.equal(zipBytes.subarray(0, 2).toString('utf8'), 'PK');

    const impRes = await api('/api/engineering/handover', {
      method: 'POST',
      body: JSON.stringify({
        action: 'validate_client_import',
        importManifest: pkgBody.clientImportManifest,
        expectedSha256: pkgBody.sha256,
        manifestForHashCheck: pkgBody.manifest,
      }),
    });
    assert.equal(impRes.status, 200);
    assert.equal((await impRes.json()).originalCrmModified, false);

    // 9. Authorized Client API execution blocks unapproved high-impact action (403) & reports missing token honestly (200)
    const blockedExecRes = await api('/api/engineering/providers', {
      method: 'POST',
      body: JSON.stringify({
        action: 'execute_client_api',
        projectId: project.id,
        providerKey: 'sendgrid_api',
        actionName: 'publish_campaign_broadcast',
        httpMethod: 'POST',
        endpointPath: '/v3/marketing/campaigns',
        ownerApprovalGranted: false,
      }),
    });
    assert.equal(blockedExecRes.status, 403);
    assert.equal((await blockedExecRes.json()).status, 'APPROVAL_REQUIRED');

    const approvedExecRes = await api('/api/engineering/providers', {
      method: 'POST',
      body: JSON.stringify({
        action: 'execute_client_api',
        projectId: project.id,
        providerKey: 'sendgrid_api',
        actionName: 'publish_campaign_broadcast',
        httpMethod: 'POST',
        endpointPath: '/v3/marketing/campaigns',
        ownerApprovalGranted: true,
        approvalCheckpointId: cpList.checkpoints[0].id,
      }),
    });
    assert.equal(approvedExecRes.status, 200);
    assert.equal((await approvedExecRes.json()).status, 'CLIENT_ACTIVATION_REQUIRED');
  } catch (err) {
    console.error('Engineering E2E server logs:\n', logs.join(''));
    throw err;
  }
});
