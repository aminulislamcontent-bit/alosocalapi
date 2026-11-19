const assert = require('node:assert/strict');
const test = require('node:test');

let vault;
test.before(async () => { vault = await import('../src/lib/security/vault-crypto-core.mjs'); });

test('vault uses authenticated encryption and round-trips Unicode data', () => {
  const previous = process.env.ALOAPI_VAULT_KEY;
  process.env.ALOAPI_VAULT_KEY = 'test-only-stable-vault-key-with-32-bytes';
  try {
    const plaintext = 'opaque-test-value-অ্যাক্সেস';
    const ciphertext = vault.encryptVaultValue(plaintext);
    assert.notEqual(ciphertext, plaintext);
    assert.equal(vault.isVaultCiphertext(ciphertext), true);
    assert.equal(vault.decryptVaultValue(ciphertext), plaintext);
    assert.equal(vault.encryptVaultValue(''), '');
    assert.equal(vault.isVaultCiphertext('plaintext'), false);
  } finally {
    if (previous === undefined) delete process.env.ALOAPI_VAULT_KEY;
    else process.env.ALOAPI_VAULT_KEY = previous;
  }
});

test('vault rejects missing, short, tampered, and wrong keys', () => {
  const previous = process.env.ALOAPI_VAULT_KEY;
  try {
    delete process.env.ALOAPI_VAULT_KEY;
    assert.throws(() => vault.encryptVaultValue('value'), /ALOAPI_VAULT_KEY_MISSING/);
    process.env.ALOAPI_VAULT_KEY = 'too-short';
    assert.throws(() => vault.encryptVaultValue('value'), /ALOAPI_VAULT_KEY_MISSING/);
    process.env.ALOAPI_VAULT_KEY = 'first-stable-test-key-with-at-least-32-bytes';
    const ciphertext = vault.encryptVaultValue('opaque-secret');
    const parts = ciphertext.split('.');
    parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
    assert.throws(() => vault.decryptVaultValue(parts.join('.')));
    process.env.ALOAPI_VAULT_KEY = 'second-different-test-key-with-at-least-32-bytes';
    assert.throws(() => vault.decryptVaultValue(ciphertext));
  } finally {
    if (previous === undefined) delete process.env.ALOAPI_VAULT_KEY;
    else process.env.ALOAPI_VAULT_KEY = previous;
  }
});

test('vault helper masks secrets and compares equal-length values safely', () => {
  assert.equal(vault.maskSecret('abcdef'), '••••••••cdef');
  assert.equal(vault.maskSecret(''), '');
  assert.equal(vault.constantTimeEqual('same', 'same'), true);
  assert.equal(vault.constantTimeEqual('same', 'diff'), false);
  assert.equal(vault.constantTimeEqual('short', 'longer'), false);
});

test('legacy credential migration is idempotent, transactional per batch, and preserves values', async () => {
  const { migrateCredentialRows } = await import('../scripts/migrate-credential-vault.mjs');
  const previous = process.env.ALOAPI_VAULT_KEY;
  process.env.ALOAPI_VAULT_KEY = 'migration-test-key-with-more-than-32-bytes';
  const rows = [
    { id: 'legacy-1', value: 'legacy opaque value' },
    { id: 'encrypted-1', value: vault.encryptVaultValue('previously encrypted') },
    { id: 'empty-1', value: '' },
  ];
  const repository = {
    credentialEntry: {
      findMany: async () => rows.map(row => ({ ...row })),
    },
    $transaction: async callback => {
      const before = rows.map(row => ({ ...row }));
      const transaction = { credentialEntry: { updateMany: async ({ where, data }) => {
        const row = rows.find(item => item.id === where.id && item.value === where.value);
        if (!row) return { count: 0 };
        row.value = data.value;
        return { count: 1 };
      } } };
      try { return await callback(transaction); }
      catch (error) { rows.splice(0, rows.length, ...before); throw error; }
    },
  };
  try {
    const first = await migrateCredentialRows(repository);
    assert.deepEqual(first, { totalRows: 3, updated: 1, alreadyEncrypted: 1, empty: 1 });
    assert.equal(vault.decryptVaultValue(rows[0].value), 'legacy opaque value');
    const second = await migrateCredentialRows(repository);
    assert.deepEqual(second, { totalRows: 3, updated: 0, alreadyEncrypted: 2, empty: 1 });
  } finally {
    if (previous === undefined) delete process.env.ALOAPI_VAULT_KEY;
    else process.env.ALOAPI_VAULT_KEY = previous;
  }
});

test('vault migration refuses a wrong key before updating any legacy row', async () => {
  const { migrateCredentialRows } = await import('../scripts/migrate-credential-vault.mjs');
  const previous = process.env.ALOAPI_VAULT_KEY;
  const correct = 'correct-migration-key-with-more-than-32-bytes';
  process.env.ALOAPI_VAULT_KEY = correct;
  const encrypted = vault.encryptVaultValue('opaque existing value');
  const rows = [{ id: 'legacy', value: 'legacy value' }, { id: 'locked', value: encrypted }];
  const repository = {
    credentialEntry: { findMany: async () => rows.map(row => ({ ...row })) },
    $transaction: async callback => callback({ credentialEntry: { updateMany: async () => ({ count: 0 }) } }),
  };
  try {
    process.env.ALOAPI_VAULT_KEY = 'different-wrong-key-with-more-than-32-bytes';
    await assert.rejects(migrateCredentialRows(repository), /cannot be opened/);
    assert.equal(rows[0].value, 'legacy value');
  } finally {
    if (previous === undefined) delete process.env.ALOAPI_VAULT_KEY;
    else process.env.ALOAPI_VAULT_KEY = previous;
  }
});

test('WAL backup and isolated vault restore authenticate the canary without logging plaintext',async t=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
  const {spawnSync}=require('node:child_process'), {DatabaseSync}=require('node:sqlite');
  const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vault-drill-'));
  t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  const file=path.join(tmp,'source.db'),dest=path.join(tmp,'snapshot');
  const mig=spawnSync(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy'],{env:{...process.env,DATABASE_URL:`file:${file}`}});assert.equal(mig.status,0);
  const key=crypto.randomBytes(36).toString('hex'),canary=crypto.randomUUID();
  const cipher=vault.encryptVaultValue(canary,crypto.createHash('sha256').update(key).digest());
  const live=new DatabaseSync(file); t.after(()=>live.close());live.exec('PRAGMA journal_mode=WAL');
  live.prepare(`INSERT INTO VaultCredential(id,clientId,providerKey,credentialType,ciphertext,updatedAt) VALUES ('fixture','scope','test','test',?,CURRENT_TIMESTAMP)`).run(cipher);
  const run=(args,k)=>{const env={...process.env};delete env.ALOAPI_VAULT_KEY;if(k)env.ALOAPI_VAULT_KEY=k;
    const p=spawnSync(process.execPath,[path.join(root,'scripts/vault-recovery.mjs'),...args],{env,encoding:'utf8'});assert.ok(!`${p.stdout}${p.stderr}`.includes(canary));return p.status};
  assert.equal(run(['backup',file,dest]),0);const restored=path.join(tmp,'isolated.db');fs.copyFileSync(path.join(dest,'snapshot.db'),restored);
  for(const [tenant,k,status] of [['scope',key,0],['scope',crypto.randomBytes(40).toString('hex'),1],['scope',undefined,1],['other',key,1]])assert.equal(run(['verify',restored,tenant,'fixture'],k),status);
  assert.equal(live.prepare('SELECT ciphertext FROM VaultCredential').get().ciphertext,cipher);
});
