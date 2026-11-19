import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_NAME = '20261115000000_baseline';
const ADDITIVE_NAME = '20261115000100_security_integrations';
const ADDITIVE_V2_NAME = '20261116000200_autonomous_onboarding_intelligence';
const ADDITIVE_V3_NAME = '20261117000300_first_party_platform_factory';
const ADDITIVE_V4_NAME = '20261117000400_integration_engineering_handover';
const SCOPED = '20261119000100_scoped_operations';
const BASELINE_SQL = path.join(ROOT, 'prisma', 'migrations', BASELINE_NAME, 'migration.sql');
const ADDITIVE_SQL = path.join(ROOT, 'prisma', 'migrations', ADDITIVE_NAME, 'migration.sql');
const ADDITIVE_V2_SQL = path.join(ROOT, 'prisma', 'migrations', ADDITIVE_V2_NAME, 'migration.sql');
const ADDITIVE_V3_SQL = path.join(ROOT, 'prisma', 'migrations', ADDITIVE_V3_NAME, 'migration.sql');
const ADDITIVE_V4_SQL = path.join(ROOT, 'prisma', 'migrations', ADDITIVE_V4_NAME, 'migration.sql');
const PRISMA_MIGRATION_COLUMNS = ['id', 'checksum', 'finished_at', 'migration_name', 'logs', 'rolled_back_at', 'started_at', 'applied_steps_count'];

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function stable(value) {
  return JSON.stringify(value);
}

function getTableNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map(row => row.name);
}

function tableSnapshot(db, table) {
  const name = quoteIdentifier(table);
  const columns = db.prepare(`PRAGMA table_info(${name})`).all().map(column => ({
    name: column.name,
    type: String(column.type ?? '').toUpperCase(),
    notnull: Number(column.notnull),
    default: column.dflt_value === null ? null : String(column.dflt_value),
    pk: Number(column.pk),
  }));
  const indexes = db.prepare(`PRAGMA index_list(${name})`).all()
    .filter(index => !String(index.name).startsWith('sqlite_autoindex'))
    .map(index => ({
      name: index.name,
      unique: Number(index.unique),
      partial: Number(index.partial),
      columns: db.prepare(`PRAGMA index_info(${quoteIdentifier(index.name)})`).all().map(column => column.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${name})`).all().map(key => ({
    table: key.table,
    from: key.from,
    to: key.to,
    on_update: String(key.on_update).toUpperCase(),
    on_delete: String(key.on_delete).toUpperCase(),
    match: String(key.match).toUpperCase(),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return { columns, indexes, foreignKeys };
}

/**
 * Non-destructively compare an existing SQLite schema with the exact original
 * CRM/Growth Engine baseline. The caller must only mark the baseline applied
 * after this strict check succeeds. Data rows are never read or modified.
 */
export function inspectExistingDatabase(databasePath, baselineSql = readFileSync(BASELINE_SQL, 'utf8'), { allowMigrationHistory = false } = {}) {
  if (!existsSync(databasePath)) return { ok: false, reason: 'database file does not exist' };
  let actual;
  const expected = new DatabaseSync(':memory:');
  try {
    expected.exec(baselineSql);
    actual = new DatabaseSync(databasePath, { readOnly: true });

    const expectedTables = getTableNames(expected);
    const actualTables = getTableNames(actual);
    const hasMigrationTable = actualTables.includes('_prisma_migrations');
    if (hasMigrationTable) {
      const historyCount = Number(actual.prepare('SELECT COUNT(*) AS count FROM "_prisma_migrations"').get().count);
      if (historyCount !== 0 && !allowMigrationHistory) return { ok: false, reason: 'Prisma migration history is not empty; do not baseline over it' };
    }
    const relevantActualTables = actualTables.filter(name => name !== '_prisma_migrations');
    if (stable(expectedTables) !== stable(relevantActualTables)) {
      const missing = expectedTables.filter(name => !relevantActualTables.includes(name));
      const unexpected = relevantActualTables.filter(name => !expectedTables.includes(name));
      return { ok: false, reason: `table set mismatch (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'})` };
    }

    for (const table of expectedTables) {
      const expectedSchema = tableSnapshot(expected, table);
      const actualSchema = tableSnapshot(actual, table);
      if (stable(expectedSchema) !== stable(actualSchema)) {
        const differing = Object.keys(expectedSchema).filter(key => stable(expectedSchema[key]) !== stable(actualSchema[key]));
        return { ok: false, reason: `schema mismatch in ${table} (${differing.join(', ')})` };
      }
    }

    const foreignKeyProblems = actual.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeyProblems.length) return { ok: false, reason: `existing rows have ${foreignKeyProblems.length} foreign-key violation(s)` };
    return { ok: true, reason: 'all baseline tables, columns, defaults, indexes and foreign keys match; row data was not changed' };
  } catch (error) {
    return { ok: false, reason: `schema could not be safely inspected (${error instanceof Error ? error.message : String(error)})` };
  } finally {
    actual?.close();
    expected.close();
  }
}

/**
 * Startup must not let Prisma create `_prisma_migrations` in an unreviewed
 * existing database. Fresh files are safe. Existing databases are allowed only
 * when their history contains our known migrations and their exact schema
 * matches the last completed migration; legacy baselines need the explicit
 * strict baseline command.
 */
export function inspectMigrationReadiness(databasePath) {
  if (!existsSync(databasePath)) return { ok: true, kind: 'fresh', reason: 'database file does not exist yet' };
  let actual;
  try {
    actual = new DatabaseSync(databasePath, { readOnly: true });
    const tables = getTableNames(actual);
    if (tables.length === 0) return { ok: true, kind: 'fresh', reason: 'database has no tables' };

    const hasMigrationTable = tables.includes('_prisma_migrations');
    if (!hasMigrationTable) {
      const baseline = inspectExistingDatabase(databasePath);
      if (baseline.ok) {
        return { ok: false, kind: 'baseline', reason: 'the existing schema matches the original baseline; run `npm run aloapi -- baseline-existing` before migration deployment' };
      }
      return { ok: false, kind: 'unmanaged', reason: `existing tables have no Prisma migration history and do not match the reviewed baseline (${baseline.reason})` };
    }

    const migrationColumns = new Set(actual.prepare('PRAGMA table_info("_prisma_migrations")').all().map(column => column.name));
    if (PRISMA_MIGRATION_COLUMNS.some(column => !migrationColumns.has(column))) {
      return { ok: false, kind: 'unmanaged', reason: 'Prisma migration history table has an unexpected structure' };
    }

    const history = actual.prepare('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC').all();
    const applicationTables = tables.filter(name => name !== '_prisma_migrations');
    if (history.length === 0 && applicationTables.length === 0) {
      return { ok: true, kind: 'fresh', reason: 'only an empty, correctly structured Prisma migration table exists' };
    }
    if (history.length === 0) {
      const baseline = inspectExistingDatabase(databasePath);
      if (baseline.ok) {
        return { ok: false, kind: 'baseline', reason: 'the existing schema matches the original baseline but its migration history is empty; run `npm run aloapi -- baseline-existing` before migration deployment' };
      }
      return { ok: false, kind: 'unmanaged', reason: `non-empty SQLite schema has empty migration history and does not match the reviewed baseline (${baseline.reason})` };
    }

    const names = history.map(row => row.migration_name);
    const knownNames = names.length <= 6
      && names[0] === BASELINE_NAME
      && (names.length < 2 || names[1] === ADDITIVE_NAME)
      && (names.length < 3 || names[2] === ADDITIVE_V2_NAME)
      && (names.length < 4 || names[3] === ADDITIVE_V3_NAME)
      && (names.length < 5 || names[4] === ADDITIVE_V4_NAME)
      && (names.length < 6 || names[5] === SCOPED);
    if (!knownNames || history.some(row => !row.finished_at || row.rolled_back_at)) {
      return { ok: false, kind: 'unmanaged', reason: 'Prisma migration history contains an unknown, incomplete, or rolled-back migration; review it manually before startup' };
    }

    const expectedSql = readFileSync(BASELINE_SQL, 'utf8')
      + (names.includes(ADDITIVE_NAME) ? `\n${readFileSync(ADDITIVE_SQL, 'utf8')}` : '')
      + (names.includes(ADDITIVE_V2_NAME) ? `\n${readFileSync(ADDITIVE_V2_SQL, 'utf8')}` : '')
      + (names.includes(ADDITIVE_V3_NAME) ? `\n${readFileSync(ADDITIVE_V3_SQL, 'utf8')}` : '')
      + (names.includes(ADDITIVE_V4_NAME) ? `\n${readFileSync(ADDITIVE_V4_SQL, 'utf8')}` : '')
      + (names.includes(SCOPED) ? readFileSync(path.join(ROOT, 'prisma/migrations', SCOPED, 'migration.sql'), 'utf8') : '');
    const schema = inspectExistingDatabase(databasePath, expectedSql, { allowMigrationHistory: true });
    if (!schema.ok) {
      return { ok: false, kind: 'unmanaged', reason: `database schema does not match its last completed migration (${schema.reason})` };
    }
    return { ok: true, kind: 'managed', reason: `schema matches completed migration history (${names.join(', ')})` };
  } catch (error) {
    return { ok: false, kind: 'unreadable', reason: `database preflight failed (${error instanceof Error ? error.message : String(error)})` };
  } finally {
    actual?.close();
  }
}

export function sqliteFileFromDatabaseUrl(databaseUrl, schemaDirectory = path.join(ROOT, 'prisma')) {
  if (!databaseUrl || !databaseUrl.startsWith('file:')) throw new Error('Existing database baselining requires a local SQLite DATABASE_URL starting with file:.');
  let relative = databaseUrl.slice('file:'.length).split('?')[0];
  try { relative = decodeURIComponent(relative); } catch { throw new Error('DATABASE_URL has an invalid percent-encoded path.'); }
  if (!relative || relative === ':memory:' || relative.startsWith(':memory:')) throw new Error('A persistent SQLite database file is required for baselining.');
  return path.isAbsolute(relative) ? relative : path.resolve(schemaDirectory, relative);
}
