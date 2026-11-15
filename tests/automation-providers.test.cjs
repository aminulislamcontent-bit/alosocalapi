const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/lib/automation-providers.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tempPath = path.join(os.tmpdir(), `aloapi-automation-providers-${process.pid}.cjs`);
fs.writeFileSync(tempPath, compiled, { mode: 0o600 });
const { getAutomationProviders } = require(tempPath);

test('automation registry reports manifest/checkout/environment presence without claiming a running connection', () => {
  const providers = getAutomationProviders();
  assert.equal(providers.length, 7);
  assert.equal(new Set(providers.map(provider => provider.key)).size, providers.length);
  for (const provider of providers) {
    assert.equal(typeof provider.present, 'boolean');
    assert.ok(provider.commit === null || /^[a-f0-9]{40}$/i.test(provider.commit));
    assert.ok(Array.isArray(provider.configuredEnv));
    assert.ok(provider.configuredEnv.every(name => provider.env.includes(name)));
    assert.equal(Object.hasOwn(provider, 'connected'), false);
    assert.equal(Object.hasOwn(provider, 'authorized'), false);
  }
});

test.after(() => fs.rmSync(tempPath, { force: true }));
