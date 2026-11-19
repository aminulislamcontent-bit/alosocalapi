const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { inspectExistingDatabase, inspectMigrationReadiness } = require('../scripts/migrations.mjs');

const baselinePath = path.resolve(__dirname, '../prisma/migrations/20261115000000_baseline/migration.sql');
const additivePath = path.resolve(__dirname, '../prisma/migrations/20261115000100_security_integrations/migration.sql');
const additiveV2Path = path.resolve(__dirname, '../prisma/migrations/20261116000200_autonomous_onboarding_intelligence/migration.sql');
const additiveV3Path = path.resolve(__dirname, '../prisma/migrations/20261117000300_first_party_platform_factory/migration.sql');
const additiveV4Path = path.resolve(__dirname, '../prisma/migrations/20261117000400_integration_engineering_handover/migration.sql');
const baselineSql = fs.readFileSync(baselinePath, 'utf8');
const additiveSql = fs.readFileSync(additivePath, 'utf8');
const additiveV2Sql = fs.readFileSync(additiveV2Path, 'utf8');
const additiveV3Sql = fs.readFileSync(additiveV3Path, 'utf8');
const additiveV4Sql = fs.readFileSync(additiveV4Path, 'utf8');

function temporaryDatabase(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloapi-migrations-'));
  const databasePath = path.join(dir, 'existing.db');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return databasePath;
}

function seedBaseline(databasePath) {
  const db = new DatabaseSync(databasePath);
  db.exec(baselineSql);
  db.prepare('INSERT INTO "AdminUser" ("id", "username", "passwordHash") VALUES (?, ?, ?)').run('admin-1', 'owner', 'scrypt-hash');
  db.close();
}

const migrationHistorySql = `CREATE TABLE "_prisma_migrations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "checksum" TEXT NOT NULL,
  "finished_at" DATETIME,
  "migration_name" TEXT NOT NULL,
  "logs" TEXT,
  "rolled_back_at" DATETIME,
  "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);`;

function recordMigration(db, name) {
  db.prepare(`INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count") VALUES (?, ?, ?, ?, ?, ?)`)
    .run(`id-${name}`, 'checksum', '2026-11-15T00:00:00.000Z', name, '2026-11-15T00:00:00.000Z', 1);
}

test('existing baseline inspection is read-only and permits matching schema with existing rows', t => {
  const databasePath = temporaryDatabase(t);
  seedBaseline(databasePath);
  const before = fs.readFileSync(databasePath);
  const result = inspectExistingDatabase(databasePath, baselineSql);
  const after = fs.readFileSync(databasePath);
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(after, before, 'inspection does not rewrite the SQLite file');
});

test('baseline inspection refuses schema drift and non-empty migration history', t => {
  const driftedPath = temporaryDatabase(t);
  seedBaseline(driftedPath);
  const drift = new DatabaseSync(driftedPath);
  drift.exec('ALTER TABLE "AdminUser" ADD COLUMN "unexpected" TEXT');
  drift.close();
  assert.match(inspectExistingDatabase(driftedPath, baselineSql).reason, /mismatch/);

  const historyPath = temporaryDatabase(t);
  seedBaseline(historyPath);
  const history = new DatabaseSync(historyPath);
  history.exec('CREATE TABLE "_prisma_migrations" ("id" TEXT PRIMARY KEY, "migration_name" TEXT); INSERT INTO "_prisma_migrations" VALUES (\'already-applied\', \'older\')');
  history.close();
  assert.match(inspectExistingDatabase(historyPath, baselineSql).reason, /history is not empty/);
});

test('reviewed additive migration preserves existing account data and adds integration/security tables', t => {
  const databasePath = temporaryDatabase(t);
  seedBaseline(databasePath);
  const db = new DatabaseSync(databasePath);
  db.exec(additiveSql);
  const admin = db.prepare('SELECT "id", "username", "passwordHash", "mfaEnabled", "recoveryCodeHashes" FROM "AdminUser" WHERE "id" = ?').get('admin-1');
  assert.equal(admin.id, 'admin-1');
  assert.equal(admin.username, 'owner');
  assert.equal(admin.passwordHash, 'scrypt-hash');
  assert.equal(admin.mfaEnabled, 0);
  assert.equal(admin.recoveryCodeHashes, '[]');
  const newTables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  for (const table of ['LoginThrottle', 'IntegrationProvider', 'IntegrationAccount', 'IntegrationSecret', 'IntegrationAuditEvent', 'IntegrationWebhookEvent', 'IntegrationPrivacyPolicy', 'CredentialTransferKey']) {
    assert.ok(newTables.has(table), `${table} was added`);
  }
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});

test('autonomous onboarding v2 migration preserves baseline + security rows and adds all 10 onboarding tables', t => {
  const databasePath = temporaryDatabase(t);
  seedBaseline(databasePath);
  const db = new DatabaseSync(databasePath);
  db.exec(additiveSql);
  db.prepare('INSERT INTO "IntegrationProvider" ("key", "category", "verificationStatus", "updatedAt") VALUES (?, ?, ?, ?)')
    .run('whatsapp_cloud_api', 'messaging', 'DOCUMENTED', '2026-11-16T00:00:00.000Z');
  db.exec(additiveV2Sql);
  const admin = db.prepare('SELECT "id", "username" FROM "AdminUser" WHERE "id" = ?').get('admin-1');
  const prov = db.prepare('SELECT "key", "category" FROM "IntegrationProvider" WHERE "key" = ?').get('whatsapp_cloud_api');
  assert.equal(admin.username, 'owner');
  assert.equal(prov.key, 'whatsapp_cloud_api');
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  for (const table of [
    'OnboardingWorkflow',
    'ClientRequirementProfile',
    'VaultCredential',
    'OAuthAuthorizationState',
    'BrowserWorkflowSession',
    'AgentExecutionRun',
    'OmniEvent',
    'SystemInitializationRun',
    'SystemIntegrityRecord',
    'ApiDiscoverySnapshot',
  ]) {
    assert.ok(tables.has(table), `${table} was added`);
  }
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});

test('first-party platform factory v3 migration preserves baseline + security + onboarding rows and adds 22 factory tables', t => {
  const dbPath = temporaryDatabase(t);
  seedBaseline(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(migrationHistorySql);
  recordMigration(db, '20261115000000_baseline');
  db.exec(additiveSql);
  recordMigration(db, '20261115000100_security_integrations');
  db.exec(additiveV2Sql);
  recordMigration(db, '20261116000200_autonomous_onboarding_intelligence');
  db.prepare('INSERT INTO "VaultCredential" ("id","clientId","providerKey","credentialType","ciphertext","updatedAt") VALUES (?,?,?,?,?,?)')
    .run('v-1', 'c-1', 'meta_facebook_pages', 'api_key', 'enc-val', '2026-11-16T00:00:00.000Z');
  db.exec(additiveV3Sql);
  recordMigration(db, '20261117000300_first_party_platform_factory');

  assert.equal(db.prepare('SELECT "username" FROM "AdminUser" WHERE "id" = ?').get('admin-1').username, 'owner');
  assert.equal(db.prepare('SELECT "ciphertext" FROM "VaultCredential" WHERE "id" = ?').get('v-1').ciphertext, 'enc-val');
  const factoryTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'Factory%' OR name LIKE 'Email%' OR name LIKE 'Voice%')").all();
  assert.equal(factoryTables.length, 22);
  db.close();
  assert.equal(inspectMigrationReadiness(dbPath).ok, true);
});

test('startup preflight refuses an unbaselined existing SQLite database without rewriting it', t => {
  const freshPath = temporaryDatabase(t);
  assert.deepEqual(inspectMigrationReadiness(freshPath), {
    ok: true,
    kind: 'fresh',
    reason: 'database file does not exist yet',
  });

  const existingPath = temporaryDatabase(t);
  seedBaseline(existingPath);
  const before = fs.readFileSync(existingPath);
  const readiness = inspectMigrationReadiness(existingPath);
  const after = fs.readFileSync(existingPath);
  assert.equal(readiness.ok, false);
  assert.equal(readiness.kind, 'baseline');
  assert.match(readiness.reason, /baseline-existing/);
  assert.deepEqual(after, before, 'startup preflight is read-only');

  const emptyHistoryPath = temporaryDatabase(t);
  seedBaseline(emptyHistoryPath);
  const emptyHistory = new DatabaseSync(emptyHistoryPath);
  emptyHistory.exec(migrationHistorySql);
  emptyHistory.close();
  assert.equal(inspectMigrationReadiness(emptyHistoryPath).kind, 'baseline');

  const driftedPath = temporaryDatabase(t);
  seedBaseline(driftedPath);
  const drifted = new DatabaseSync(driftedPath);
  drifted.exec('ALTER TABLE "AdminUser" ADD COLUMN "unexpected" TEXT');
  drifted.close();
  const driftBefore = fs.readFileSync(driftedPath);
  const driftReadiness = inspectMigrationReadiness(driftedPath);
  assert.equal(driftReadiness.ok, false);
  assert.equal(driftReadiness.kind, 'unmanaged');
  assert.deepEqual(fs.readFileSync(driftedPath), driftBefore, 'drift check does not write to the database');
});

test('startup preflight allows only known, completed migration histories with matching schemas', t => {
  const baselinePath = temporaryDatabase(t);
  seedBaseline(baselinePath);
  const baseline = new DatabaseSync(baselinePath);
  baseline.exec(migrationHistorySql);
  recordMigration(baseline, '20261115000000_baseline');
  baseline.close();
  assert.equal(inspectMigrationReadiness(baselinePath).ok, true);

  const currentPath = temporaryDatabase(t);
  seedBaseline(currentPath);
  const current = new DatabaseSync(currentPath);
  current.exec(migrationHistorySql);
  recordMigration(current, '20261115000000_baseline');
  current.exec(additiveSql);
  recordMigration(current, '20261115000100_security_integrations');
  current.exec(additiveV2Sql);
  recordMigration(current, '20261116000200_autonomous_onboarding_intelligence');
  current.exec(additiveV3Sql);
  recordMigration(current, '20261117000300_first_party_platform_factory');
  current.exec(additiveV4Sql);
  recordMigration(current, '20261117000400_integration_engineering_handover');
  const scopedSql=fs.readFileSync(path.resolve(__dirname,'../prisma/migrations/20261119000100_scoped_operations/migration.sql'),'utf8');
  assert.doesNotMatch(scopedSql,/\b(?:DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM|TRUNCATE)\b/i);
  current.exec(`INSERT INTO FactoryWorkspace(id,slug,name,ownerUsername,updatedAt) VALUES('alpha','alpha','alpha','owner',CURRENT_TIMESTAMP);
    INSERT INTO FactoryJob(id,workspaceId,moduleKey,jobType,idempotencyKey,payload,updatedAt) VALUES('old-job','alpha','email_marketing','email.campaign.dispatch','legacy-key','{}',CURRENT_TIMESTAMP)`);
  current.exec(scopedSql);recordMigration(current,'20261119000100_scoped_operations');
  assert.equal(current.prepare("SELECT payload FROM FactoryJob WHERE workspaceId='alpha' AND idempotencyKey='legacy-key' AND id='old-job'").get().payload,'{}');
  current.close();
  assert.equal(inspectMigrationReadiness(currentPath).ok, true);

  const incompletePath = temporaryDatabase(t);
  seedBaseline(incompletePath);
  const incomplete = new DatabaseSync(incompletePath);
  incomplete.exec(migrationHistorySql);
  incomplete.prepare(`INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at") VALUES (?, ?, ?, ?)`)
    .run('failed-migration', 'checksum', 'unknown_migration', '2026-11-15T00:00:00.000Z');
  incomplete.close();
  const refused = inspectMigrationReadiness(incompletePath);
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /unknown, incomplete, or rolled-back/);
});

test('checked-in migration SQL contains no destructive table or row operation', () => {
  assert.doesNotMatch(additiveV4Sql, /\b(?:DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM|TRUNCATE)\b/i);
  assert.doesNotMatch(additiveV3Sql, /\b(?:DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM|TRUNCATE)\b/i);
  assert.doesNotMatch(additiveV2Sql, /\b(?:DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM|TRUNCATE)\b/i);
  assert.doesNotMatch(additiveSql, /\b(?:DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM|TRUNCATE)\b/i);
  assert.doesNotMatch(baselineSql, /\b(?:DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM|TRUNCATE)\b/i);
});

test('prisma schema defines all 76 models including 10 onboarding, 22 factory, and 6 engineering models matching migrations and lockfile dependencies', () => {
  const schemaText = fs.readFileSync(path.resolve(__dirname, '../prisma/schema.prisma'), 'utf8');
  const modelNames = [...schemaText.matchAll(/^model\s+(\w+)\s+\{/gm)].map(m => m[1]);
  assert.equal(modelNames.length, 76, `Expected 76 Prisma models, got ${modelNames.length}`);

  const expectedOnboardingModels = [
    'OnboardingWorkflow',
    'ClientRequirementProfile',
    'VaultCredential',
    'OAuthAuthorizationState',
    'BrowserWorkflowSession',
    'AgentExecutionRun',
    'OmniEvent',
    'SystemInitializationRun',
    'SystemIntegrityRecord',
    'ApiDiscoverySnapshot',
  ];
  for (const model of expectedOnboardingModels) {
    assert.ok(modelNames.includes(model), `Missing model ${model} in prisma/schema.prisma`);
    assert.match(additiveV2Sql, new RegExp(`CREATE TABLE "${model}"`), `Missing CREATE TABLE "${model}" in v2 migration`);
  }

  const expectedFactoryModels = [
    'FactoryWorkspace',
    'FactoryWorkspaceMember',
    'FactoryProviderConnection',
    'FactoryJob',
    'FactoryUsageEvent',
    'FactoryModuleConfig',
    'FactoryModuleRecord',
    'EmailSendingDomain',
    'EmailContact',
    'EmailTemplate',
    'EmailCampaign',
    'EmailDeliveryEvent',
    'VoiceCompliancePolicy',
    'VoiceConsentRecord',
    'VoiceAgentProfile',
    'VoiceCallSession',
    'FactoryAutomationWorkflow',
    'FactoryAutomationRun',
    'FactoryCrmOrganization',
    'FactoryCrmContact',
    'FactoryCrmOpportunity',
    'FactoryCrmActivity',
  ];
  for (const model of expectedFactoryModels) {
    assert.ok(modelNames.includes(model), `Missing model ${model} in prisma/schema.prisma`);
    assert.match(additiveV3Sql, new RegExp(`CREATE TABLE "${model}"`), `Missing CREATE TABLE "${model}" in v3 migration`);
  }

  const expectedEngineeringModels = [
    'IntegrationProject',
    'WebsiteDiscoveryReport',
    'CredentialPreparationRecord',
    'OAuthAppRegistryEntry',
    'VerificationCheckpoint',
    'ClientHandoverPackage',
  ];
  for (const model of expectedEngineeringModels) {
    assert.ok(modelNames.includes(model), `Missing model ${model} in prisma/schema.prisma`);
    assert.match(additiveV4Sql, new RegExp(`CREATE TABLE "${model}"`), `Missing CREATE TABLE "${model}" in v4 migration`);
  }

  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package-lock.json'), 'utf8'));
  for (const dep of ['@prisma/client', '@prisma/adapter-libsql', '@libsql/client', 'next', 'react']) {
    assert.ok(pkg.dependencies[dep], `Missing dependency ${dep} in package.json`);
    assert.ok(lock.packages[`node_modules/${dep}`], `Missing ${dep} in package-lock.json`);
  }
});
