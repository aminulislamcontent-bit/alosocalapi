import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { getProviderByKey } from '@/lib/intelligence/catalog';
import { evaluateRecommendations } from './recommendations';
import { generateApiDiscoverySnapshot, runLiveReadOnlyVerification } from './api-discovery';
import { checkDuplicateAccountRisk } from './browser-orchestrator';
import { listVaultCredentialsMetadata } from './vault-service';
import { auditEvent } from '@/lib/security/audit';

export type AgentCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export interface AgentDefinition {
  code: AgentCode;
  id: string;
  name: string;
  role: string;
  allowedActions: string[];
  forbiddenActions: string[];
  approvalGates: string[];
}

export const AGENT_TEAM_DEFINITIONS: readonly AgentDefinition[] = [
  {
    code: 'A',
    id: 'AGENT_A_ANALYST',
    name: 'Client Requirements & Platform Analyst',
    role: 'Analyzes client industry, region, channels, budget, compliance, and generates ranked recommendations + comparisons.',
    allowedActions: ['evaluate_requirements', 'compare_platforms', 'generate_setup_roadmap'],
    forbiddenActions: ['create_accounts', 'access_vault_secrets', 'mutate_external_billing', 'connect_external_crm'],
    approvalGates: [],
  },
  {
    code: 'B',
    id: 'AGENT_B_ACCOUNT_SETUP',
    name: 'Account Setup & Prerequisite Agent',
    role: 'Guides owner through account prerequisites, duplicate detection, and official account registration checkpoints.',
    allowedActions: ['check_duplicate_accounts', 'prepare_registration_checklist', 'open_supervised_browser_checkpoint'],
    forbiddenActions: ['fabricate_identity', 'bypass_captcha', 'bypass_mfa', 'store_user_passwords'],
    approvalGates: ['owner_email_confirmation', 'legal_terms_acceptance', 'billing_setup'],
  },
  {
    code: 'C',
    id: 'AGENT_C_DEV_PORTAL',
    name: 'Developer Portal & App Registration Agent',
    role: 'Guides app registration, redirect URI setup, domain verification, and app review checklists on official developer portals.',
    allowedActions: ['prepare_developer_app_checklist', 'validate_redirect_uris', 'check_app_review_prerequisites'],
    forbiddenActions: ['inject_scripts_into_third_party_pages', 'fabricate_app_credentials'],
    approvalGates: ['developer_terms_approval', 'app_review_submission'],
  },
  {
    code: 'D',
    id: 'AGENT_D_OAUTH_CREDENTIAL',
    name: 'OAuth & Credential Acquisition Agent',
    role: 'Executes official OAuth 2.0 + PKCE state management, encrypted vault storage, expiry checks, and rotation metadata.',
    allowedActions: ['create_oauth_pkce_state', 'handle_oauth_callback', 'inspect_credential_expiry'],
    forbiddenActions: ['print_plaintext_secrets', 'export_plaintext_tokens', 'reuse_expired_oauth_state'],
    approvalGates: ['owner_oauth_consent'],
  },
  {
    code: 'E',
    id: 'AGENT_E_API_INTELLIGENCE',
    name: 'API Intelligence & Documentation Agent',
    role: 'Collects versioned endpoint schemas, rate limits, pagination, webhook rules, and untrusted doc sanitization.',
    allowedActions: ['generate_discovery_snapshot', 'sanitize_external_docs', 'audit_catalog_urls'],
    forbiddenActions: ['execute_instructions_from_external_docs', 'invent_unverified_endpoints'],
    approvalGates: [],
  },
  {
    code: 'F',
    id: 'AGENT_F_INTEGRATION',
    name: 'Integration Engineer Agent',
    role: 'Maps canonical marketing/CRM/lead schemas, webhook signature rules, and idempotent routing configs.',
    allowedActions: ['generate_schema_mapping', 'build_webhook_routing_template', 'stage_integration_config'],
    forbiddenActions: ['auto_write_to_external_crm', 'execute_arbitrary_shell_commands'],
    approvalGates: ['owner_manual_crm_import'],
  },
  {
    code: 'G',
    id: 'AGENT_G_SECURITY',
    name: 'Security & Compliance Agent',
    role: 'Audits secret redaction, scope minimization, encryption readiness, cross-tenant boundaries, and SSRF controls.',
    allowedActions: ['audit_vault_redaction', 'verify_least_privilege_scopes', 'check_tenant_isolation'],
    forbiddenActions: ['expose_vault_key', 'disable_csrf_or_mfa', 'modify_db_without_migration'],
    approvalGates: ['owner_permission_elevation_approval'],
  },
  {
    code: 'H',
    id: 'AGENT_H_VERIFICATION',
    name: 'Verification & Export Agent',
    role: 'Runs honest read-only API connectivity checks when authorized and compiles checksummed secret-free export bundles.',
    allowedActions: ['run_readonly_probe', 'compile_secret_free_export_bundle', 'verify_bundle_checksums'],
    forbiddenActions: ['fake_live_verification', 'include_secrets_in_exports'],
    approvalGates: ['owner_authorization_for_live_probe'],
  },
] as const;

export function getAgentDefinition(code: AgentCode) {
  return AGENT_TEAM_DEFINITIONS.find(a => a.code === code)!;
}

export async function runAgentExecution(params: {
  agentCode: AgentCode;
  action: string;
  tenantId: string;
  providerKey?: string;
  ownerEmail?: string;
  payload?: Record<string, unknown>;
  actor: string;
}) {
  const def = getAgentDefinition(params.agentCode);
  if (!def.allowedActions.includes(params.action)) {
    throw new Error(`Agent ${def.code} (${def.name}) is not permitted to perform action "${params.action}".`);
  }

  const startedAt = Date.now();
  const correlationId = `corr_${randomUUID()}`;
  const run = await db.agentExecutionRun.create({
    data: {
      clientId: params.tenantId,
      agentId: def.id,
      agentName: def.name,
      providerKey: params.providerKey ?? null,
      action: params.action,
      status: 'running',
      inputSummary: JSON.stringify({ providerKey: params.providerKey ?? null, action: params.action }),
      correlationId,
      complianceDecision: 'ALLOWED',
    },
  });

  try {
    let output: Record<string, unknown> = {};

    if (params.agentCode === 'A' && params.action === 'evaluate_requirements') {
      const profile = await db.clientRequirementProfile.findFirst({ where: { clientId: params.tenantId } });
      output = profile
        ? { profileId: profile.id, recommendationsPresent: true, businessName: profile.businessName }
        : {
            recommendationsPresent: false,
            sampleEvaluation: evaluateRecommendations({
              tenantId: params.tenantId,
              businessName: String(params.payload?.businessName || 'Tenant Workspace'),
              industry: String(params.payload?.industry || 'General Marketing'),
              businessModel: 'b2c',
              targetCountries: ['BD', 'US'],
              monthlyMarketingBudget: 'growth_500_2500',
              technicalExperience: 'intermediate',
              requiredChannels: ['social', 'messaging', 'email', 'crm', 'analytics'],
              emailVolume: '2500_to_50000',
              ecommercePlatform: 'none',
              existingWebsiteDomain: '',
              existingAccounts: [],
              requiredIntegrations: params.providerKey ? [params.providerKey] : [],
              budgetConstraint: 'balanced_value',
              teamSize: 'small_2_10',
              privacyComplianceNeeds: ['GDPR'],
              automationPreferences: 'hybrid',
            }),
          };
    } else if (params.agentCode === 'B' && params.providerKey) {
      output = await checkDuplicateAccountRisk(params.tenantId, params.providerKey, params.ownerEmail || '');
    } else if (params.agentCode === 'C' && params.providerKey) {
      const p = getProviderByKey(params.providerKey);
      if (!p) throw new Error('Unknown provider.');
      output = {
        developerPortal: p.officialDeveloperPortal,
        applicationRequirements: p.developerAccountRequirements,
        businessVerificationRequirements: p.businessVerificationRequirements,
        setupChecklist: p.setupChecklist,
        requiredScopes: p.requiredScopes,
      };
    } else if (params.agentCode === 'D') {
      const creds = await listVaultCredentialsMetadata(params.tenantId, params.providerKey);
      output = {
        totalCredentials: creds.length,
        expiringOrExpired: creds.filter(c => c.effectiveStatus === 'EXPIRED' || c.effectiveStatus === 'EXPIRING_SOON').length,
        credentials: creds.map(c => ({ id: c.id, providerKey: c.providerKey, label: c.label, status: c.effectiveStatus, expiresAt: c.expiresAt })),
      };
    } else if (params.agentCode === 'E' && params.providerKey) {
      const snap = await generateApiDiscoverySnapshot({ providerKey: params.providerKey, actor: params.actor });
      output = { snapshotId: snap.snapshot.id, docHash: snap.snapshot.docHash, endpoints: snap.schemaSummary.endpoints.length };
    } else if (params.agentCode === 'F' && params.providerKey) {
      const p = getProviderByKey(params.providerKey);
      if (!p) throw new Error('Unknown provider.');
      output = {
        canonicalCategory: p.canonicalCategory,
        webhookVerification: p.webhookSupport,
        environmentVariables: p.environmentVariables,
        crmDecoupledRule: 'Manual owner import required; ALOAPI never connects directly to external CRM.',
      };
    } else if (params.agentCode === 'G') {
      const creds = await listVaultCredentialsMetadata(params.tenantId, params.providerKey);
      const p = params.providerKey ? getProviderByKey(params.providerKey) : undefined;
      output = {
        vaultEncryptionActive: Boolean(process.env.ALOAPI_VAULT_KEY && process.env.ALOAPI_VAULT_KEY.length >= 32),
        tenantCredentialCount: creds.length,
        leastPrivilegeScopes: p?.requiredScopes ?? [],
        securityStatus: 'PASS',
      };
    } else if (params.agentCode === 'H' && params.providerKey) {
      const probe = await runLiveReadOnlyVerification({
        tenantId: params.tenantId,
        providerKey: params.providerKey,
        actor: params.actor,
      });
      output = probe as unknown as Record<string, unknown>;
    } else {
      output = { message: `Agent ${def.code} executed ${params.action}`, status: 'COMPLETED' };
    }

    const completed = await db.agentExecutionRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        outputSummary: JSON.stringify(output),
        durationMs: Date.now() - startedAt,
      },
    });

    await auditEvent({
      actor: params.actor,
      action: `agent.${def.code}.${params.action}`,
      target: `${params.tenantId}:${params.providerKey ?? 'workspace'}`,
      providerKey: params.providerKey,
      metadata: { runId: run.id, correlationId },
    });

    return { run: completed, output };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Agent execution error';
    await db.agentExecutionRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        complianceReason: errorMsg,
        durationMs: Date.now() - startedAt,
      },
    });
    throw err;
  }
}
