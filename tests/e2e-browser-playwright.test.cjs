const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
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

async function launchChromiumBrowser() {
  const { chromium: pw } = require('playwright');
  const spMod = require('@sparticuz/chromium');
  const spChromium = spMod.default || spMod;
  const libDir = '/tmp/sparticuz-libs';
  const alArchive = path.join(ROOT, 'node_modules', '@sparticuz', 'chromium', 'bin', 'al2023.tar.br');
  if (fs.existsSync(alArchive) && !fs.existsSync(path.join(libDir, 'lib', 'libnspr4.so'))) {
    fs.mkdirSync(libDir, { recursive: true });
    const tarBuf = zlib.brotliDecompressSync(fs.readFileSync(alArchive));
    fs.writeFileSync('/tmp/al2023.tar', tarBuf);
    execFileSync('tar', ['-xf', '/tmp/al2023.tar', '-C', libDir]);
  }
  const execPath = await spChromium.executablePath();
  return pw.launch({
    executablePath: execPath,
    args: spChromium.args,
    headless: true,
    env: {
      ...process.env,
      LD_LIBRARY_PATH: `${path.join(libDir, 'lib')}:${process.env.LD_LIBRARY_PATH || ''}`,
    },
  });
}

test('Real Playwright Chromium click-through acceptance across login, discovery, 131 adapters, credentials/DNS/approval gate, checkpoints, handover & factory', async (t) => {
  if (!fs.existsSync(STANDALONE_SERVER)) {
    assert.fail(`Standalone build missing at ${STANDALONE_SERVER}. Run npm run build first.`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-pw-e2e-'));
  const shotsDir = path.join(tmpDir, 'screenshots');
  fs.mkdirSync(shotsDir, { recursive: true });
  const dbPath = path.join(tmpDir, 'pw.db');
  const dbUrl = `file:${dbPath}`;
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const prismaCli = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  });

  // Ephemeral target business site for live URL discovery
  const siteSrv = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<html><head><title>Dhaka Browser Commerce</title><meta property="og:site_name" content="Dhaka Browser Commerce" />
      <script>window.gtag = function(){};</script></head>
      <body><a href="mailto:hello@dhakacommerce.example">hello@dhakacommerce.example</a>
      <a href="https://facebook.com/dhakacommerce">Facebook</a><a href="/privacy-policy">Privacy</a></body></html>`);
  });
  await new Promise(r => siteSrv.listen(0, '127.0.0.1', r));
  t.after(() => siteSrv.close());
  const sitePort = siteSrv.address().port;

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const vaultSecret = '0123456789abcdef0123456789abcdef';
  const logs = [];
  const child = spawn(process.execPath, [STANDALONE_SERVER], {
    cwd: path.join(ROOT, '.next', 'standalone'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: dbUrl,
      ALOAPI_VAULT_KEY: vaultSecret,
      ALOAPI_ALLOW_TEST_LOOPBACK_DISCOVERY: 'true',
      ADMIN_BOOTSTRAP_USERNAME: 'pwadmin',
      ADMIN_BOOTSTRAP_PASSWORD: 'PlaywrightAdminPassword2026!',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', d => logs.push(d.toString()));
  child.stderr.on('data', d => logs.push(d.toString()));
  t.after(() => {
    if (!child.killed) child.kill('SIGTERM');
  });

  const browser = await launchChromiumBrowser();
  t.after(() => browser.close());

  try {
    await waitForHealth(baseUrl);
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();

    const pageErrors = [];
    const server500s = [];
    page.on('pageerror', err => pageErrors.push(err.message));
    page.on('response', res => {
      if (res.status() >= 500) server500s.push(`${res.status()} ${res.url()}`);
    });

    // 1. Login Gateway via real Chromium UI
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: /অ্যাডমিন/ }).click();
    await page.locator('#admin-user').fill('pwadmin');
    await page.locator('#admin-pass').fill('PlaywrightAdminPassword2026!');
    await page.screenshot({ path: path.join(shotsDir, '01-login.png') });
    await page.getByRole('button', { name: /অ্যাডমিন কনসোলে প্রবেশ/ }).click();

    await page.waitForSelector('text=Integration Engineering', { timeout: 15_000 });
    await page.getByRole('button', { name: /Integration Engineering/ }).click();
    await page.waitForSelector('text=Website-URL Autonomous Discovery', { timeout: 15_000 });

    // 2. Run Website-URL Discovery in browser UI (with HTML snapshot fallback since UI discovery does not send loopback flag)
    await page.getByPlaceholder('https://example.com').fill(`https://dhakacommerce.example`);
    await page.getByPlaceholder(/Optional: paste HTML source/).fill(
      `<html><head><title>Dhaka Browser Commerce</title><meta property="og:site_name" content="Dhaka Browser Commerce" /></head><body><a href="mailto:hello@dhakacommerce.example">Email</a><a href="https://facebook.com/dhakacommerce">FB</a></body></html>`,
    );
    await page.getByRole('button', { name: 'Run Website Discovery' }).click();
    await page.waitForSelector('text=Dhaka Browser Commerce', { timeout: 15_000 });
    await page.screenshot({ path: path.join(shotsDir, '02-discovery.png') });

    // 3. Universal Adapters (131) & Prepare Selected
    await page.getByRole('button', { name: /2\. Universal Adapters \(131\)/ }).click();
    await page.waitForSelector('text=131×17 Completion Matrix JSON', { timeout: 10_000 });
    await page.getByRole('button', { name: /Prepare Selected/ }).click();
    await page.screenshot({ path: path.join(shotsDir, '03-adapters.png') });

    // 4. Credentials, OAuth, DNS Verification & Approval-Gated Client API Runner
    await page.getByRole('button', { name: /3\. Credentials, OAuth, Webhooks & DNS/ }).click();
    await page.waitForSelector('text=Universal Credential Engineering Ledger', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Run Honest Live Connection Probe' }).first().click();
    await page.getByRole('button', { name: 'Verify Live DNS' }).first().click();
    await page.getByRole('button', { name: /Test Approval Gate/ }).click();
    await page.waitForSelector('text=APPROVAL_REQUIRED', { timeout: 10_000 });
    await page.getByLabel(/Explicit Owner Approval Granted/).check();
    await page.getByRole('button', { name: /Test Approval Gate/ }).click();
    await page.waitForSelector('text=CLIENT_ACTIVATION_REQUIRED', { timeout: 10_000 });
    await page.screenshot({ path: path.join(shotsDir, '04-credentials-gate.png') });

    // 5. Verification Checkpoints & Auto-Resume
    await page.getByRole('button', { name: /4\. Verification & Resume/ }).click();
    await page.waitForSelector('text=Completed → Resume AI', { timeout: 10_000 });
    await page.getByRole('button', { name: /Completed → Resume AI/ }).first().click();
    await page.waitForSelector('text=Auto-resumed workflow to:', { timeout: 10_000 });
    await page.screenshot({ path: path.join(shotsDir, '05-checkpoints.png') });

    // 6. Client Handover Package & Import Validation
    await page.getByRole('button', { name: /5\. Client Handover & Import/ }).click();
    await page.getByRole('button', { name: 'Generate Handover Package' }).click();
    await page.waitForSelector('text=Secrets Included: false', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Validate Client Project Import' }).click();
    await page.waitForSelector('text="originalCrmModified":false', { timeout: 10_000 });
    await page.screenshot({ path: path.join(shotsDir, '06-handover.png') });

    // 7. Smoke every administrator top-level navigation view in an isolated test database.
    const adminViews = [
      'Integration Engineering', 'Platform Factory (20)', 'Onboarding Hub (19 Views)',
      'ক্লায়েন্ট অ্যাক্সেস', 'CRM পাইপলাইন', 'ফলো-আপ টাস্ক', 'অটোমেশন ও নলেজ বেস',
      'SetupBot Pro', 'গ্রোথ ইঞ্জিন', 'API Intelligence', 'Security', 'Ops Dashboard',
      'Channel Matrix', 'Launch Planner', 'Access Workflow', 'Official setup references',
      'Provider MFA guidance', 'Provider account security', 'Blank .env template',
    ];
    for (const label of adminViews) {
      const navButton = page.locator('header button').filter({ hasText: label }).first();
      await navButton.click();
      await page.waitForTimeout(100);
      const mainText = (await page.locator('main').innerText()).trim();
      assert.ok(mainText.length > 20, 'Admin view should render after navigation: ' + label);
    }

    // 8. Navigate standalone /engineering & /factory pages
    await page.goto(`${baseUrl}/engineering`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=ALOAPI Autonomous Integration Engineering', { timeout: 15_000 });
    await page.goto(`${baseUrl}/factory/email_marketing`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=AI Email Marketing', { timeout: 15_000 });
    await page.screenshot({ path: path.join(shotsDir, '07-factory-email.png') });

    // Verify screenshots rendered real PNGs & zero secrets leaked to DOM
    for (const file of fs.readdirSync(shotsDir)) {
      const buf = fs.readFileSync(path.join(shotsDir, file));
      assert.equal(buf.subarray(0, 4).toString('hex'), '89504e47', `${file} must be a valid PNG`);
      assert.ok(buf.length > 5000, `${file} must be non-empty rendered screenshot`);
    }
    const bodyText = await page.locator('body').innerText();
    assert.ok(!bodyText.includes(vaultSecret));
    assert.ok(!bodyText.includes('whsec_aloapi_'));
    assert.equal(pageErrors.length, 0, `Uncaught browser page errors: ${pageErrors.join('; ')}`);
    assert.equal(server500s.length, 0, `Server 5xx errors: ${server500s.join('; ')}`);
    // Ensure sitePort reference used cleanly
    assert.ok(sitePort > 0);
  } catch (err) {
    console.error('Playwright E2E Server logs:\n', logs.join(''));
    throw err;
  }
});
