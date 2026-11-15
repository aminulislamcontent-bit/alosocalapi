const assert = require('node:assert/strict');
const test = require('node:test');

const cli = import('../scripts/aloapi.mjs');

test('CLI binds to private default port and rejects unsafe public host/invalid port', async () => {
  const { parsePort, isLoopbackHost, serviceUrl } = await cli;
  assert.equal(parsePort(undefined), 47831);
  assert.equal(parsePort('48123'), 48123);
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('localhost'), true);
  assert.equal(isLoopbackHost('::1'), true);
  assert.equal(isLoopbackHost('0.0.0.0'), false);
  assert.equal(isLoopbackHost('192.168.1.4'), false);
  assert.equal(serviceUrl(47831, '127.0.0.1'), 'http://127.0.0.1:47831');
  assert.equal(serviceUrl(47831, '::1'), 'http://[::1]:47831');
  assert.throws(() => parsePort('80'), /1024 to 65535/);
  assert.throws(() => parsePort('47831x'), /1024 to 65535/);
});

test('CLI dotenv parser ignores comments and preserves quoted values', async () => {
  const { parseEnvFile } = await cli;
  assert.deepEqual(parseEnvFile('# a comment\n ALOAPI_HOST = "127.0.0.1"\nTOKEN=plain-value\nEMPTY=\ninvalid line\n'), {
    ALOAPI_HOST: '127.0.0.1', TOKEN: 'plain-value', EMPTY: '',
  });
});

test('CLI argument and browser launch selection are platform-specific', async () => {
  const { parseArgs, browserInvocation } = await cli;
  assert.deepEqual(parseArgs(['start', '--dev', '--no-open']), { command: 'start', dev: true, noOpen: true });
  assert.equal(parseArgs([]).command, 'start');
  assert.deepEqual(browserInvocation('linux', 'http://127.0.0.1:47831'), { command: 'xdg-open', args: ['http://127.0.0.1:47831'] });
  assert.deepEqual(browserInvocation('darwin', 'http://127.0.0.1:47831'), { command: 'open', args: ['http://127.0.0.1:47831'] });
  assert.deepEqual(browserInvocation('win32', 'http://127.0.0.1:47831'), { command: 'cmd.exe', args: ['/c', 'start', '', 'http://127.0.0.1:47831'] });
});
