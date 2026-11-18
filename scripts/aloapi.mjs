#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync as fsReadSync,
  realpathSync,
  rmSync,
  statSync,
  watchFile,
  unwatchFile,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectExistingDatabase, inspectMigrationReadiness, sqliteFileFromDatabaseUrl } from './migrations.mjs';
import { NODE_RANGE, projectVersion, supportsNode } from './version.mjs';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 47831;

const SECRET_ENV_PATTERN = /(VAULT_KEY|PASSWORD|SECRET|TOKEN|PRIVATE_KEY)/i;

export function getStateDir() {
  return process.env.ALOAPI_STATE_DIR || path.join(homedir(), '.aloapi');
}

function getPidFile() {
  return path.join(getStateDir(), 'service.json');
}

function getLogFile() {
  return path.join(getStateDir(), 'aloapi.log');
}

function getProjectRootFile() {
  return path.join(getStateDir(), 'project-root');
}

export function isProjectRoot(dir) {
  if (!dir) return false;
  try {
    return (
      existsSync(path.join(dir, 'package.json')) &&
      existsSync(path.join(dir, 'scripts', 'aloapi.mjs')) &&
      existsSync(path.join(dir, 'prisma', 'schema.prisma'))
    );
  } catch {
    return false;
  }
}

export function resolveProjectRoot({
  env = process.env,
  cwd = process.cwd(),
  moduleUrl = import.meta.url,
  stateDir = getStateDir(),
} = {}) {
  if (env.ALOAPI_ROOT) {
    const explicit = path.resolve(env.ALOAPI_ROOT);
    if (!isProjectRoot(explicit)) {
      throw new Error(`ALOAPI_ROOT ("${explicit}") is not a valid ALOAPI repository root.`);
    }
    return explicit;
  }

  let cursor = path.resolve(cwd);
  while (true) {
    if (isProjectRoot(cursor)) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  try {
    const selfPath = realpathSync(fileURLToPath(moduleUrl));
    const candidate = path.resolve(path.dirname(selfPath), '..');
    if (isProjectRoot(candidate)) return candidate;
  } catch {
    /* ignore and try persisted project-root pointer */
  }

  const rootPointer = path.join(stateDir, 'project-root');
  if (existsSync(rootPointer)) {
    const saved = readFileSync(rootPointer, 'utf8').trim();
    if (saved && isProjectRoot(saved)) return saved;
  }

  throw new Error(
    'Could not locate the ALOAPI repository root. Run `./scripts/install.sh` from the repository directory or set ALOAPI_ROOT.'
  );
}

export function saveProjectRoot(root, stateDir = getStateDir()) {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  try { chmodSync(stateDir, 0o700); } catch { /* OS-managed ACL */ }
  const file = path.join(stateDir, 'project-root');
  writeFileSync(file, `${path.resolve(root)}\n`, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* OS-managed ACL */ }
}

export function parsePort(value, fallback = DEFAULT_PORT) {
  if (value === undefined || value === null || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('ALOAPI_PORT must be an integer from 1024 to 65535.');
  }
  return port;
}

export function isLoopbackHost(host) {
  return ['127.0.0.1', 'localhost', '::1'].includes(String(host).toLowerCase());
}

export function parseEnvFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

export function isWsl({ env = process.env, platform = process.platform, procVersion = null } = {}) {
  if (platform !== 'linux') return false;
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return true;
  if (procVersion !== null) return /microsoft|wsl/i.test(procVersion);
  try {
    return /microsoft|wsl/i.test(readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

export function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function resolveWindowsInteropCommand(name, windowsSubpath) {
  if (commandExists(name)) return name;
  const fullPath = `/mnt/c/Windows/System32/${windowsSubpath}`;
  return existsSync(fullPath) ? fullPath : null;
}

export function browserCandidates(platform, url, options = {}) {
  if (platform === 'win32') {
    return [{ command: 'cmd.exe', args: ['/c', 'start', '', url], shell: true }];
  }
  if (platform === 'darwin') {
    return [{ command: 'open', args: [url], shell: false }];
  }
  const wsl = options.wsl !== undefined
    ? Boolean(options.wsl)
    : (platform === process.platform && isWsl());
  if (wsl) {
    const hasCmd = options.hasCommand ?? commandExists;
    const candidates = [];
    const wslviewCmd = options.wslviewPath ?? (hasCmd('wslview') ? 'wslview' : null);
    if (wslviewCmd) candidates.push({ command: wslviewCmd, args: [url], shell: false });
    const cmdExe = options.cmdExePath ?? resolveWindowsInteropCommand('cmd.exe', 'cmd.exe');
    if (cmdExe || options.wsl === true) {
      candidates.push({ command: cmdExe || 'cmd.exe', args: ['/c', 'start', '', url], shell: false });
    }
    const psExe = options.powershellPath ?? resolveWindowsInteropCommand('powershell.exe', 'WindowsPowerShell/v1.0/powershell.exe');
    if (psExe || options.wsl === true) {
      candidates.push({
        command: psExe || 'powershell.exe',
        args: ['-NoProfile', '-Command', `Start-Process '${url.replace(/'/g, "''")}'`],
        shell: false,
      });
    }
    candidates.push({ command: 'xdg-open', args: [url], shell: false });
    return candidates;
  }
  return [{ command: 'xdg-open', args: [url], shell: false }];
}

export function browserInvocation(platform, url, options = {}) {
  const [first] = browserCandidates(platform, url, options);
  return { command: first.command, args: first.args };
}

export function serviceUrl(port = DEFAULT_PORT, host = DEFAULT_HOST) {
  const displayHost = host === '::1' ? '[::1]' : host;
  return `http://${displayHost}:${port}`;
}

export function dashboardUrl(port = DEFAULT_PORT, host = DEFAULT_HOST) {
  const normalized = String(host).toLowerCase();
  if (normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '0.0.0.0') {
    return `http://localhost:${port}`;
  }
  if (normalized === '::1' || normalized === '::') {
    return `http://[::1]:${port}`;
  }
  return `http://${host}:${port}`;
}

function healthProbeUrls(port = DEFAULT_PORT, host = DEFAULT_HOST) {
  const normalized = String(host).toLowerCase();
  if (normalized === '0.0.0.0') return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  if (normalized === '::') return [`http://[::1]:${port}`, `http://localhost:${port}`];
  if (normalized === 'localhost') return [`http://127.0.0.1:${port}`, `http://[::1]:${port}`];
  return [serviceUrl(port, host)];
}

function loadLocalEnv(root) {
  const envFile = path.join(root, '.env');
  if (!existsSync(envFile)) return;
  const values = parseEnvFile(readFileSync(envFile, 'utf8'));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Quote a value for the simple .env parser used by loadLocalEnv(). */
function envFileValue(value) {
  const text = String(value);
  if (/[\r\n]/.test(text)) throw new Error('Bootstrap values must not contain newlines.');
  const quote = text.includes('"') ? "'" : '"';
  if (text.includes(quote)) throw new Error('Bootstrap values must not contain both single and double quotes.');
  return `${quote}${text}${quote}`;
}

function writeInitialEnv(root) {
  const envFile = path.join(root, '.env');
  if (existsSync(envFile)) return null;
  // Honour operator-supplied bootstrap identity and vault key. Otherwise the CLI
  // would print random credentials that an environment override makes unusable.
  const username = (process.env.ADMIN_BOOTSTRAP_USERNAME || '').trim() || 'aloapi-admin';
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || randomBytes(24).toString('base64url');
  const vaultKey = process.env.ALOAPI_VAULT_KEY || randomBytes(32).toString('base64url');
  const credentialsFromEnv = Boolean(process.env.ADMIN_BOOTSTRAP_USERNAME || process.env.ADMIN_BOOTSTRAP_PASSWORD);
  const vaultKeyFromEnv = Boolean(process.env.ALOAPI_VAULT_KEY);
  const lines = [
    '# Generated by ALOAPI CLI. Keep this file private and out of Git.',
    'DATABASE_URL="file:./db/custom.db"',
    `ALOAPI_HOST="${DEFAULT_HOST}"`,
    `ALOAPI_PORT="${DEFAULT_PORT}"`,
    `ALOAPI_BASE_URL="http://localhost:${DEFAULT_PORT}"`,
    `ALOAPI_VAULT_KEY=${envFileValue(vaultKey)}`,
    `ADMIN_BOOTSTRAP_USERNAME=${envFileValue(username)}`,
    `ADMIN_BOOTSTRAP_PASSWORD=${envFileValue(password)}`,
    'ALOAPI_REQUIRE_ADMIN_MFA="false"',
    'ALOAPI_TRUST_PROXY="false"',
    'ALOAPI_PUBLIC_WEBHOOK_BASE_URL=""',
    '',
  ];
  writeFileSync(envFile, lines.join('\n'), { flag: 'wx', mode: 0o600 });
  try { chmodSync(envFile, 0o600); } catch { /* Windows ACLs are managed by the OS. */ }
  return { username, password, envFile, credentialsFromEnv, vaultKeyFromEnv };
}

export function runtimeConfig(root) {
  loadLocalEnv(root);
  const host = process.env.ALOAPI_HOST || DEFAULT_HOST;
  const allowPublicBind = process.env.ALOAPI_ALLOW_PUBLIC_BIND === 'true';
  if (!isLoopbackHost(host) && !allowPublicBind) {
    throw new Error(
      'ALOAPI_HOST must be loopback-only (127.0.0.1, localhost, or ::1). Set ALOAPI_ALLOW_PUBLIC_BIND="true" explicitly only behind a TLS-terminating reverse proxy with authentication.'
    );
  }
  const port = parsePort(process.env.ALOAPI_PORT, DEFAULT_PORT);
  const url = serviceUrl(port, host);
  const browserUrl = dashboardUrl(port, host);
  const probeUrls = healthProbeUrls(port, host);
  return {
    root,
    host,
    port,
    url,
    dashboardUrl: browserUrl,
    probeUrls,
    allowPublicBind,
    instanceId: process.env.ALOAPI_INSTANCE_ID || randomBytes(16).toString('hex'),
  };
}

function requireVaultKey() {
  if (!process.env.ALOAPI_VAULT_KEY || Buffer.byteLength(process.env.ALOAPI_VAULT_KEY, 'utf8') < 32) {
    throw new Error('Set a stable ALOAPI_VAULT_KEY of at least 32 UTF-8 bytes before startup; no database migration was attempted.');
  }
}

function ensureStateDir() {
  const dir = getStateDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* Windows ACLs are managed by the OS. */ }
}

export function redactSecrets(text, env = process.env) {
  let output = String(text ?? '');
  for (const [key, value] of Object.entries(env)) {
    if (value && value.length >= 8 && SECRET_ENV_PATTERN.test(key)) {
      output = output.split(value).join(`[REDACTED:${key}]`);
    }
  }
  return output;
}

export async function requestHealth(url, timeoutMs = 1200) {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    const body = await response.json().catch(() => null);
    return body?.service === 'aloapi' ? body : null;
  } catch {
    return null;
  }
}

async function probeAloapiHealth(probeUrls, timeoutMs = 1200) {
  for (const url of probeUrls) {
    const health = await requestHealth(url, timeoutMs);
    if (health) return { url, health };
  }
  return null;
}

function checkBindFree(port, host) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();
    server.once('error', error => {
      if (error && (error.code === 'EADDRINUSE' || error.code === 'EACCES')) {
        resolve({ free: false, code: error.code });
      } else {
        resolve({ free: true, code: error?.code ?? null });
      }
    });
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve({ free: true, code: null }));
    });
  });
}

function checkTcpConnect(port, host, timeoutMs = 400) {
  return new Promise(resolve => {
    const socket = net.createConnection({ port, host });
    const done = connected => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

export async function isPortOccupied(port, host = DEFAULT_HOST) {
  const bindHost = host === 'localhost' ? '127.0.0.1' : host;
  const bind = await checkBindFree(port, bindHost);
  if (!bind.free) return true;
  if (await checkTcpConnect(port, bindHost)) return true;
  if (String(host).toLowerCase() === 'localhost') {
    const ipv6Bind = await checkBindFree(port, '::1');
    if (!ipv6Bind.free) return true;
    if (await checkTcpConnect(port, '::1')) return true;
  }
  return false;
}

function inspectPortListener(port) {
  if (process.platform === 'win32') return null;
  if (commandExists('lsof')) {
    const res = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8', timeout: 1500 });
    if (res.status === 0 && res.stdout.trim()) {
      const lines = res.stdout.trim().split('\n');
      return lines.slice(0, 3).join('\n');
    }
  }
  if (commandExists('ss')) {
    const res = spawnSync('ss', ['-ltnp', `sport = :${port}`], { encoding: 'utf8', timeout: 1500 });
    if (res.status === 0 && res.stdout.trim()) {
      const lines = res.stdout.trim().split('\n');
      return lines.slice(0, 3).join('\n');
    }
  }
  return null;
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function readProcessArgs(pid) {
  if (process.platform === 'win32') return null;
  const res = spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8', timeout: 1500 });
  if (res.status !== 0) return null;
  return res.stdout.trim() || null;
}

function isLikelyAloapiProcess(pid, root) {
  const cmdline = readProcessArgs(pid);
  if (!cmdline) return false;
  return (
    cmdline.includes(path.join(root, '.next', 'standalone', 'server.js')) ||
    cmdline.includes(path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')) ||
    cmdline.includes('aloapi')
  );
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runCommand(root, command, args, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
}

function newestMtimeMs(targetPath) {
  if (!existsSync(targetPath)) return 0;
  const stat = statSync(targetPath);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let max = stat.mtimeMs;
  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    const childMax = newestMtimeMs(path.join(targetPath, entry.name));
    if (childMax > max) max = childMax;
  }
  return max;
}

function needsProductionBuild(root, forceRebuild) {
  if (forceRebuild) return true;
  const standaloneServer = path.join(root, '.next', 'standalone', 'server.js');
  const buildIdFile = path.join(root, '.next', 'BUILD_ID');
  if (!existsSync(standaloneServer) || !existsSync(buildIdFile)) return true;
  const buildTime = statSync(buildIdFile).mtimeMs;
  const watchPaths = [
    path.join(root, 'package.json'),
    path.join(root, 'next.config.ts'),
    path.join(root, 'prisma', 'schema.prisma'),
    path.join(root, 'src'),
  ];
  return watchPaths.some(p => newestMtimeMs(p) > buildTime);
}

function resolvedDatabaseUrlForChild(root, rawUrl) {
  if (!rawUrl || !rawUrl.startsWith('file:')) return rawUrl;
  try {
    const absoluteFile = sqliteFileFromDatabaseUrl(rawUrl, path.join(root, 'prisma'));
    return `file:${absoluteFile}`;
  } catch {
    return rawUrl;
  }
}

function readLogTail(logFile, lines = 40) {
  if (!existsSync(logFile)) return '';
  const content = readFileSync(logFile, 'utf8');
  const split = content.trimEnd().split(/\r?\n/);
  return split.slice(-lines).join('\n');
}

function runServerForeground(dev, config) {
  const nextBin = path.join(config.root, 'node_modules', 'next', 'dist', 'bin', 'next');
  const standaloneServer = path.join(config.root, '.next', 'standalone', 'server.js');
  const args = dev
    ? [nextBin, 'dev', '--hostname', config.host, '--port', String(config.port)]
    : [standaloneServer];
  if (!dev && !existsSync(standaloneServer)) {
    throw new Error('Production build not found. Run `aloapi start` or `npm run build` first.');
  }
  const child = spawn(process.execPath, args, {
    cwd: config.root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: dev ? 'development' : 'production',
      HOSTNAME: config.host,
      PORT: String(config.port),
      ALOAPI_INSTANCE_ID: config.instanceId,
      ALOAPI_ROOT: config.root,
      DATABASE_URL: resolvedDatabaseUrlForChild(config.root, process.env.DATABASE_URL),
    },
  });
  const forwardSignal = signal => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  };
  const onInterrupt = () => forwardSignal('SIGINT');
  const onTerminate = () => forwardSignal('SIGTERM');
  child.on('error', error => {
    console.error(`ALOAPI server failed: ${error.message}`);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
    process.exitCode = signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : code ?? 1;
  });
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
}

export function openBrowser(url, platform = process.platform, options = {}) {
  const candidates = browserCandidates(platform, url, options);
  const hasCmd = options.hasCommand ?? commandExists;
  const chosen = candidates.find(candidate => {
    if (candidate.command.startsWith('/')) return existsSync(candidate.command);
    if (platform === 'win32') return true;
    return hasCmd(candidate.command);
  }) || candidates[0];

  try {
    const child = spawn(chosen.command, chosen.args, {
      detached: true,
      stdio: 'ignore',
      shell: Boolean(chosen.shell),
    });
    child.on('error', error => {
      console.warn(`Could not open browser via ${chosen.command}: ${error.message}`);
      console.log(`Open ${url} in your browser.`);
    });
    child.unref();
    return { launched: true, command: chosen.command, args: chosen.args };
  } catch (error) {
    console.warn(`Could not open browser automatically: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`Open ${url} in your browser.`);
    return { launched: false, command: chosen.command, args: chosen.args };
  }
}

function readPidRecord() {
  const pidFile = getPidFile();
  if (!existsSync(pidFile)) return null;
  try {
    return JSON.parse(readFileSync(pidFile, 'utf8'));
  } catch {
    rmSync(pidFile, { force: true });
    return null;
  }
}

function writePidRecord(record) {
  const pidFile = getPidFile();
  writeFileSync(pidFile, JSON.stringify(record, null, 2), { mode: 0o600 });
  try { chmodSync(pidFile, 0o600); } catch { /* OS-managed ACL */ }
}

async function startBackground({ dev, noOpen, rebuild = false, foreground = false }) {
  const root = resolveProjectRoot();
  const created = writeInitialEnv(root);
  if (created) {
    console.log(`Created private local configuration at ${created.envFile}.`);
    console.log(`One-time administrator username: ${created.username}`);
    console.log(`One-time administrator password: ${created.password}`);
    if (created.credentialsFromEnv) console.log('These administrator credentials came from ADMIN_BOOTSTRAP_USERNAME/ADMIN_BOOTSTRAP_PASSWORD and were saved to .env for later launches.');
    if (created.vaultKeyFromEnv) console.log('The ALOAPI_VAULT_KEY came from the environment and was saved to .env; keep it stable while encrypted data exists.');
    console.log('Save these credentials now. Remove ADMIN_BOOTSTRAP_USERNAME and ADMIN_BOOTSTRAP_PASSWORD from .env after first login.');
  }

  const config = runtimeConfig(root);
  if (config.allowPublicBind) {
    console.warn(`WARNING: ALOAPI_ALLOW_PUBLIC_BIND=true is active; binding to ${config.host}:${config.port}. Ensure TLS and authentication are enforced.`);
  }
  requireVaultKey();
  ensureStateDir();
  saveProjectRoot(root);

  const already = await probeAloapiHealth(config.probeUrls);
  if (already) {
    const { health } = already;
    if (health.status !== 'ok') {
      throw new Error(
        `An ALOAPI service is already responding at ${config.dashboardUrl}, but its status is "${health.status}" (database: ${health.database ?? 'unavailable'}). No duplicate was started. Check \`aloapi logs\` or run \`aloapi stop\`.`
      );
    }
    const record = readPidRecord();
    const pidDetail = record?.instanceId === health.instanceId && record?.pid ? ` (PID ${record.pid})` : '';
    console.log(`ALOAPI is already running at ${config.dashboardUrl}${pidDetail} (database: ${health.database ?? 'unknown'}).`);
    if (!noOpen) {
      openBrowser(config.dashboardUrl);
    }
    return { alreadyRunning: true, url: config.dashboardUrl };
  }

  if (await isPortOccupied(config.port, config.host)) {
    const listener = inspectPortListener(config.port);
    const detail = listener ? `\nPort listener:\n${listener}` : '';
    throw new Error(
      `Port ${config.port} on ${config.host} is already in use by another process (not ALOAPI). Existing unrelated processes were not terminated.\nFree port ${config.port} or set ALOAPI_PORT in ${path.join(root, '.env')}.${detail}`
    );
  }

  const existingRecord = readPidRecord();
  if (existingRecord && Number.isInteger(existingRecord.pid)) {
    if (isPidAlive(existingRecord.pid) && isLikelyAloapiProcess(existingRecord.pid, root)) {
      throw new Error(
        `A previous ALOAPI process (PID ${existingRecord.pid}) is still running or starting up; inspect ${getLogFile()} or run \`aloapi stop\`.`
      );
    }
    rmSync(getPidFile(), { force: true });
  }

  const migrationDir = path.join(root, 'prisma', 'migrations');
  const lockFile = path.join(migrationDir, 'migration_lock.toml');
  if (!existsSync(lockFile) || !readFileSync(lockFile, 'utf8').includes('provider = "sqlite"')) {
    throw new Error('Reviewed SQLite migrations are missing. No database mutation was attempted; do not use db push on existing data.');
  }

  const databasePath = sqliteFileFromDatabaseUrl(process.env.DATABASE_URL || '', path.join(root, 'prisma'));
  const migrationReadiness = inspectMigrationReadiness(databasePath);
  if (!migrationReadiness.ok) {
    throw new Error(`Refusing automatic database migration: ${migrationReadiness.reason}. No migration command was run.`);
  }
  mkdirSync(path.dirname(databasePath), { recursive: true });

  try {
    runCommand(root, npmCommand(), ['run', 'db:migrate:deploy'], 'Database migration');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (existsSync(databasePath)) {
      const baseline = inspectExistingDatabase(databasePath);
      if (baseline.ok) {
        throw new Error(
          `${detail} The read-only comparison matches the original baseline. Back up first, then run \`aloapi baseline-existing\` to record the verified baseline and apply only reviewed additive migrations.`
        );
      }
    }
    throw new Error(`${detail} Verify SQLite permissions and Prisma schema/engine availability.`);
  }

  runCommand(root, npmCommand(), ['run', 'db:generate'], 'Prisma Client generation');
  runCommand(root, npmCommand(), ['run', 'vault:migrate:credentials'], 'Encrypted credential migration');

  if (!dev && needsProductionBuild(root, rebuild)) {
    runCommand(root, npmCommand(), ['run', 'build'], 'Production build');
  }

  if (foreground) {
    runServerForeground(dev, config);
    return { foreground: true, url: config.dashboardUrl };
  }

  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  const standaloneServer = path.join(root, '.next', 'standalone', 'server.js');
  const args = dev
    ? [nextBin, 'dev', '--hostname', config.host, '--port', String(config.port)]
    : [standaloneServer];
  if (!dev && !existsSync(standaloneServer)) {
    throw new Error('Production server build is missing after `npm run build`.');
  }
  if (dev && !existsSync(nextBin)) {
    throw new Error('Next.js binary not found in node_modules. Run `npm ci` first.');
  }

  const logFile = getLogFile();
  const logFd = openSync(logFile, 'a', 0o600);
  const child = spawn(process.execPath, args, {
    cwd: root,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: {
      ...process.env,
      NODE_ENV: dev ? 'development' : 'production',
      HOSTNAME: config.host,
      PORT: String(config.port),
      ALOAPI_INSTANCE_ID: config.instanceId,
      ALOAPI_ROOT: config.root,
      DATABASE_URL: resolvedDatabaseUrlForChild(root, process.env.DATABASE_URL),
    },
  });
  closeSync(logFd);

  let childExited = false;
  let childExitCode = null;
  let childExitSignal = null;
  let childError = null;
  child.on('error', err => {
    childExited = true;
    childError = err;
  });
  child.on('exit', (code, signal) => {
    childExited = true;
    childExitCode = code;
    childExitSignal = signal;
  });
  child.unref();

  const pidRecord = {
    pid: child.pid,
    port: config.port,
    host: config.host,
    url: config.url,
    dashboardUrl: config.dashboardUrl,
    instanceId: config.instanceId,
    startedAt: new Date().toISOString(),
    dev,
    root,
    browserOpened: false,
  };
  writePidRecord(pidRecord);

  const waitTimeoutMs = dev ? 90_000 : 45_000;
  const deadline = Date.now() + waitTimeoutMs;
  let healthyResult = null;

  while (Date.now() < deadline) {
    if (childExited) break;
    const probed = await probeAloapiHealth(config.probeUrls, 1000);
    if (probed?.health?.instanceId === config.instanceId && probed.health.status === 'ok') {
      healthyResult = probed;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  if (!healthyResult) {
    if (!childExited && isPidAlive(child.pid)) {
      try { process.kill(child.pid, 'SIGTERM'); } catch { /* already exited */ }
    }
    rmSync(getPidFile(), { force: true });
    const tail = redactSecrets(readLogTail(logFile, 25));
    const exitDetail = childError
      ? `Spawn error: ${childError.message}`
      : childExited
        ? `Server exited prematurely (code=${childExitCode ?? 'null'}, signal=${childExitSignal ?? 'null'}).`
        : `Timed out after ${Math.round(waitTimeoutMs / 1000)}s waiting for /api/health on ${config.url}.`;
    const logHint = tail ? `\nRecent log output (${logFile}):\n${tail}` : `\nSee log file: ${logFile}`;
    throw new Error(`ALOAPI failed to start. ${exitDetail}${logHint}`);
  }

  console.log(`ALOAPI ${dev ? 'development service' : 'service'} is ready at ${config.dashboardUrl}`);
  console.log(`Bound address: ${config.url} (PID ${child.pid})`);
  console.log(`Service log: ${logFile}`);

  if (!noOpen) {
    openBrowser(config.dashboardUrl);
    pidRecord.browserOpened = true;
    writePidRecord(pidRecord);
  }

  return { alreadyRunning: false, url: config.dashboardUrl, pid: child.pid };
}

async function stopService() {
  const root = resolveProjectRoot();
  const config = runtimeConfig(root);
  const pidFile = getPidFile();
  const record = readPidRecord();

  if (!record) {
    const unmanaged = await probeAloapiHealth(config.probeUrls);
    if (unmanaged) {
      throw new Error(
        `An unmanaged ALOAPI instance is responding at ${config.dashboardUrl} (no PID file at ${pidFile}). Stop that process manually; \`aloapi stop\` never guesses or kills untracked PIDs.`
      );
    }
    console.log('ALOAPI is not running.');
    return { stopped: false, reason: 'not_running' };
  }

  if (!Number.isInteger(record.pid) || !record.instanceId) {
    rmSync(pidFile, { force: true });
    console.log('Removed an incomplete stale PID file; no process was stopped.');
    return { stopped: false, reason: 'stale_pid_file' };
  }

  const port = parsePort(record.port, DEFAULT_PORT);
  const host = record.host || DEFAULT_HOST;
  const probeUrls = healthProbeUrls(port, host);
  const probed = await probeAloapiHealth(probeUrls);

  if (!probed) {
    if (!isPidAlive(record.pid)) {
      rmSync(pidFile, { force: true });
      console.log('ALOAPI process had already exited; removed stale PID file.');
      return { stopped: false, reason: 'already_exited' };
    }
    if (!isLikelyAloapiProcess(record.pid, record.root || root)) {
      rmSync(pidFile, { force: true });
      console.log(`PID ${record.pid} is no longer an ALOAPI service; removed stale PID file without signalling an unrelated process.`);
      return { stopped: false, reason: 'pid_reused' };
    }
  } else if (probed.health.instanceId !== record.instanceId) {
    rmSync(pidFile, { force: true });
    throw new Error(
      `Health check at ${probed.url} returned a different instanceId (${probed.health.instanceId ?? 'none'}). Refusing to stop PID ${record.pid}; removed stale PID file.`
    );
  }

  try {
    process.kill(record.pid, 'SIGTERM');
  } catch (error) {
    if (error?.code === 'ESRCH') {
      rmSync(pidFile, { force: true });
      console.log('ALOAPI process already exited; removed stale PID file.');
      return { stopped: true, pid: record.pid };
    }
    throw new Error(`Could not stop ALOAPI PID ${record.pid}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const alive = isPidAlive(record.pid);
    const stillHealthy = await probeAloapiHealth(probeUrls, 500);
    if (!alive && !stillHealthy) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  if (isPidAlive(record.pid) && (probed?.health?.instanceId === record.instanceId || isLikelyAloapiProcess(record.pid, record.root || root))) {
    try { process.kill(record.pid, 'SIGKILL'); } catch { /* ignore */ }
    const killDeadline = Date.now() + 2_000;
    while (Date.now() < killDeadline && isPidAlive(record.pid)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  rmSync(pidFile, { force: true });
  console.log(`ALOAPI stopped (PID ${record.pid}). The SQLite database and .env were not modified.`);
  return { stopped: true, pid: record.pid };
}

async function restartService(options) {
  const root = resolveProjectRoot();
  const config = runtimeConfig(root);
  const wasRunning = Boolean(await probeAloapiHealth(config.probeUrls)) || Boolean(readPidRecord());

  if (readPidRecord()) {
    await stopService();
  } else if (wasRunning) {
    throw new Error(
      `An unmanaged ALOAPI instance is running at ${config.dashboardUrl}. Stop it manually before running \`aloapi restart\`.`
    );
  }

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && (await isPortOccupied(config.port, config.host))) {
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  // Do not open a duplicate browser tab on restart unless --open was explicitly requested
  // or the service was not previously running.
  const noOpen = options.noOpen || (wasRunning && !options.open);
  return startBackground({
    dev: options.dev,
    noOpen,
    rebuild: options.rebuild,
    foreground: options.foreground,
  });
}

async function showStatus({ json = false } = {}) {
  const root = resolveProjectRoot();
  const config = runtimeConfig(root);
  const probed = await probeAloapiHealth(config.probeUrls);
  const record = readPidRecord();
  const logFile = getLogFile();

  if (!probed) {
    const portBusy = await isPortOccupied(config.port, config.host);
    const payload = {
      running: false,
      status: portBusy ? 'port_conflict' : 'stopped',
      dashboardUrl: config.dashboardUrl,
      bindUrl: config.url,
      portOccupiedByOther: portBusy,
      logFile,
      projectRoot: root,
    };
    if (json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    if (portBusy) {
      console.log(`ALOAPI is stopped, but port ${config.port} on ${config.host} is occupied by another process.`);
    } else {
      console.log(`ALOAPI is not running (${config.dashboardUrl}).`);
    }
    console.log(`Project root: ${root}`);
    console.log(`Log file: ${logFile}`);
    return;
  }

  const { health } = probed;
  const managed = Boolean(record && record.instanceId === health.instanceId);
  const payload = {
    running: true,
    status: health.status ?? 'unknown',
    database: health.database ?? 'unknown',
    dashboardUrl: config.dashboardUrl,
    bindUrl: config.url,
    instanceId: health.instanceId ?? null,
    managed,
    pid: managed ? record.pid : null,
    mode: managed ? (record.dev ? 'development' : 'production') : 'unmanaged',
    startedAt: managed ? record.startedAt : null,
    logFile,
    projectRoot: root,
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`ALOAPI is running at ${config.dashboardUrl}`);
  console.log(`  Status:       ${payload.status}`);
  console.log(`  Database:     ${payload.database}`);
  console.log(`  Bind address: ${payload.bindUrl}`);
  console.log(`  Mode:         ${payload.mode}`);
  if (managed) {
    console.log(`  Managed PID:  ${record.pid} (started ${record.startedAt})`);
  } else {
    console.log(`  Instance:     ${health.instanceId ?? 'unmanaged'}`);
  }
  console.log(`  Log file:     ${logFile}`);
}

async function showLogs({ lines = 100, follow = false, pathOnly = false } = {}) {
  const logFile = getLogFile();
  if (pathOnly) {
    console.log(logFile);
    return;
  }
  if (!existsSync(logFile)) {
    console.log(`No ALOAPI log file found yet at ${logFile}. Start the service with \`aloapi\` first.`);
    return;
  }
  const tail = redactSecrets(readLogTail(logFile, lines));
  if (tail) console.log(tail);
  else console.log(`Log file ${logFile} is currently empty.`);

  if (!follow) return;

  let offset = statSync(logFile).size;
  console.log(`--- Following ${logFile} (Ctrl+C to stop) ---`);
  await new Promise(resolve => {
    const readNewBytes = () => {
      try {
        const size = statSync(logFile).size;
        if (size < offset) offset = 0;
        if (size > offset) {
          const fd = openSync(logFile, 'r');
          try {
            const length = size - offset;
            const buffer = Buffer.alloc(length);
            fsReadSync(fd, buffer, 0, length, offset);
            offset = size;
            process.stdout.write(redactSecrets(buffer.toString('utf8')));
          } finally {
            closeSync(fd);
          }
        }
      } catch {
        /* file rotated or removed */
      }
    };
    watchFile(logFile, { interval: 400 }, readNewBytes);
    const stop = () => {
      unwatchFile(logFile, readNewBytes);
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}

async function runDoctor({ json = false } = {}) {
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });

  // 1. Node.js version
  add('node_version', supportsNode(process.versions.node) ? 'pass' : 'fail', `Node.js ${process.version} (requires ${NODE_RANGE})`);

  // 2. Project root
  let root = null;
  try {
    root = resolveProjectRoot();
    add('project_root', 'pass', root);
  } catch (error) {
    add('project_root', 'fail', error instanceof Error ? error.message : String(error));
  }

  // 3. PATH / CLI registration
  const cliInPath = commandExists('aloapi');
  add('cli_in_path', cliInPath ? 'pass' : 'warn', cliInPath ? 'aloapi executable found in PATH' : 'aloapi not found in PATH; run ./scripts/install.sh');

  // 4. Platform & browser launcher
  const wsl = isWsl();
  const candidates = browserCandidates(process.platform, `http://localhost:${DEFAULT_PORT}`, { wsl });
  const availableBrowser = candidates.find(c => (c.command.startsWith('/') ? existsSync(c.command) : commandExists(c.command)));
  add(
    'browser_launcher',
    availableBrowser ? 'pass' : 'warn',
    availableBrowser
      ? `${process.platform}${wsl ? ' (WSL2)' : ''}: ${availableBrowser.command}`
      : `${process.platform}${wsl ? ' (WSL2)' : ''}: no automatic browser launcher found (${candidates.map(c => c.command).join(', ')})`
  );

  // 5. State directory permissions
  const stateDir = getStateDir();
  if (existsSync(stateDir)) {
    const mode = statSync(stateDir).mode & 0o777;
    add('state_dir', (mode & 0o077) === 0 ? 'pass' : 'warn', `${stateDir} (mode ${mode.toString(8)})`);
  } else {
    add('state_dir', 'pass', `${stateDir} (will be created on first start)`);
  }

  if (root) {
    // 6. Dependencies & build
    const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
    add('dependencies', existsSync(nextBin) ? 'pass' : 'fail', existsSync(nextBin) ? 'node_modules installed' : 'node_modules missing; run npm ci');

    const prismaDefault = path.join(root, 'node_modules', '.prisma', 'client', 'default.js');
    const prismaInitialized = existsSync(prismaDefault) && !readFileSync(prismaDefault, 'utf8').includes('did not initialize yet');
    add('prisma_client', prismaInitialized ? 'pass' : 'warn', prismaInitialized ? 'Prisma Client generated' : 'Prisma Client not generated yet (runs during `aloapi start` via `npm run db:generate`)');

    const standalone = path.join(root, '.next', 'standalone', 'server.js');
    add('production_build', existsSync(standalone) ? 'pass' : 'warn', existsSync(standalone) ? 'Standalone build present' : 'Standalone build not present yet (will be built on `aloapi start`, or use `--dev`)');

    // 7. Env & Security configuration (never print secrets!)
    const envFile = path.join(root, '.env');
    if (existsSync(envFile)) {
      const mode = statSync(envFile).mode & 0o777;
      add('env_file', (mode & 0o077) === 0 ? 'pass' : 'warn', `${envFile} exists (mode ${mode.toString(8)})`);
    } else {
      add('env_file', 'warn', `${envFile} not created yet (created automatically on first \`aloapi\` or \`aloapi setup\`)`);
    }

    let config;
    try {
      config = runtimeConfig(root);
      add('network_binding', isLoopbackHost(config.host) ? 'pass' : 'warn', `Bound host ${config.host}:${config.port}, dashboard ${config.dashboardUrl}`);

      const hasVaultKey = Boolean(process.env.ALOAPI_VAULT_KEY && Buffer.byteLength(process.env.ALOAPI_VAULT_KEY, 'utf8') >= 32);
      add(
        'vault_key',
        existsSync(envFile) ? (hasVaultKey ? 'pass' : 'fail') : 'pass',
        existsSync(envFile)
          ? (hasVaultKey ? 'Configured (>= 32 bytes, value redacted)' : 'Missing or < 32 bytes in .env')
          : 'Will be generated automatically on first `aloapi` / `aloapi setup`'
      );

      if (process.env.ADMIN_BOOTSTRAP_USERNAME || process.env.ADMIN_BOOTSTRAP_PASSWORD) {
        add('bootstrap_credentials', 'warn', 'ADMIN_BOOTSTRAP_* still present in .env; remove after first admin login');
      }

      // 8. Database migration readiness (strictly read-only)
      const dbUrl = process.env.DATABASE_URL || 'file:./db/custom.db';
      try {
        const dbPath = sqliteFileFromDatabaseUrl(dbUrl, path.join(root, 'prisma'));
        const readiness = inspectMigrationReadiness(dbPath);
        add('database_migrations', readiness.ok ? 'pass' : 'fail', `${readiness.kind}: ${readiness.reason}`);
      } catch (error) {
        add('database_migrations', 'fail', error instanceof Error ? error.message : String(error));
      }

      // 9. Port & running service check
      const probed = await probeAloapiHealth(config.probeUrls);
      if (probed) {
        add('service_port', probed.health.status === 'ok' ? 'pass' : 'warn', `ALOAPI responding at ${config.dashboardUrl} (status: ${probed.health.status}, db: ${probed.health.database})`);
      } else {
        const busy = await isPortOccupied(config.port, config.host);
        add('service_port', busy ? 'fail' : 'pass', busy ? `Port ${config.port} occupied by unrelated process` : `Port ${config.port} is available`);
      }
    } catch (error) {
      add('runtime_config', 'fail', error instanceof Error ? error.message : String(error));
    }
  }

  const failures = checks.filter(c => c.status === 'fail').length;
  const warnings = checks.filter(c => c.status === 'warn').length;

  if (json) {
    console.log(JSON.stringify({ ok: failures === 0, failures, warnings, checks }, null, 2));
  } else {
    console.log('ALOAPI Doctor');
    console.log('=============');
    for (const check of checks) {
      const tag = check.status === 'pass' ? '[OK]  ' : check.status === 'warn' ? '[WARN]' : '[FAIL]';
      console.log(`${tag} ${check.name}: ${check.detail}`);
    }
    console.log(`\nSummary: ${checks.length - failures - warnings} passed, ${warnings} warning(s), ${failures} failure(s).`);
  }

  if (failures > 0) process.exitCode = 1;
}

function baselineExisting() {
  const root = resolveProjectRoot();
  loadLocalEnv(root);
  const databasePath = sqliteFileFromDatabaseUrl(process.env.DATABASE_URL || '', path.join(root, 'prisma'));
  const result = inspectExistingDatabase(databasePath);
  if (!result.ok) {
    throw new Error(`Refusing to baseline ${databasePath}: ${result.reason}. No data or schema was changed. Use a reviewed migration for any other schema.`);
  }
  const prismaEntry = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
  if (!existsSync(prismaEntry)) throw new Error('Local Prisma CLI is missing. Run npm ci before baselining.');
  console.log(`Verified existing SQLite schema: ${result.reason}.`);
  console.log('Recording the original schema as applied, then applying only the checked-in additive migrations. Existing rows are not rewritten.');
  // Ensure _prisma_migrations exists for Prisma WASM schema engine compatibility before resolve --applied.
  const sqlite = new DatabaseSync(databasePath);
  try {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );`);
  } finally {
    sqlite.close();
  }
  const resolveArgs = existsSync(path.join(root, 'prisma.config.ts'))
    ? [prismaEntry, 'migrate', 'resolve', '--applied', '20261115000000_baseline']
    : [prismaEntry, 'migrate', 'resolve', '--applied', '20261115000000_baseline', '--schema', 'prisma/schema.prisma'];
  runCommand(root, process.execPath, resolveArgs, 'Baseline verification');
  runCommand(root, npmCommand(), ['run', 'db:migrate:deploy'], 'Additive database migrations');
  console.log('Existing database safely baselined; additive migrations applied. No db push, reset, drop, or data deletion was used.');
}

function setup() {
  const root = resolveProjectRoot();
  ensureStateDir();
  saveProjectRoot(root);
  const created = writeInitialEnv(root);
  if (!created) {
    console.log(`${path.join(root, '.env')} already exists; it was left unchanged. Review ALOAPI_HOST/PORT and ALOAPI_VAULT_KEY yourself.`);
    return;
  }
  console.log(`Created private local configuration at ${created.envFile}.`);
  console.log(`One-time administrator username: ${created.username}`);
  console.log(`One-time administrator password: ${created.password}`);
  if (created.credentialsFromEnv) console.log('These administrator credentials came from ADMIN_BOOTSTRAP_USERNAME/ADMIN_BOOTSTRAP_PASSWORD and were saved to .env for later launches.');
  if (created.vaultKeyFromEnv) console.log('The ALOAPI_VAULT_KEY came from the environment and was saved to .env; keep it stable while encrypted data exists.');
  console.log(`The service binds only to loopback port ${DEFAULT_PORT} (${dashboardUrl(DEFAULT_PORT, DEFAULT_HOST)}); the generated vault key is stored in .env.`);
  console.log('Keep .env backed up securely. Remove the bootstrap username/password after first login; never change the vault key while encrypted data exists.');
  console.log('Run `aloapi` or `aloapi start` to apply migrations, build, start the service, and open the browser.');
}

function resetAdminPassword(usernameArg = '') {
  const root = resolveProjectRoot();
  loadLocalEnv(root);
  const databaseUrl = process.env.DATABASE_URL || 'file:./db/custom.db';
  const databasePath = sqliteFileFromDatabaseUrl(databaseUrl, path.join(root, 'prisma'));
  if (!existsSync(databasePath)) throw new Error('ALOAPI database not found. Start ALOAPI once so migrations can run, then retry.');
  const sqlite = new DatabaseSync(databasePath);
  try {
    const tables = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name.toLowerCase()));
    if (!tables.has('adminuser') || !tables.has('portalsession')) throw new Error('Admin/session tables are missing. Run `aloapi` to apply migrations first.');
    const admins = usernameArg
      ? sqlite.prepare('SELECT id, username FROM "AdminUser" WHERE username = ? COLLATE NOCASE').all(usernameArg)
      : sqlite.prepare('SELECT id, username FROM "AdminUser" ORDER BY "createdAt"').all();
    if (admins.length === 0) throw new Error(usernameArg ? 'Administrator was not found.' : 'No administrator exists yet. Run `aloapi` once to create the bootstrap administrator.');
    if (admins.length > 1) throw new Error('More than one administrator exists. Specify the exact username: aloapi admin:reset-password <username>.');
    const admin = admins[0];
    const password = randomBytes(24).toString('base64url');
    const salt = randomBytes(16).toString('hex');
    const passwordHash = salt + ':' + scryptSync(password, salt, 64).toString('hex');
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const updated = sqlite.prepare('UPDATE "AdminUser" SET "passwordHash" = ? WHERE id = ?').run(passwordHash, admin.id);
      if (Number(updated.changes) !== 1) throw new Error('Administrator password was not updated; no credentials were issued.');
      sqlite.prepare('DELETE FROM "PortalSession" WHERE role = ? AND "adminId" = ?').run('admin', admin.id);
      sqlite.exec('COMMIT');
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    console.log('Administrator password reset successfully.');
    console.log('Administrator username: ' + admin.username);
    console.log('New one-time password: ' + password);
    console.log('Save it in your password manager. This password is shown only once; it is not written to logs or .env.');
    console.log('All existing administrator sessions have been revoked. Your database and ALOAPI_VAULT_KEY were left unchanged.');
  } finally { sqlite.close(); }
}

function showVersion() {
  const root = resolveProjectRoot();
  console.log(`aloapi v${projectVersion(root)} (${root})`);
}

function openSqliteReadonly(root) {
  loadLocalEnv(root);
  const dbUrl = process.env.DATABASE_URL || 'file:./db/custom.db';
  const dbPath = sqliteFileFromDatabaseUrl(dbUrl, path.join(root, 'prisma'));
  const readiness = inspectMigrationReadiness(dbPath);
  return { dbPath, readiness };
}

function querySqliteCountSafe(sqlite, tableName, whereClause = '') {
  try {
    const exists = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
    if (!exists) return 0;
    const row = sqlite.prepare(`SELECT COUNT(*) AS cnt FROM "${tableName}" ${whereClause}`).get();
    return Number(row?.cnt ?? 0);
  } catch {
    return 0;
  }
}

function runDbValidate({ json = false } = {}) {
  const root = resolveProjectRoot();
  const prismaEntry = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
  const validateRes = spawnSync(process.execPath, [prismaEntry, 'validate'], { cwd: root, encoding: 'utf8' });
  const { dbPath, readiness } = openSqliteReadonly(root);
  const ok = validateRes.status === 0 && readiness.ok;
  const payload = { ok, schemaValid: validateRes.status === 0, databasePath: dbPath, readiness };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.log(`Schema valid: ${payload.schemaValid} | DB readiness (${readiness.kind}): ${readiness.reason}`);
  if (!ok) process.exitCode = 1;
}

function runMigrationStatus({ json = false } = {}) {
  const root = resolveProjectRoot();
  const { dbPath, readiness } = openSqliteReadonly(root);
  let applied = [];
  if (existsSync(dbPath)) {
    const sqlite = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const hasTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'").get();
      if (hasTable) {
        applied = sqlite.prepare('SELECT migration_name, finished_at, applied_steps_count FROM "_prisma_migrations" ORDER BY started_at ASC').all();
      }
    } finally {
      sqlite.close();
    }
  }
  const payload = { ok: readiness.ok, databasePath: dbPath, readiness, appliedMigrations: applied };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`Migration status (${readiness.kind}): ${readiness.reason}`);
    for (const m of applied) console.log(`  - ${m.migration_name} (${m.finished_at || 'pending'})`);
  }
  if (!readiness.ok) process.exitCode = 1;
}

function runSubDoctor(domain, { json = false } = {}) {
  const root = resolveProjectRoot();
  const { dbPath } = openSqliteReadonly(root);
  const sqlite = existsSync(dbPath) ? new DatabaseSync(dbPath, { readOnly: true }) : null;
  try {
    let report = {};
    if (domain === 'provider') {
      const catFiles = readdirSync(path.join(root, 'src', 'lib', 'intelligence', 'providers')).filter(f => /^cat\d+.*\.ts$/.test(f));
      report = {
        ok: catFiles.length === 11,
        categoryFiles: catFiles.length,
        integrationProjects: sqlite ? querySqliteCountSafe(sqlite, 'IntegrationProject') : 0,
        oauthAppsPrepared: sqlite ? querySqliteCountSafe(sqlite, 'OAuthAppRegistryEntry') : 0,
        credentialsPrepared: sqlite ? querySqliteCountSafe(sqlite, 'CredentialPreparationRecord') : 0,
      };
    } else if (domain === 'oauth') {
      report = {
        ok: true,
        pendingStates: sqlite ? querySqliteCountSafe(sqlite, 'OAuthAuthorizationState', "WHERE status='pending'") : 0,
        processingStates: sqlite ? querySqliteCountSafe(sqlite, 'OAuthAuthorizationState', "WHERE status='processing'") : 0,
        authorizedStates: sqlite ? querySqliteCountSafe(sqlite, 'OAuthAuthorizationState', "WHERE status='authorized'") : 0,
        expiredOrFailedStates: sqlite ? querySqliteCountSafe(sqlite, 'OAuthAuthorizationState', "WHERE status IN ('expired','failed','denied')") : 0,
      };
    } else if (domain === 'vault') {
      const configured = Boolean(process.env.ALOAPI_VAULT_KEY && Buffer.byteLength(process.env.ALOAPI_VAULT_KEY, 'utf8') >= 32);
      report = {
        ok: configured || !existsSync(path.join(root, '.env')),
        vaultKeyConfigured: configured,
        activeCredentials: sqlite ? querySqliteCountSafe(sqlite, 'VaultCredential', "WHERE status='active' AND revokedAt IS NULL") : 0,
        revokedCredentials: sqlite ? querySqliteCountSafe(sqlite, 'VaultCredential', 'WHERE revokedAt IS NOT NULL') : 0,
      };
    } else if (domain === 'webhook') {
      report = {
        ok: true,
        completedEvents: sqlite ? querySqliteCountSafe(sqlite, 'OmniEvent', "WHERE status='COMPLETED' AND source LIKE '%webhook%'") : 0,
        retryScheduledEvents: sqlite ? querySqliteCountSafe(sqlite, 'OmniEvent', "WHERE status='RETRY_SCHEDULED'") : 0,
        deadLetterEvents: sqlite ? querySqliteCountSafe(sqlite, 'OmniEvent', "WHERE status='DEAD_LETTER'") : 0,
      };
    }
    if (json) console.log(JSON.stringify(report, null, 2));
    else console.log(`${domain.toUpperCase()} Doctor:`, JSON.stringify(report));
    if (report.ok === false) process.exitCode = 1;
  } finally {
    sqlite?.close();
  }
}

function runBackup({ outPath, json = false } = {}) {
  const root = resolveProjectRoot();
  const { dbPath } = openSqliteReadonly(root);
  if (!existsSync(dbPath)) throw new Error(`Database file does not exist yet at ${dbPath}`);
  const backupsDir = path.join(root, 'backups');
  mkdirSync(backupsDir, { recursive: true, mode: 0o700 });
  const target = path.resolve(outPath || path.join(backupsDir, `aloapi-backup-${Date.now()}.db`));
  const sqlite = new DatabaseSync(dbPath);
  try {
    sqlite.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    sqlite.close();
  }
  chmodSync(target, 0o600);
  const payload = { ok: true, backupFile: target, bytes: statSync(target).size };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.log(`Created atomic SQLite backup: ${target} (${payload.bytes} bytes)`);
}

function runRestore({ filePath, json = false } = {}) {
  if (!filePath) throw new Error('Specify backup file via --file <path> or positional argument.');
  const root = resolveProjectRoot();
  const src = path.resolve(filePath);
  if (!existsSync(src)) throw new Error(`Backup file not found: ${src}`);
  const { dbPath } = openSqliteReadonly(root);
  const checkDb = new DatabaseSync(src, { readOnly: true });
  try {
    const integrity = checkDb.prepare('PRAGMA integrity_check').get();
    if (integrity?.integrity_check !== 'ok') throw new Error('Backup SQLite integrity check failed.');
  } finally {
    checkDb.close();
  }
  const destBackup = `${dbPath}.pre-restore-${Date.now()}.bak`;
  if (existsSync(dbPath)) writeFileSync(destBackup, readFileSync(dbPath), { mode: 0o600 });
  writeFileSync(dbPath, readFileSync(src), { mode: 0o600 });
  const payload = { ok: true, restoredTo: dbPath, preRestoreSnapshot: existsSync(destBackup) ? destBackup : null };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.log(`Restored verified SQLite backup to ${dbPath}`);
}

function runImportValidate({ filePath, json = false } = {}) {
  if (!filePath) throw new Error('Specify client-project-import.json path via --file <path> or positional argument.');
  const resolved = path.resolve(filePath);
  if (!existsSync(resolved)) throw new Error(`Import manifest not found: ${resolved}`);
  const raw = readFileSync(resolved, 'utf8');
  const data = JSON.parse(raw);
  const errors = [];
  if (data?.schema !== 'aloapi-client-import-v1') errors.push('Invalid schema (expected aloapi-client-import-v1).');
  if (data?.secretsIncluded !== false) errors.push('secretsIncluded must be false.');
  if (/"__proto__"|"constructor"|"prototype"/.test(raw)) errors.push('Forbidden prototype key detected.');
  if (/(whsec_aloapi_|jwt_aloapi_|BEGIN PRIVATE KEY|xoxb-|ghp_|sk_live_)/.test(raw)) errors.push('Embedded secret detected in import manifest.');
  const payload = { ok: errors.length === 0, file: resolved, providersCount: Array.isArray(data?.providers) ? data.providers.length : 0, errors };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.log(payload.ok ? `Import manifest valid (${payload.providersCount} providers, 0 secrets).` : `Import validation failed: ${errors.join('; ')}`);
  if (!payload.ok) process.exitCode = 1;
}

function help() {
  console.log(`ALOAPI — One-Command Local Service CLI

Usage:
  aloapi                        Start ALOAPI on http://localhost:${DEFAULT_PORT} and open dashboard
  aloapi start [options]        Start service and open browser (reuses if already running)
    --dev                       Run Next.js development server instead of production build
    --no-open                   Do not open browser automatically
    --rebuild                   Force production rebuild before starting
    --foreground                Run server in foreground
  aloapi stop                   Stop only the managed ALOAPI process
  aloapi restart [options]      Stop and restart the managed ALOAPI process
  aloapi status [--json]        Show service, port, PID, and database health status
  aloapi logs [-n N] [-f]       View or follow service logs (--path prints log file path)
  aloapi doctor [--json]        Run non-destructive environment, security, and port diagnostics
  aloapi db:validate [--json]   Validate Prisma schema and SQLite migration parity
  aloapi migration:status       Display applied Prisma migrations and readiness status
  aloapi provider:doctor        Inspect external provider catalog & prepared project counts
  aloapi oauth:doctor           Inspect OAuth authorization state lifecycle counts
  aloapi vault:doctor           Verify AES-256-GCM Vault configuration & active count
  aloapi webhook:doctor         Inspect webhook event delivery and DLQ counters
  aloapi backup [--out FILE]    Create atomic SQLite backup snapshot via VACUUM INTO
  aloapi restore --file FILE    Validate integrity and restore SQLite backup
  aloapi import-validate FILE   Validate a secret-free aloapi-client-import-v1 manifest
  aloapi open                   Open http://localhost:${DEFAULT_PORT} in default browser
  aloapi setup                  Create private .env and one-time admin credentials
  aloapi admin:reset-password [username]  Rotate admin password and revoke admin sessions
  aloapi baseline-existing      Strictly verify a legacy SQLite schema, then record baseline
  aloapi version                Print CLI version and detected project root
  aloapi help                   Show this help message
`);
}

export function parseArgs(args) {
  const command = args[0] || 'start';
  return { command, dev: args.includes('--dev'), noOpen: args.includes('--no-open') };
}

export function parseCliOptions(args) {
  const positionals = [];
  let dev = false;
  let noOpen = false;
  let open = false;
  let rebuild = false;
  let foreground = false;
  let json = false;
  let follow = false;
  let pathOnly = false;
  let lines = 100;
  let outPath = '';
  let filePath = '';
  let wantHelp = false;
  let wantVersion = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') wantHelp = true;
    else if (arg === '--version' || arg === '-v') wantVersion = true;
    else if (arg === '--dev') dev = true;
    else if (arg === '--no-open') noOpen = true;
    else if (arg === '--open') open = true;
    else if (arg === '--rebuild') rebuild = true;
    else if (arg === '--foreground') foreground = true;
    else if (arg === '--json') json = true;
    else if (arg === '--yes' || arg === '-y') { /* non-interactive confirm flag */ }
    else if (arg === '-f' || arg === '--follow') follow = true;
    else if (arg === '--path') pathOnly = true;
    else if (arg === '--out') {
      outPath = args[i + 1] || '';
      i += 1;
    } else if (arg === '--file') {
      filePath = args[i + 1] || '';
      i += 1;
    } else if (arg === '-n' || arg === '--lines') {
      const next = Number(args[i + 1]);
      if (!Number.isInteger(next) || next < 1) throw new Error(`${arg} requires a positive integer.`);
      lines = next;
      i += 1;
    } else if (arg.startsWith('--lines=')) {
      const next = Number(arg.slice('--lines='.length));
      if (!Number.isInteger(next) || next < 1) throw new Error('--lines requires a positive integer.');
      lines = next;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  let command = positionals[0] || 'start';
  if (!filePath && positionals[1]) filePath = positionals[1];
  if (command === 'backup' && !outPath && positionals[1]) outPath = positionals[1];
  if (wantHelp) command = 'help';
  else if (wantVersion) command = 'version';

  return { command, dev, noOpen, open, rebuild, foreground, json, follow, pathOnly, lines, outPath, filePath };
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const { command } = options;

  if (command === 'help') return help();
  if (command === 'version') return showVersion();
  if (command === 'setup') return setup();
  if (command === 'admin:reset-password') return resetAdminPassword(options.filePath);
  if (command === 'run-server') return runServerForeground(false, runtimeConfig(resolveProjectRoot()));
  if (command === 'start') return startBackground(options);
  if (command === 'stop') return stopService();
  if (command === 'restart') return restartService(options);
  if (command === 'status') return showStatus(options);
  if (command === 'logs') return showLogs(options);
  if (command === 'doctor') return runDoctor(options);
  if (command === 'db:validate') return runDbValidate(options);
  if (command === 'migration:status') return runMigrationStatus(options);
  if (command === 'provider:doctor') return runSubDoctor('provider', options);
  if (command === 'oauth:doctor') return runSubDoctor('oauth', options);
  if (command === 'vault:doctor') return runSubDoctor('vault', options);
  if (command === 'webhook:doctor') return runSubDoctor('webhook', options);
  if (command === 'backup') return runBackup(options);
  if (command === 'restore') return runRestore(options);
  if (command === 'import-validate') return runImportValidate(options);
  if (command === 'baseline-existing') return baselineExisting();
  if (command === 'open') {
    const config = runtimeConfig(resolveProjectRoot());
    openBrowser(config.dashboardUrl);
    return;
  }

  console.error(`Unknown command: ${command}`);
  help();
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href) {
  main().catch(error => {
    console.error(`ALOAPI: ${redactSecrets(error instanceof Error ? error.message : String(error))}`);
    process.exitCode = 1;
  });
}
