import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, chmod } from 'node:fs/promises';
import path from 'node:path';
import { decryptVaultValue } from '../src/lib/security/vault-crypto-core.mjs';
import { inspectMigrationReadiness } from './migrations.mjs';

// Never create an empty source DB, overwrite an existing backup, or print row data.
process.umask(0o077);
const [op, source, destination, credentialId] = process.argv.slice(2);
let db;
try {
  if (!source || !destination) throw new Error();
  db = new DatabaseSync(source,{readOnly:true});
  if (op === 'backup') {
    await mkdir(destination,{mode:0o700}); // EEXIST is a stop condition
    const target = path.join(destination,'snapshot.db');
    await backup(db,target); await chmod(target,0o600);
    console.log('Snapshot copied. Verify separately before retaining.');
  } else if (op === 'verify') {
    if (!credentialId || !inspectMigrationReadiness(source).ok) throw new Error();
    const check = db.prepare('PRAGMA integrity_check').all();
    if (check.length!==1 || check[0].integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').get()) throw new Error();
    const row=db.prepare('SELECT ciphertext FROM VaultCredential WHERE clientId=? AND id=?').get(destination,credentialId);
    if (!row || !decryptVaultValue(row.ciphertext)) throw new Error();
    console.log('Schema, integrity, tenant-scoped lookup and authenticated decryption passed.');
  } else throw new Error();
} catch { console.error('Recovery check failed. No credential data was printed.');process.exitCode=1; }
finally {db?.close();}
