import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { ALL_INTEGRATION_CATALOG, auditCatalogDocumentation } from '@/lib/intelligence/catalog';
import { auditEvent } from '@/lib/security/audit';

export const PROTECTED_PATHS = [
  '.env',
  '.env.local',
  '.env.production',
  'db',
  'prisma/db',
  'providers',
  '.git',
  'prisma/migrations',
  'prisma/schema.prisma',
] as const;

export interface IntegrityFinding {
  checkName: string;
  category: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  status: 'HEALTHY' | 'REPAIRABLE' | 'REQUIRES_OWNER_APPROVAL';
  detail: string;
  safeArtifactTarget?: string;
}

const ROOT = process.cwd();

function isProtectedPath(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return PROTECTED_PATHS.some(p => norm === p || norm.startsWith(`${p}/`));
}

export function buildDeterministicEnvExample(): string {
  const seen = new Set<string>();
  const lines = [
    '# ALOAPI environment template (deterministic generated artifact)',
    '# Keep real secrets in .env (excluded from Git) and encrypted server-side Vault.',
    'DATABASE_URL="file:./db/custom.db"',
    'ALOAPI_HOST="127.0.0.1"',
    'ALOAPI_PORT="47831"',
    'ALOAPI_VAULT_KEY=""',
    'ALOAPI_ADMIN_USER="admin"',
    'ALOAPI_PUBLIC_WEBHOOK_BASE_URL=""',
    '',
  ];
  for (const provider of ALL_INTEGRATION_CATALOG) {
    for (const v of provider.environmentVariables) {
      if (seen.has(v.name)) continue;
      seen.add(v.name);
      lines.push(`# ${provider.key}: ${v.purpose}`);
      lines.push(`${v.name}=""`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function runSystemIntegrityCheck(
  actor: string,
  options?: { rootDir?: string; persist?: boolean },
): Promise<{
  checkedAt: string;
  healthyCount: number;
  repairableCount: number;
  approvalRequiredCount: number;
  findings: IntegrityFinding[];
}> {
  const rootDir = options?.rootDir ?? ROOT;
  const persist = options?.persist ?? true;
  const findings: IntegrityFinding[] = [];

  for (const dir of ['exports', 'backups']) {
    const abs = path.join(/*turbopackIgnore: true*/ rootDir, dir);
    findings.push({
      checkName: `dir_${dir}`,
      category: 'deterministic_directories',
      severity: existsSync(/*turbopackIgnore: true*/ abs) ? 'INFO' : 'WARN',
      status: existsSync(/*turbopackIgnore: true*/ abs) ? 'HEALTHY' : 'REPAIRABLE',
      detail: existsSync(/*turbopackIgnore: true*/ abs)
        ? `Directory /${dir} exists.`
        : `Generated output directory /${dir} is missing and can be safely created.`,
      safeArtifactTarget: dir,
    });
  }

  const envExPath = path.join(/*turbopackIgnore: true*/ rootDir, '.env.example');
  const envExExists = existsSync(/*turbopackIgnore: true*/ envExPath);
  const envExContent = envExExists ? readFileSync(envExPath, 'utf8') : '';
  const envExOk = envExExists && envExContent.includes('ALOAPI_VAULT_KEY') && envExContent.includes('DATABASE_URL');
  findings.push({
    checkName: 'template_env_example',
    category: 'deterministic_templates',
    severity: envExOk ? 'INFO' : 'WARN',
    status: envExOk ? 'HEALTHY' : 'REPAIRABLE',
    detail: envExOk
      ? '.env.example template intact with zero secrets.'
      : '.env.example template missing or corrupted; safe backup-first regeneration available.',
    safeArtifactTarget: '.env.example',
  });

  // Check package.json & dependencies manifest without mutating user-modified configuration
  const pkgPath = path.join(/*turbopackIgnore: true*/ rootDir, 'package.json');
  let pkgValid = false;
  let depsPresent = false;
  if (existsSync(/*turbopackIgnore: true*/ pkgPath)) {
    try {
      const parsed = JSON.parse(readFileSync(pkgPath, 'utf8')) as { dependencies?: Record<string, string> };
      pkgValid = Boolean(
        parsed &&
        typeof parsed === 'object' &&
        parsed.dependencies?.next &&
        parsed.dependencies?.['@prisma/client'] &&
        parsed.dependencies?.['@prisma/adapter-libsql'],
      );
      depsPresent = existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ rootDir, 'node_modules', '@prisma', 'client'));
    } catch {
      pkgValid = false;
    }
  }
  findings.push({
    checkName: 'package_manifest',
    category: 'invalid_configuration',
    severity: pkgValid ? 'INFO' : 'CRITICAL',
    status: pkgValid ? 'HEALTHY' : 'REQUIRES_OWNER_APPROVAL',
    detail: pkgValid
      ? 'package.json manifest valid with required runtime packages.'
      : 'package.json missing, invalid JSON, or missing core runtime dependencies; owner approval required.',
  });
  findings.push({
    checkName: 'runtime_dependencies',
    category: 'missing_dependency',
    severity: depsPresent ? 'INFO' : 'CRITICAL',
    status: depsPresent ? 'HEALTHY' : 'REQUIRES_OWNER_APPROVAL',
    detail: depsPresent
      ? 'Installed node_modules/@prisma/client detected.'
      : 'node_modules/@prisma/client missing; run npm ci && npm run db:generate.',
  });

  const migBase = path.join(/*turbopackIgnore: true*/ rootDir, 'prisma', 'migrations');
  const migrations = [
    '20261115000000_baseline/migration.sql',
    '20261115000100_security_integrations/migration.sql',
    '20261116000200_autonomous_onboarding_intelligence/migration.sql',
  ];
  for (const rel of migrations) {
    const abs = path.join(/*turbopackIgnore: true*/ migBase, rel);
    if (!existsSync(/*turbopackIgnore: true*/ abs)) {
      findings.push({
        checkName: `migration_${rel}`,
        category: 'migrations',
        severity: 'CRITICAL',
        status: 'REQUIRES_OWNER_APPROVAL',
        detail: `Migration file missing: prisma/migrations/${rel}. Manual review required.`,
      });
    } else {
      const sql = readFileSync(abs, 'utf8');
      const unsafe = /\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i.test(sql);
      findings.push({
        checkName: `migration_${rel}`,
        category: 'migrations',
        severity: unsafe ? 'CRITICAL' : 'INFO',
        status: unsafe ? 'REQUIRES_OWNER_APPROVAL' : 'HEALTHY',
        detail: unsafe
          ? `Destructive SQL detected in ${rel}; blocked from auto-repair.`
          : `Additive migration ${rel} verified intact.`,
      });
    }
  }

  const docAudit = auditCatalogDocumentation();
  findings.push({
    checkName: 'catalog_https_urls',
    category: 'catalog',
    severity: docAudit.issues.length ? 'WARN' : 'INFO',
    status: docAudit.issues.length ? 'REQUIRES_OWNER_APPROVAL' : 'HEALTHY',
    detail: `${docAudit.validUrlProviders}/${docAudit.totalProviders} providers carry valid HTTPS documentation links.`,
  });

  const vaultOk = Boolean(process.env.ALOAPI_VAULT_KEY && Buffer.byteLength(process.env.ALOAPI_VAULT_KEY, 'utf8') >= 32);
  findings.push({
    checkName: 'vault_key_configuration',
    category: 'security',
    severity: vaultOk ? 'INFO' : 'CRITICAL',
    status: vaultOk ? 'HEALTHY' : 'REQUIRES_OWNER_APPROVAL',
    detail: vaultOk
      ? 'ALOAPI_VAULT_KEY active; encrypted storage operational.'
      : 'ALOAPI_VAULT_KEY missing or weak; owner must configure .env (never auto-overwritten).',
  });

  if (persist) {
    for (const f of findings) {
      await db.systemIntegrityRecord.create({
        data: {
          checkType: f.category,
          target: f.safeArtifactTarget || f.checkName,
          severity: f.severity.toLowerCase(),
          status: f.status,
          detail: f.detail,
          repaired: false,
          requiresApproval: f.status === 'REQUIRES_OWNER_APPROVAL',
        },
      });
    }

    await auditEvent({
      actor,
      action: 'system.integrity.check',
      target: 'workspace',
      metadata: {
        total: findings.length,
        repairable: findings.filter(f => f.status === 'REPAIRABLE').length,
        approvalRequired: findings.filter(f => f.status === 'REQUIRES_OWNER_APPROVAL').length,
      },
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    healthyCount: findings.filter(f => f.status === 'HEALTHY').length,
    repairableCount: findings.filter(f => f.status === 'REPAIRABLE').length,
    approvalRequiredCount: findings.filter(f => f.status === 'REQUIRES_OWNER_APPROVAL').length,
    findings,
  };
}

export async function runSafeIntegrityRepair(params: {
  targets: string[];
  actor: string;
  rootDir?: string;
  persist?: boolean;
}) {
  const rootDir = params.rootDir ?? ROOT;
  const persist = params.persist ?? true;
  const results: {
    target: string;
    repaired: boolean;
    verifiedAfterRepair: boolean;
    backupPath: string | null;
    verificationHash: string | null;
    message: string;
  }[] = [];

  for (const rawTarget of params.targets) {
    const clean = rawTarget.replace(/\\/g, '/').replace(/^\/+/, '');
    if (clean.includes('..') || isProtectedPath(clean)) {
      results.push({
        target: rawTarget,
        repaired: false,
        verifiedAfterRepair: false,
        backupPath: null,
        verificationHash: null,
        message: 'Refused: protected or unsafe path. Owner manual intervention required.',
      });
      continue;
    }

    if (clean === 'exports' || clean === 'backups') {
      const abs = path.join(/*turbopackIgnore: true*/ rootDir, clean);
      mkdirSync(abs, { recursive: true });
      const verified = existsSync(/*turbopackIgnore: true*/ abs);
      if (persist) {
        await db.systemIntegrityRecord.create({
          data: {
            checkType: 'deterministic_directories',
            target: clean,
            severity: 'info',
            status: 'REPAIRED',
            detail: `Created deterministic workspace directory /${clean}.`,
            repaired: true,
            verifiedAfterRepair: verified,
          },
        });
      }
      results.push({
        target: clean,
        repaired: true,
        verifiedAfterRepair: verified,
        backupPath: null,
        verificationHash: null,
        message: `Created /${clean} cleanly.`,
      });
      continue;
    }

    if (clean === '.env.example') {
      const abs = path.join(/*turbopackIgnore: true*/ rootDir, '.env.example');
      let backupPath: string | null = null;
      if (existsSync(/*turbopackIgnore: true*/ abs)) {
        const backupDir = path.join(/*turbopackIgnore: true*/ rootDir, 'backups', 'integrity');
        mkdirSync(backupDir, { recursive: true });
        backupPath = path.join('backups', 'integrity', `env.example.${Date.now()}.bak`);
        copyFileSync(abs, path.join(/*turbopackIgnore: true*/ rootDir, backupPath));
      }
      const nextContent = buildDeterministicEnvExample();
      writeFileSync(abs, nextContent, 'utf8');
      const written = readFileSync(abs, 'utf8');
      const verificationHash = createHash('sha256').update(written).digest('hex');
      const verified = written.includes('ALOAPI_VAULT_KEY') && written.includes('DATABASE_URL');

      if (persist) {
        await db.systemIntegrityRecord.create({
          data: {
            checkType: 'deterministic_templates',
            target: '.env.example',
            severity: 'info',
            status: 'REPAIRED',
            detail: 'Backed up and repaired .env.example template; verified SHA-256.',
            repaired: true,
            backupPath,
            verifiedAfterRepair: verified,
          },
        });
      }

      results.push({
        target: clean,
        repaired: true,
        verifiedAfterRepair: verified,
        backupPath,
        verificationHash,
        message: 'Backed up existing file and regenerated secret-free .env.example.',
      });
      continue;
    }

    results.push({
      target: rawTarget,
      repaired: false,
      verifiedAfterRepair: false,
      backupPath: null,
      verificationHash: null,
      message: 'No safe deterministic repair rule registered for this target; owner review required.',
    });
  }

  if (persist) {
    await auditEvent({
      actor: params.actor,
      action: 'system.integrity.repair',
      target: params.targets.join(','),
      metadata: { repairedCount: results.filter(r => r.repaired).length },
    });
  }

  return results;
}
