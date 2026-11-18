const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cli = import('../scripts/aloapi.mjs');
const REPO_ROOT = path.resolve(__dirname, '..');
const FIXTURE_VERSION = '1.2.3-fixture';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(err => (err ? reject(err) : resolve(addr.port)));
    });
  });
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function waitForBrowserCalls(browserLog, count) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (fs.existsSync(browserLog) && fs.readFileSync(browserLog, 'utf8').trim().split('\n').length >= count) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

function createFixtureProject(t, port) {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-launcher-test-'));
  const repoDir = path.join(tmpBase, 'repo');
  const stateDir = path.join(tmpBase, 'state');
  const binDir = path.join(tmpBase, 'bin');
  const browserLog = path.join(tmpBase, 'browser-calls.log');

  t.after(() => {
    // Ensure any test server left in service.json is cleaned up
    try {
      const pidFile = path.join(stateDir, 'service.json');
      if (fs.existsSync(pidFile)) {
        const rec = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
        if (Number.isInteger(rec.pid) && isPidAlive(rec.pid)) {
          process.kill(rec.pid, 'SIGKILL');
        }
      }
    } catch { /* ignore */ }
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  fs.mkdirSync(path.join(repoDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, 'prisma', 'migrations'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, 'node_modules', 'next', 'dist', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, 'node_modules', '.prisma', 'client'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, '.next', 'standalone'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(binDir, { recursive: true });

  for (const file of ['aloapi.mjs', 'migrations.mjs', 'version.mjs', 'install.sh']) {
    fs.copyFileSync(path.join(REPO_ROOT, 'scripts', file), path.join(repoDir, 'scripts', file));
  }

  fs.writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify({
    name: 'aloapi-test-fixture',
    version: FIXTURE_VERSION,
    bin: { aloapi: './scripts/aloapi.mjs' },
    scripts: {
      'db:migrate:deploy': 'node -e "process.exit(0)"',
      'db:generate': 'node -e "process.exit(0)"',
      'vault:migrate:credentials': 'node -e "process.exit(0)"',
      build: 'node -e "process.exit(0)"',
    },
  }, null, 2));

  fs.writeFileSync(path.join(repoDir, 'prisma', 'schema.prisma'), '// test schema\n');
  fs.writeFileSync(path.join(repoDir, 'prisma', 'migrations', 'migration_lock.toml'), 'provider = "sqlite"\n');
  fs.writeFileSync(path.join(repoDir, 'node_modules', 'next', 'dist', 'bin', 'next'), '#!/usr/bin/env node\n');
  fs.writeFileSync(path.join(repoDir, 'node_modules', '.prisma', 'client', 'default.js'), 'module.exports = {};\n');

  // Create BUILD_ID slightly in the future relative to src/ so needsProductionBuild is false
  const serverScript = `
const http = require('node:http');
const host = process.env.HOSTNAME || '127.0.0.1';
const port = Number(process.env.PORT || 47831);
const instanceId = process.env.ALOAPI_INSTANCE_ID || null;
const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'aloapi', database: 'reachable', instanceId }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<html><body>ALOAPI Dashboard</body></html>');
});
server.listen(port, host, () => {
  console.log('Fixture server listening on ' + host + ':' + port);
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
`;
  fs.writeFileSync(path.join(repoDir, '.next', 'standalone', 'server.js'), serverScript);
  fs.writeFileSync(path.join(repoDir, '.next', 'BUILD_ID'), 'test-build-id\n');

  // Pre-seed .env with test ephemeral port and vault key (avoid printing bootstrap password)
  fs.writeFileSync(path.join(repoDir, '.env'), [
    'DATABASE_URL="file:./db/custom.db"',
    'ALOAPI_HOST="127.0.0.1"',
    `ALOAPI_PORT="${port}"`,
    `ALOAPI_BASE_URL="http://localhost:${port}"`,
    'ALOAPI_VAULT_KEY="test-vault-key-must-be-at-least-32-bytes-long"',
    '',
  ].join('\n'), { mode: 0o600 });

  // Mock browser openers (xdg-open, open, wslview, cmd.exe) that record calls with timestamp & URL
  const mockBrowser = `#!/usr/bin/env bash
printf '%s|%s\\n' "$(basename "$0")" "$*" >> "${browserLog}"
`;
  for (const name of ['xdg-open', 'open', 'wslview', 'cmd.exe']) {
    const p = path.join(binDir, name);
    fs.writeFileSync(p, mockBrowser, { mode: 0o755 });
  }

  return { tmpBase, repoDir, stateDir, binDir, browserLog };
}

test('release and runtime metadata match the npm manifest', async () => {
  const pkg = require('../package.json');
  const lock = require('../package-lock.json');
  const { NODE_RANGE, supportsNode } = await import('../scripts/version.mjs');
  assert.equal(fs.readFileSync(path.join(REPO_ROOT, 'VERSION'), 'utf8').trim(), pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(pkg.engines.node, NODE_RANGE);
  assert.equal(lock.packages[''].engines.node, NODE_RANGE);
  assert.equal(supportsNode('22.16.0'), false);
  assert.equal(supportsNode('22.17.0'), true);
  assert.equal(supportsNode('23.0.0'), false);
  assert.equal(supportsNode('24.0.0'), true);
});

test('CLI binds to private default port and rejects unsafe public host/invalid port', async () => {
  const { parsePort, isLoopbackHost, serviceUrl, dashboardUrl } = await cli;
  assert.equal(parsePort(undefined), 47831);
  assert.equal(parsePort('48123'), 48123);
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('localhost'), true);
  assert.equal(isLoopbackHost('::1'), true);
  assert.equal(isLoopbackHost('0.0.0.0'), false);
  assert.equal(isLoopbackHost('192.168.1.4'), false);
  assert.equal(serviceUrl(47831, '127.0.0.1'), 'http://127.0.0.1:47831');
  assert.equal(serviceUrl(47831, '::1'), 'http://[::1]:47831');
  assert.equal(dashboardUrl(47831, '127.0.0.1'), 'http://localhost:47831');
  assert.equal(dashboardUrl(47831, 'localhost'), 'http://localhost:47831');
  assert.equal(dashboardUrl(47831, '::1'), 'http://[::1]:47831');
  assert.throws(() => parsePort('80'), /1024 to 65535/);
  assert.throws(() => parsePort('47831x'), /1024 to 65535/);
});

test('CLI dotenv parser ignores comments and preserves quoted values', async () => {
  const { parseEnvFile, redactSecrets } = await cli;
  assert.deepEqual(parseEnvFile('# a comment\n ALOAPI_HOST = "127.0.0.1"\nTOKEN=plain-value\nEMPTY=\ninvalid line\n'), {
    ALOAPI_HOST: '127.0.0.1', TOKEN: 'plain-value', EMPTY: '',
  });
  const masked = redactSecrets('err super-secret-vault-key-12345', { ALOAPI_VAULT_KEY: 'super-secret-vault-key-12345' });
  assert.equal(masked.includes('super-secret-vault-key-12345'), false);
  assert.match(masked, /\[REDACTED:ALOAPI_VAULT_KEY\]/);
});

test('CLI argument and browser launch selection are platform-specific including WSL2', async () => {
  const { parseArgs, parseCliOptions, browserInvocation, browserCandidates, isWsl } = await cli;
  assert.deepEqual(parseArgs(['start', '--dev', '--no-open']), { command: 'start', dev: true, noOpen: true });
  assert.equal(parseArgs([]).command, 'start');
  assert.deepEqual(browserInvocation('linux', 'http://127.0.0.1:47831'), { command: 'xdg-open', args: ['http://127.0.0.1:47831'] });
  assert.deepEqual(browserInvocation('darwin', 'http://127.0.0.1:47831'), { command: 'open', args: ['http://127.0.0.1:47831'] });
  assert.deepEqual(browserInvocation('win32', 'http://127.0.0.1:47831'), { command: 'cmd.exe', args: ['/c', 'start', '', 'http://127.0.0.1:47831'] });

  assert.equal(isWsl({ platform: 'linux', env: { WSL_DISTRO_NAME: 'Ubuntu' }, procVersion: '' }), true);
  assert.equal(isWsl({ platform: 'linux', env: {}, procVersion: 'Linux version 5.15.153.1-microsoft-standard-WSL2' }), true);
  assert.equal(isWsl({ platform: 'darwin', env: { WSL_DISTRO_NAME: 'Ubuntu' }, procVersion: 'microsoft' }), false);
  assert.equal(isWsl({ platform: 'linux', env: {}, procVersion: 'Linux version 6.1.0-generic' }), false);

  const wslCandidates = browserCandidates('linux', 'http://localhost:47831', {
    wsl: true,
    hasCommand: cmd => cmd === 'cmd.exe',
    cmdExePath: 'cmd.exe',
    powershellPath: 'powershell.exe',
  });
  assert.equal(wslCandidates[0].command, 'cmd.exe');
  assert.deepEqual(wslCandidates[0].args, ['/c', 'start', '', 'http://localhost:47831']);

  const wslWithWslview = browserCandidates('linux', 'http://localhost:47831', {
    wsl: true,
    hasCommand: () => true,
  });
  assert.equal(wslWithWslview[0].command, 'wslview');

  const opts = parseCliOptions(['logs', '-n', '25', '-f']);
  assert.equal(opts.command, 'logs');
  assert.equal(opts.lines, 25);
  assert.equal(opts.follow, true);
  assert.equal(parseCliOptions(['--no-open']).command, 'start');
  assert.equal(parseCliOptions(['--no-open']).noOpen, true);
  assert.equal(parseCliOptions(['--help']).command, 'help');
});

test('runtimeConfig rejects non-loopback host unless ALOAPI_ALLOW_PUBLIC_BIND=true', async () => {
  const { runtimeConfig } = await cli;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-sec-'));
  try {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'ALOAPI_HOST="0.0.0.0"\nALOAPI_PORT="47831"\n');
    const prevHost = process.env.ALOAPI_HOST;
    const prevPort = process.env.ALOAPI_PORT;
    const prevAllow = process.env.ALOAPI_ALLOW_PUBLIC_BIND;
    delete process.env.ALOAPI_HOST;
    delete process.env.ALOAPI_PORT;
    delete process.env.ALOAPI_ALLOW_PUBLIC_BIND;
    try {
      assert.throws(() => runtimeConfig(tmpDir), /loopback-only/);
      process.env.ALOAPI_ALLOW_PUBLIC_BIND = 'true';
      const cfg = runtimeConfig(tmpDir);
      assert.equal(cfg.host, '0.0.0.0');
      assert.equal(cfg.allowPublicBind, true);
    } finally {
      if (prevHost === undefined) delete process.env.ALOAPI_HOST;
      else process.env.ALOAPI_HOST = prevHost;
      if (prevPort === undefined) delete process.env.ALOAPI_PORT;
      else process.env.ALOAPI_PORT = prevPort;
      if (prevAllow === undefined) delete process.env.ALOAPI_ALLOW_PUBLIC_BIND;
      else process.env.ALOAPI_ALLOW_PUBLIC_BIND = prevAllow;
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('installer + outside-repo launcher opens dashboard on each start and supports no-open, logs, status, doctor, restart, stop', async t => {
  const port = await getFreePort();
  const fx = createFixtureProject(t, port);

  const env = {
    ...process.env,
    PATH: `${fx.binDir}:${process.env.PATH}`,
    ALOAPI_STATE_DIR: fx.stateDir,
    ALOAPI_SKIP_SHELL_RC: '1',
  };
  delete env.ALOAPI_ROOT;
  delete env.ALOAPI_HOST;
  delete env.ALOAPI_PORT;

  // 1. Install CLI into fx.binDir
  const installRes = spawnSync(path.join(fx.repoDir, 'scripts', 'install.sh'), ['--prefix', fx.binDir, '--no-npm-install'], {
    cwd: fx.repoDir,
    env,
    encoding: 'utf8',
  });
  assert.equal(installRes.status, 0, installRes.error?.message || installRes.stderr);
  assert.ok(installRes.stdout.includes(`ALOAPI v${FIXTURE_VERSION}`), installRes.stdout);
  assert.ok(installRes.stdout.includes('Run `aloapi` from any directory'), installRes.stdout);
  assert.equal(fs.existsSync(path.join(fx.stateDir, 'service.json')), false, 'installer started the service');
  assert.equal(fs.existsSync(fx.browserLog), false, `Installer unexpectedly opened browser: ${fs.existsSync(fx.browserLog) ? fs.readFileSync(fx.browserLog, 'utf8') : ''}`);
  assert.equal(fs.existsSync(path.join(fx.binDir, 'aloapi')), true);

  // 2. Run `aloapi` from OUTSIDE the repository (os.tmpdir())
  const outsideCwd = os.tmpdir();
  const versionRes = spawnSync('aloapi', ['--version'], { cwd: outsideCwd, env, encoding: 'utf8' });
  assert.equal(versionRes.status, 0, versionRes.stderr);
  assert.equal(versionRes.stdout.trim(), `aloapi v${FIXTURE_VERSION} (${fx.repoDir})`);
  const startRes = spawnSync('aloapi', [], { cwd: outsideCwd, env, encoding: 'utf8', timeout: 20_000 });
  assert.equal(startRes.status, 0, `${startRes.stdout}\n${startRes.stderr}`);
  assert.match(startRes.stdout, new RegExp(`http://localhost:${port}`));

  // Verify server stayed alive after launcher exited and health endpoint responds
  const pidRecord = JSON.parse(fs.readFileSync(path.join(fx.stateDir, 'service.json'), 'utf8'));
  assert.equal(isPidAlive(pidRecord.pid), true);
  const healthResp = await fetch(`http://localhost:${port}/api/health`);
  assert.equal(healthResp.status, 200);
  const healthJson = await healthResp.json();
  assert.equal(healthJson.service, 'aloapi');
  assert.equal(healthJson.status, 'ok');

  // Verify browser was opened exactly once with http://localhost:<port>
  await waitForBrowserCalls(fx.browserLog, 1);
  const firstBrowserCalls = fs.readFileSync(fx.browserLog, 'utf8').trim().split('\n');
  assert.equal(firstBrowserCalls.length, 1);
  assert.match(firstBrowserCalls[0], new RegExp(`http://localhost:${port}`));

  // 3. Running `aloapi` again reuses the service and opens the dashboard as requested
  const secondRes = spawnSync('aloapi', [], { cwd: outsideCwd, env, encoding: 'utf8', timeout: 10_000 });
  assert.equal(secondRes.status, 0, secondRes.stderr);
  assert.match(secondRes.stdout, /already running/i);
  const secondPidRecord = JSON.parse(fs.readFileSync(path.join(fx.stateDir, 'service.json'), 'utf8'));
  assert.equal(secondPidRecord.pid, pidRecord.pid);
  await waitForBrowserCalls(fx.browserLog, 2);
  assert.equal(fs.readFileSync(fx.browserLog, 'utf8').trim().split('\n').length, 2);

  // Explicitly suppress browser opening when desired.
  const noOpenRes = spawnSync('aloapi', ['start', '--no-open'], { cwd: outsideCwd, env, encoding: 'utf8', timeout: 10_000 });
  assert.equal(noOpenRes.status, 0, noOpenRes.stderr);
  assert.equal(fs.readFileSync(fx.browserLog, 'utf8').trim().split('\n').length, 2);

  // 4. `aloapi status --json`
  const statusRes = spawnSync('aloapi', ['status', '--json'], { cwd: outsideCwd, env, encoding: 'utf8' });
  assert.equal(statusRes.status, 0, statusRes.stderr);
  const statusJson = JSON.parse(statusRes.stdout);
  assert.equal(statusJson.running, true);
  assert.equal(statusJson.pid, pidRecord.pid);
  assert.equal(statusJson.dashboardUrl, `http://localhost:${port}`);

  // 5. `aloapi logs` and `aloapi doctor --json` (and ensure no secrets leaked)
  const logsRes = spawnSync('aloapi', ['logs', '-n', '20'], { cwd: outsideCwd, env, encoding: 'utf8' });
  assert.equal(logsRes.status, 0, logsRes.stderr);
  assert.match(logsRes.stdout, /Fixture server listening/);
  assert.equal(logsRes.stdout.includes('test-vault-key-must-be-at-least-32-bytes-long'), false);

  const doctorRes = spawnSync('aloapi', ['doctor', '--json'], { cwd: outsideCwd, env, encoding: 'utf8' });
  assert.equal(doctorRes.status, 0, doctorRes.stderr);
  assert.equal(doctorRes.stdout.includes('test-vault-key-must-be-at-least-32-bytes-long'), false);
  const doctorJson = JSON.parse(doctorRes.stdout);
  assert.equal(doctorJson.ok, true);

  // 6. `aloapi restart` replaces process cleanly and does not open duplicate tab
  const restartRes = spawnSync('aloapi', ['restart'], { cwd: outsideCwd, env, encoding: 'utf8', timeout: 20_000 });
  assert.equal(restartRes.status, 0, `${restartRes.stdout}\n${restartRes.stderr}`);
  const restartedRecord = JSON.parse(fs.readFileSync(path.join(fx.stateDir, 'service.json'), 'utf8'));
  assert.notEqual(restartedRecord.pid, pidRecord.pid);
  assert.equal(isPidAlive(pidRecord.pid), false);
  assert.equal(isPidAlive(restartedRecord.pid), true);
  assert.equal(fs.readFileSync(fx.browserLog, 'utf8').trim().split('\n').length, 2);

  // 7. `aloapi stop` stops only the managed ALOAPI process
  const stopRes = spawnSync('aloapi', ['stop'], { cwd: outsideCwd, env, encoding: 'utf8', timeout: 15_000 });
  assert.equal(stopRes.status, 0, stopRes.stderr);
  assert.equal(fs.existsSync(path.join(fx.stateDir, 'service.json')), false);
  assert.equal(isPidAlive(restartedRecord.pid), false);
});

test('launcher detects port conflict without terminating unrelated server and stop refuses mismatched PID', async t => {
  const port = await getFreePort();
  const fx = createFixtureProject(t, port);
  const env = {
    ...process.env,
    PATH: `${fx.binDir}:${process.env.PATH}`,
    ALOAPI_STATE_DIR: fx.stateDir,
    ALOAPI_ROOT: fx.repoDir,
  };
  delete env.ALOAPI_HOST;
  delete env.ALOAPI_PORT;

  // Start an unrelated server occupying the port
  const unrelatedServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('unrelated-service');
  });
  await new Promise(resolve => unrelatedServer.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => unrelatedServer.close(() => resolve())));

  const conflictRes = spawnSync(process.execPath, [path.join(fx.repoDir, 'scripts', 'aloapi.mjs'), 'start'], {
    cwd: os.tmpdir(),
    env,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.notEqual(conflictRes.status, 0);
  assert.match(conflictRes.stderr, /already in use by another process/i);

  // Unrelated server must still be alive and responding
  const check = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(await check.text(), 'unrelated-service');
  assert.equal(fs.existsSync(fx.browserLog), false);

  // Also test `stop` refuses to kill a live unrelated child process when PID file is stale/mismatched
  const bystander = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  t.after(() => { try { bystander.kill('SIGKILL'); } catch { /* ignore */ } });
  fs.writeFileSync(path.join(fx.stateDir, 'service.json'), JSON.stringify({
    pid: bystander.pid,
    port,
    host: '127.0.0.1',
    instanceId: 'stale-non-matching-id',
  }));

  const stopRes = spawnSync(process.execPath, [path.join(fx.repoDir, 'scripts', 'aloapi.mjs'), 'stop'], {
    cwd: os.tmpdir(),
    env,
    encoding: 'utf8',
  });
  assert.equal(stopRes.status, 0, stopRes.stderr);
  assert.equal(isPidAlive(bystander.pid), true, 'stop must never signal an unrelated process');
});

test('WSL2 environment triggers Windows browser integration and resolveProjectRoot detects repo from outside cwd', async t => {
  const { resolveProjectRoot, saveProjectRoot } = await cli;
  const port = await getFreePort();
  const fx = createFixtureProject(t, port);

  saveProjectRoot(fx.repoDir, fx.stateDir);
  const resolved = resolveProjectRoot({
    env: {},
    cwd: os.tmpdir(),
    moduleUrl: 'file:///nonexistent/bin/aloapi.mjs',
    stateDir: fx.stateDir,
  });
  assert.equal(resolved, fx.repoDir);
  assert.throws(() => resolveProjectRoot({ env: { ALOAPI_ROOT: os.tmpdir() }, cwd: os.tmpdir(), stateDir: fx.stateDir }), /not a valid ALOAPI/);

  const wslEnv = {
    ...process.env,
    PATH: `${fx.binDir}:${process.env.PATH}`,
    ALOAPI_STATE_DIR: fx.stateDir,
    ALOAPI_ROOT: fx.repoDir,
    WSL_DISTRO_NAME: 'Ubuntu-24.04',
  };
  delete wslEnv.ALOAPI_HOST;
  delete wslEnv.ALOAPI_PORT;

  const startRes = spawnSync(process.execPath, [path.join(fx.repoDir, 'scripts', 'aloapi.mjs')], {
    cwd: os.tmpdir(),
    env: wslEnv,
    encoding: 'utf8',
    timeout: 20_000,
  });
  assert.equal(startRes.status, 0, `${startRes.stdout}\n${startRes.stderr}`);
  const deadline = Date.now() + 2000;
  while (!fs.existsSync(fx.browserLog) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  const calls = fs.readFileSync(fx.browserLog, 'utf8').trim().split('\n');
  assert.equal(calls.length, 1);
  assert.match(calls[0], new RegExp(`^(wslview|cmd\\.exe)\\|.*http://localhost:${port}`));

  const stopRes = spawnSync(process.execPath, [path.join(fx.repoDir, 'scripts', 'aloapi.mjs'), 'stop'], {
    cwd: os.tmpdir(),
    env: wslEnv,
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(stopRes.status, 0, stopRes.stderr);
});

test('CLI diagnostics, import-validate, and help expose all operational commands cleanly', () => {
  const realRoot = path.resolve(__dirname, '..');
  const cliScript = path.join(realRoot, 'scripts', 'aloapi.mjs');

  const helpRes = spawnSync(process.execPath, [cliScript, '--help'], { cwd: realRoot, encoding: 'utf8' });
  assert.equal(helpRes.status, 0);
  for (const cmd of ['provider:doctor', 'oauth:doctor', 'vault:doctor', 'webhook:doctor', 'backup', 'restore', 'import-validate']) {
    assert.match(helpRes.stdout, new RegExp(cmd));
  }

  const provRes = spawnSync(process.execPath, [cliScript, 'provider:doctor', '--json'], { cwd: realRoot, encoding: 'utf8' });
  assert.equal(provRes.status, 0, provRes.stderr);
  assert.equal(JSON.parse(provRes.stdout).categoryFiles, 11);

  const oauthRes = spawnSync(process.execPath, [cliScript, 'oauth:doctor', '--json'], { cwd: realRoot, encoding: 'utf8' });
  assert.equal(oauthRes.status, 0, oauthRes.stderr);
  assert.equal(JSON.parse(oauthRes.stdout).ok, true);

  const whRes = spawnSync(process.execPath, [cliScript, 'webhook:doctor', '--json'], { cwd: realRoot, encoding: 'utf8' });
  assert.equal(whRes.status, 0, whRes.stderr);
  assert.equal(JSON.parse(whRes.stdout).ok, true);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-cli-imp-'));
  try {
    const validFile = path.join(tmpDir, 'valid-import.json');
    fs.writeFileSync(validFile, JSON.stringify({ schema: 'aloapi-client-import-v1', secretsIncluded: false, providers: [{ providerKey: 'sendgrid_api' }] }));
    const impOk = spawnSync(process.execPath, [cliScript, 'import-validate', validFile, '--json'], { cwd: realRoot, encoding: 'utf8' });
    assert.equal(impOk.status, 0, impOk.stderr);
    assert.equal(JSON.parse(impOk.stdout).ok, true);

    const badFile = path.join(tmpDir, 'bad-import.json');
    fs.writeFileSync(badFile, JSON.stringify({ schema: 'aloapi-client-import-v1', secretsIncluded: true, secret: 'whsec_aloapi_leak' }));
    const impBad = spawnSync(process.execPath, [cliScript, 'import-validate', badFile, '--json'], { cwd: realRoot, encoding: 'utf8' });
    assert.equal(impBad.status, 1);
    assert.equal(JSON.parse(impBad.stdout).ok, false);

    // Real SQLite backup & restore round-trip
    const dbDir = path.join(tmpDir, 'db');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'aloapi.db');
    const { DatabaseSync } = require('node:sqlite');
    const sdb = new DatabaseSync(dbPath);
    sdb.exec("CREATE TABLE t (id TEXT PRIMARY KEY, val TEXT); INSERT INTO t VALUES ('row1', 'preserved');");
    sdb.close();

    const backupOut = path.join(tmpDir, 'backup.db');
    const bkpRes = spawnSync(process.execPath, [cliScript, 'backup', backupOut, '--json'], {
      cwd: realRoot,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      encoding: 'utf8',
    });
    assert.equal(bkpRes.status, 0, bkpRes.stderr);
    assert.equal(JSON.parse(bkpRes.stdout).ok, true);
    assert.ok(fs.existsSync(backupOut));

    // Mutate DB then restore from backup
    const sdb2 = new DatabaseSync(dbPath);
    sdb2.exec('DELETE FROM t;');
    sdb2.close();
    const rstRes = spawnSync(process.execPath, [cliScript, 'restore', backupOut, '--yes', '--json'], {
      cwd: realRoot,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      encoding: 'utf8',
    });
    assert.equal(rstRes.status, 0, rstRes.stderr);
    assert.equal(JSON.parse(rstRes.stdout).ok, true);
    const sdb3 = new DatabaseSync(dbPath);
    const restoredRow = sdb3.prepare('SELECT val FROM t WHERE id = ?').get('row1');
    sdb3.close();
    assert.equal(restoredRow.val, 'preserved');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
