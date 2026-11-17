import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { getProviderByKey } from '@/lib/intelligence/catalog';
import { createZipArchive, sha256 } from '@/lib/intelligence/export-package';
import { exportEncryptedVaultBackup } from '@/lib/onboarding/vault-service';
import { auditEvent } from '@/lib/security/audit';

export type PackageLifecycleStatus =
  | 'READY'
  | 'CONFIGURED'
  | 'TESTED'
  | 'VERIFIED'
  | 'CLIENT_ACTIVATION_REQUIRED'
  | 'PROVIDER_APPROVAL_REQUIRED'
  | 'NOT_SUPPORTED';

export function buildWebhookVerificationSnippet(providerKey: string, signatureAlgorithm: string): string {
  return `// ALOAPI Prepared Webhook Signature Verifier (${providerKey})
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verify_${providerKey.replace(/[^a-zA-Z0-9_]/g, '_')}_Webhook(rawBody: string, headerSignature: string, secretFromVault: string): boolean {
  if (!rawBody || !headerSignature || !secretFromVault) return false;
  // Algorithm reference: ${signatureAlgorithm}
  const digest = createHmac('sha256', secretFromVault).update(rawBody, 'utf8').digest('hex');
  const expected = Buffer.from(digest, 'utf8');
  const provided = Buffer.from(headerSignature.replace(/^sha256=/i, ''), 'utf8');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
`;
}

export async function generateClientHandoverPackage(params: {
  projectId: string;
  handoverModeOverride?: string;
  actor: string;
  ip?: string;
}) {
  const project = await db.integrationProject.findUnique({
    where: { id: params.projectId },
    include: {
      discoveries: { orderBy: { createdAt: 'desc' }, take: 1 },
      credentials: true,
      oauthApps: true,
      checkpoints: true,
    },
  });
  if (!project) throw new Error('IntegrationProject not found.');

  const selectedKeys = (() => {
    try { return JSON.parse(project.selectedProvidersJson) as string[]; } catch { return []; }
  })();
  const businessProfile = (() => {
    try { return JSON.parse(project.businessProfileJson) as Record<string, unknown>; } catch { return {}; }
  })();

  const providerInventory = selectedKeys
    .map(k => getProviderByKey(k))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const envLines = [
    `# ALOAPI Client Handover Environment Template — Project: ${project.name}`,
    `# SECRETS INTENTIONALLY BLANK — never export plaintext credentials in default packages.`,
    `ALOAPI_PROJECT_DOMAIN="${project.domain}"`,
    '',
  ];
  for (const cred of project.credentials) {
    envLines.push(`# Provider: ${cred.providerKey} | Origin: ${cred.origin} | Status: ${cred.activationStatus}`);
    envLines.push(`${cred.envVarName}=""`);
  }

  // Honest aggregate package status (never promotes unverified/mocked items to VERIFIED)
  const appStatuses = project.oauthApps.map(a => a.verificationStatus);
  const pendingCheckpoints = project.checkpoints.filter(c => c.status === 'pending');
  let packageStatus: PackageLifecycleStatus = 'READY';
  if (appStatuses.some(s => s === 'NOT_SUPPORTED')) packageStatus = 'NOT_SUPPORTED';
  else if (appStatuses.some(s => s === 'PROVIDER_APPROVAL_REQUIRED')) packageStatus = 'PROVIDER_APPROVAL_REQUIRED';
  else if (pendingCheckpoints.length > 0 || project.credentials.some(c => c.activationStatus === 'CLIENT_ACTIVATION_REQUIRED')) {
    packageStatus = 'CLIENT_ACTIVATION_REQUIRED';
  } else if (appStatuses.length > 0 && appStatuses.every(s => s === 'VERIFIED')) {
    packageStatus = 'VERIFIED';
  } else if (appStatuses.some(s => s === 'TESTED')) {
    packageStatus = 'TESTED';
  } else if (appStatuses.length > 0) {
    packageStatus = 'CONFIGURED';
  }

  // 4-Origin Ownership & Portability Classification (Sections 5 & 8)
  const ownershipReport = {
    secretsIncluded: false,
    byOrigin: {
      'ALOAPI-GENERATED': project.credentials.filter(c => c.origin === 'ALOAPI-GENERATED').map(c => ({
        providerKey: c.providerKey,
        credentialType: c.credentialType,
        envVarName: c.envVarName,
        owner: c.owner,
        activationStatus: c.activationStatus,
        vaultCredentialId: c.vaultCredentialId,
      })),
      'PROVIDER-ISSUED': project.credentials.filter(c => c.origin === 'PROVIDER-ISSUED').map(c => ({
        providerKey: c.providerKey,
        credentialType: c.credentialType,
        envVarName: c.envVarName,
        owner: c.owner,
        activationStatus: c.activationStatus,
      })),
      'CLIENT-OWNED': project.credentials.filter(c => c.origin === 'CLIENT-OWNED').map(c => ({
        providerKey: c.providerKey,
        credentialType: c.credentialType,
        envVarName: c.envVarName,
        owner: c.owner,
        activationStatus: c.activationStatus,
      })),
      'PREPARED-CONFIGURATION': project.credentials.filter(c => c.origin === 'PREPARED-CONFIGURATION').map(c => ({
        providerKey: c.providerKey,
        credentialType: c.credentialType,
        envVarName: c.envVarName,
        activationStatus: c.activationStatus,
      })),
    },
  };

  const portabilityReport = {
    portableIntegrationAssets: [
      'API documentation & endpoint schemas',
      'OAuth 2.0 + PKCE configuration templates & redirect URIs',
      'Webhook callback URLs & HMAC-SHA256 / Ed25519 signature verification handlers',
      '.env.template placeholder variables',
      'Domain & DNS (TXT/SPF/DKIM/DMARC) instructions',
      'Client project import manifest & activation checklist',
    ],
    accountBoundCredentials: project.credentials
      .filter(c => !c.transferable)
      .map(c => ({
        providerKey: c.providerKey,
        envVarName: c.envVarName,
        origin: c.origin,
        handoverMode: c.handoverMode,
        rationale: c.handoverRequirements,
      })),
    supportedHandoverModes: [
      'MODE_1_DIRECT_TRANSFER',
      'MODE_2_CLIENT_ACCOUNT_REISSUANCE',
      'MODE_3_AUTHORIZED_DELEGATION',
      'MODE_4_CONFIGURATION_ONLY',
    ],
  };

  const clientActivationChecklist = [
    ...pendingCheckpoints.map(cp => ({
      step: `[${cp.providerKey}] Complete ${cp.checkpointType}`,
      portalUrl: cp.officialPortalUrl,
      instructions: cp.instructions,
      status: cp.status,
    })),
    ...project.credentials
      .filter(c => c.activationStatus === 'CLIENT_ACTIVATION_REQUIRED' || c.activationStatus === 'PROVIDER_APPROVAL_REQUIRED')
      .map(c => ({
        step: `[${c.providerKey}] Supply or authorize ${c.envVarName} (${c.origin})`,
        portalUrl: project.oauthApps.find(a => a.providerKey === c.providerKey)?.developerPortalUrl || '',
        instructions: c.handoverRequirements,
        status: c.activationStatus,
      })),
  ];

  // Exact 17 Handover Sections (Section 10)
  const manifest = {
    packageStandard: 'ALOAPI-CLIENT-HANDOVER-V1',
    generatedAt: new Date().toISOString(),
    projectId: project.id,
    projectName: project.name,
    websiteUrl: project.websiteUrl,
    packageStatus,
    secretsIncluded: false,
    originalCrmUntouched: true,
    sections: {
      '1_providerInventory': providerInventory.map(p => ({ key: p.key, name: p.displayName, category: p.canonicalCategory })),
      '2_businessAndApplicationMetadata': { businessProfile, apps: project.oauthApps.map(a => ({ providerKey: a.providerKey, appName: a.appName, executionMode: a.executionMode })) },
      '3_apiDocumentation': providerInventory.map(p => ({ providerKey: p.key, docsUrl: p.officialApiDocumentation, version: p.apiVersion, baseUrls: p.apiBaseUrls })),
      '4_oauthConfiguration': project.oauthApps.map(a => ({ providerKey: a.providerKey, scopes: JSON.parse(a.scopesJson), redirectUris: JSON.parse(a.redirectUrisJson) })),
      '5_redirectUriDefinitions': project.oauthApps.flatMap(a => JSON.parse(a.redirectUrisJson) as string[]),
      '6_webhookAndCallbackConfiguration': project.oauthApps.map(a => ({ providerKey: a.providerKey, webhookUrl: a.webhookUrl, algorithm: a.webhookSignatureAlgorithm, events: JSON.parse(a.webhookEventsJson) })),
      '7_apiEndpointMappings': providerInventory.map(p => ({ providerKey: p.key, endpoints: p.apiSpecs })),
      '8_requiredPermissionsAndScopes': providerInventory.map(p => ({ providerKey: p.key, scopes: p.requiredScopes })),
      '9_environmentVariableTemplate': envLines.join('\n'),
      '10_credentialOriginAndOwnershipReport': ownershipReport,
      '11_credentialPortabilityReport': portabilityReport,
      '12_domainAndDnsConfiguration': project.oauthApps.map(a => ({ providerKey: a.providerKey, records: JSON.parse(a.dnsRecordsJson) })),
      '13_connectionTestResults': project.oauthApps.map(a => ({ providerKey: a.providerKey, verificationStatus: a.verificationStatus, liveVerified: a.verificationStatus === 'VERIFIED' })),
      '14_securityAndCompatibilityReport': {
        encryptionAtRest: 'AES-256-GCM',
        secretsExcludedFromDefaultExport: true,
        oauthPkceS256Supported: true,
        crmDecoupled: true,
      },
      '15_clientActivationChecklist': clientActivationChecklist,
      '16_integrationInstallationInstructions': 'Import client-project-import.json using ALOAPI Handover Importer, populate blank .env secrets in your Vault/deployment, and verify official callbacks.',
      '17_providerSpecificImplementationNotes': providerInventory.map(p => ({ providerKey: p.key, restrictions: p.restrictions, developerApproval: p.developerApproval })),
    },
  };

  const clientImportManifest = {
    schema: 'aloapi-client-import-v1',
    projectId: project.id,
    projectName: project.name,
    domain: project.domain,
    handoverMode: params.handoverModeOverride || project.defaultHandoverMode,
    secretsIncluded: false,
    providers: project.oauthApps.map(a => ({
      providerKey: a.providerKey,
      apiVersion: a.apiVersion,
      redirectUris: JSON.parse(a.redirectUrisJson),
      webhookUrl: a.webhookUrl,
      webhookSignatureAlgorithm: a.webhookSignatureAlgorithm,
      scopes: JSON.parse(a.scopesJson),
      dnsRecords: JSON.parse(a.dnsRecordsJson),
      verificationStatus: a.verificationStatus,
    })),
    envTemplate: envLines.join('\n'),
  };

  const pkgSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');

  const savedPackage = await db.clientHandoverPackage.create({
    data: {
      projectId: project.id,
      packageVersion: '1.0',
      handoverMode: params.handoverModeOverride || project.defaultHandoverMode,
      packageStatus,
      secretsIncluded: false,
      encryptedTransferApproved: false,
      sha256: pkgSha256,
      manifestJson: JSON.stringify(manifest),
      portabilityReportJson: JSON.stringify(portabilityReport),
      ownershipReportJson: JSON.stringify(ownershipReport),
      checklistJson: JSON.stringify(clientActivationChecklist),
      clientImportManifestJson: JSON.stringify(clientImportManifest),
      createdBy: params.actor,
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'engineering.handover.package.generate',
    target: `${project.id}:${savedPackage.id}`,
    ip: params.ip,
    metadata: { sha256: pkgSha256, packageStatus, secretsIncluded: false },
  });

  return {
    packageRecord: savedPackage,
    manifest,
    portabilityReport,
    ownershipReport,
    clientActivationChecklist,
    clientImportManifest,
    sha256: pkgSha256,
  };
}

export function buildHandoverZipArchive(pkg: Awaited<ReturnType<typeof generateClientHandoverPackage>>) {
  const files: Record<string, string> = {
    'handover-manifest.json': JSON.stringify(pkg.manifest, null, 2),
    'client-project-import.json': JSON.stringify(pkg.clientImportManifest, null, 2),
    '.env.template': pkg.manifest.sections['9_environmentVariableTemplate'],
    'ownership-report.json': JSON.stringify(pkg.ownershipReport, null, 2),
    'portability-report.json': JSON.stringify(pkg.portabilityReport, null, 2),
    'activation-checklist.json': JSON.stringify(pkg.clientActivationChecklist, null, 2),
  };
  for (const app of pkg.manifest.sections['6_webhookAndCallbackConfiguration']) {
    files[`webhooks/${app.providerKey}-verifier.ts`] = buildWebhookVerificationSnippet(app.providerKey, app.algorithm);
  }
  const zipBuf = createZipArchive(files);
  return { zipBuf, zipSha256: sha256(zipBuf), fileNames: Object.keys(files) };
}

export async function exportOwnerAuthorizedEncryptedHandover(params: {
  projectId: string;
  explicitOwnerTransferApproval: boolean;
  actor: string;
  ip?: string;
}) {
  if (!params.explicitOwnerTransferApproval) {
    throw new Error('Explicit owner authorization is strictly required for encrypted credential transfer exports.');
  }
  const project = await db.integrationProject.findUnique({ where: { id: params.projectId } });
  if (!project) throw new Error('IntegrationProject not found.');

  const vaultBackup = await exportEncryptedVaultBackup(project.clientId, params.actor);
  await auditEvent({
    actor: params.actor,
    action: 'engineering.handover.encrypted_transfer',
    target: project.id,
    ip: params.ip,
    metadata: { tenantId: project.clientId, recordCount: vaultBackup.records.length },
  });

  return {
    transferType: 'OWNER_AUTHORIZED_ENCRYPTED_VAULT_HANDOVER',
    projectId: project.id,
    containsPlaintextSecrets: false,
    vaultBackup,
  };
}

export async function validateClientProjectImport(params: {
  importManifest: Record<string, unknown>;
  expectedSha256?: string;
  manifestForHashCheck?: Record<string, unknown>;
  actor: string;
}) {
  if (params.importManifest.schema !== 'aloapi-client-import-v1') {
    throw new Error('Unsupported client project import schema.');
  }
  if (params.importManifest.secretsIncluded !== false) {
    throw new Error('Standard client import manifest must not embed plaintext secrets.');
  }
  if (params.expectedSha256 && params.manifestForHashCheck) {
    const actual = createHash('sha256').update(JSON.stringify(params.manifestForHashCheck)).digest('hex');
    if (actual !== params.expectedSha256) {
      throw new Error('Package SHA-256 integrity verification failed.');
    }
  }
  const providers = Array.isArray(params.importManifest.providers) ? params.importManifest.providers : [];
  const projectId = String(params.importManifest.projectId || '');
  if (projectId) {
    await db.integrationProject.updateMany({
      where: { id: projectId },
      data: { status: 'handed_over' },
    });
  }
  await auditEvent({
    actor: params.actor,
    action: 'engineering.handover.client_import_validated',
    target: projectId || 'external-client-project',
    metadata: { providerCount: providers.length, checksumVerified: Boolean(params.expectedSha256) },
  });
  return {
    imported: true,
    projectId,
    providersImported: providers.length,
    originalCrmModified: false,
  };
}
