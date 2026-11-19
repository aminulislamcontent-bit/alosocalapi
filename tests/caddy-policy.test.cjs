const test = require('node:test'),
  assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  http = require('node:http');
test('Caddy validates the TLS site and exposes only the two fixed callback routes', async (t) => {
  const bin = process.env.CADDY_BIN || 'caddy',
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-policy-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const opts = {
    env: { PATH: process.env.PATH, HOME: tmp, ALOAPI_CALLBACK_HOST: 'callback.test' },
    encoding: 'utf8',
  };
  execFileSync(bin, ['validate', '--config', 'Caddyfile', '--adapter', 'caddyfile'], opts);
  const config = JSON.parse(execFileSync(bin, ['adapt', '--config', 'Caddyfile'], opts));
  let hits = 0;
  const sink = http.createServer((_, res) => {
    hits++;
    res.end('controlled application');
  });
  await new Promise((resolve, reject) => sink.once('error', reject).listen(47831, '127.0.0.1', resolve));
  t.after(() => sink.close());
  const portProbe = http.createServer();
  await new Promise((r) => portProbe.listen(0, '127.0.0.1', r));
  const port = portProbe.address().port;
  await new Promise((r) => portProbe.close(r));
  // Exercise the *adapted handlers*. Only the listener/TLS automation changes for this offline drill.
  const server = config.apps.http.servers.srv0;
  server.listen = [`127.0.0.1:${port}`];
  delete server.tls_connection_policies;
  server.automatic_https = { disable: true };
  config.admin = { disabled: true };
  const file = path.join(tmp, 'server.json');
  fs.writeFileSync(file, JSON.stringify(config));
  const child = spawn(bin, ['run', '--config', file], { ...opts, stdio: ['ignore', 'ignore', 'pipe'] });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Caddy startup timed out')), 5000);
    child.stderr.on('data', (v) => {
      if (v.toString().includes('serving initial configuration')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('exit', () => {
      clearTimeout(timeout);
      reject(Error('Caddy exited'));
    });
  });
  const request = (url, host = 'callback.test') =>
    new Promise((resolve, reject) =>
      http
        .get({ hostname: '127.0.0.1', port, path: url, headers: { host } }, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve({ status: res.statusCode, text: () => body }));
        })
        .once('error', reject),
    );
  for (const callback of ['/api/onboarding/oauth/callback', '/api/webhooks/whatsapp'])
    assert.equal(await (await request(callback)).text(), 'controlled application');
  assert.equal((await request('/api/auth/login')).status, 404);
  assert.equal((await request('/other?XTransformPort=123')).status, 404);
  assert.equal((await request('/api/webhooks/whatsapp', 'other.test')).status, 421);
  assert.equal(hits, 2);
});
