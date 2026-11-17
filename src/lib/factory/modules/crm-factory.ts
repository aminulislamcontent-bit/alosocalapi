import { db } from '@/lib/db';
import { auditEvent } from '@/lib/security/audit';

export const FACTORY_CRM_STAGES = [
  'discovered',
  'qualified',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;

export type FactoryCrmStage = (typeof FACTORY_CRM_STAGES)[number];

/**
 * First-Party AI CRM & Sales Automation.
 * Explicitly isolated from legacy Marketing CRM tables; never alters legacy CRM data.
 */
export async function createCrmOrganization(params: {
  workspaceId: string;
  name: string;
  domain?: string;
  industry?: string;
  countryCode?: string;
  sizeBand?: string;
  notes?: string;
  actor?: string;
}) {
  const actor = params.actor || 'system';
  return db.factoryCrmOrganization.upsert({
    where: { workspaceId_name: { workspaceId: params.workspaceId, name: params.name.trim() } },
    update: {
      domain: params.domain?.trim(),
      industry: params.industry?.trim(),
      countryCode: params.countryCode?.trim().toUpperCase(),
      sizeBand: params.sizeBand,
      notes: params.notes,
    },
    create: {
      workspaceId: params.workspaceId,
      name: params.name.trim(),
      domain: params.domain?.trim(),
      industry: params.industry?.trim(),
      countryCode: params.countryCode?.trim().toUpperCase(),
      sizeBand: params.sizeBand,
      ownerUsername: actor,
      notes: params.notes,
    },
  });
}

export async function createCrmContact(params: {
  workspaceId: string;
  organizationId?: string;
  fullName: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  source?: string;
  consentStatus?: 'not_collected' | 'granted' | 'refused';
  assignedTo?: string;
  tags?: string[];
  nextFollowUpAt?: string;
  actor?: string;
}) {
  const actor = params.actor || 'system';
  const contact = await db.factoryCrmContact.create({
    data: {
      workspaceId: params.workspaceId,
      organizationId: params.organizationId || null,
      fullName: params.fullName.trim(),
      email: params.email?.trim().toLowerCase() || null,
      phone: params.phone?.trim() || null,
      jobTitle: params.jobTitle?.trim() || null,
      source: params.source || 'direct',
      consentStatus: params.consentStatus || 'not_collected',
      assignedTo: params.assignedTo || actor,
      tags: JSON.stringify(params.tags ?? []),
      nextFollowUpAt: params.nextFollowUpAt ? new Date(params.nextFollowUpAt) : null,
    },
  });

  await db.factoryCrmActivity.create({
    data: {
      workspaceId: params.workspaceId,
      contactId: contact.id,
      activityType: 'contact_created',
      subject: `Contact created: ${contact.fullName}`,
      body: `Source: ${contact.source}, Consent: ${contact.consentStatus}`,
      actor,
    },
  });

  return contact;
}

export async function createCrmOpportunity(params: {
  workspaceId: string;
  organizationId?: string;
  contactId?: string;
  title: string;
  pipeline?: string;
  stage?: FactoryCrmStage;
  valueUsd?: number;
  probability?: number;
  assignedTo?: string;
  nextFollowUpAt?: string;
  actor?: string;
}) {
  const actor = params.actor || 'system';
  const stage: FactoryCrmStage = params.stage && FACTORY_CRM_STAGES.includes(params.stage)
    ? params.stage
    : 'qualified';

  const opp = await db.factoryCrmOpportunity.create({
    data: {
      workspaceId: params.workspaceId,
      organizationId: params.organizationId || null,
      contactId: params.contactId || null,
      title: params.title.trim(),
      pipeline: params.pipeline || 'default',
      stage,
      valueUsd: Number(params.valueUsd ?? 0),
      probability: Math.min(100, Math.max(0, Number(params.probability ?? 25))),
      status: stage === 'closed_won' ? 'won' : stage === 'closed_lost' ? 'lost' : 'open',
      assignedTo: params.assignedTo || actor,
      nextFollowUpAt: params.nextFollowUpAt ? new Date(params.nextFollowUpAt) : null,
    },
  });

  await db.factoryCrmActivity.create({
    data: {
      workspaceId: params.workspaceId,
      contactId: opp.contactId,
      opportunityId: opp.id,
      activityType: 'opportunity_created',
      subject: `Opportunity opened: ${opp.title}`,
      body: `Stage=${opp.stage}, Value=$${opp.valueUsd}`,
      actor,
    },
  });

  await auditEvent({
    actor,
    action: 'factory.crm.opportunity.create',
    target: `${params.workspaceId}:${opp.id}`,
    metadata: { stage: opp.stage, valueUsd: opp.valueUsd },
  });

  return opp;
}

export async function updateCrmOpportunityStage(params: {
  workspaceId: string;
  opportunityId: string;
  stage: FactoryCrmStage;
  assignedTo?: string;
  nextFollowUpAt?: string;
  note?: string;
  actor?: string;
}) {
  const actor = params.actor || 'system';
  if (!FACTORY_CRM_STAGES.includes(params.stage)) {
    throw new Error(`Invalid pipeline stage: ${params.stage}`);
  }
  const existing = await db.factoryCrmOpportunity.findFirst({
    where: { id: params.opportunityId, workspaceId: params.workspaceId },
  });
  if (!existing) throw new Error('Opportunity not found in workspace.');

  const status = params.stage === 'closed_won' ? 'won' : params.stage === 'closed_lost' ? 'lost' : 'open';
  const probability =
    params.stage === 'closed_won'
      ? 100
      : params.stage === 'closed_lost'
        ? 0
        : params.stage === 'negotiation'
          ? 75
          : params.stage === 'proposal'
            ? 50
            : 25;

  const updated = await db.factoryCrmOpportunity.update({
    where: { id: existing.id },
    data: {
      stage: params.stage,
      status,
      probability,
      assignedTo: params.assignedTo ?? existing.assignedTo,
      nextFollowUpAt: params.nextFollowUpAt ? new Date(params.nextFollowUpAt) : existing.nextFollowUpAt,
    },
  });

  await db.factoryCrmActivity.create({
    data: {
      workspaceId: params.workspaceId,
      contactId: updated.contactId,
      opportunityId: updated.id,
      activityType: 'stage_change',
      subject: `Stage moved: ${existing.stage} -> ${params.stage}`,
      body: params.note || `Updated by ${actor}`,
      actor,
    },
  });

  await auditEvent({
    actor,
    action: 'factory.crm.opportunity.stage',
    target: `${params.workspaceId}:${updated.id}`,
    metadata: { from: existing.stage, to: params.stage },
  });

  return updated;
}

export async function logCrmActivity(params: {
  workspaceId: string;
  contactId?: string;
  opportunityId?: string;
  activityType: string;
  subject: string;
  body: string;
  dueAt?: string;
  actor: string;
}) {
  return db.factoryCrmActivity.create({
    data: {
      workspaceId: params.workspaceId,
      contactId: params.contactId || null,
      opportunityId: params.opportunityId || null,
      activityType: params.activityType,
      subject: params.subject.trim(),
      body: params.body.trim(),
      actor: params.actor,
      dueAt: params.dueAt ? new Date(params.dueAt) : null,
    },
  });
}

export async function getCrmWorkspaceSummary(workspaceId: string) {
  const [orgs, contacts, opportunities, activities] = await Promise.all([
    db.factoryCrmOrganization.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.factoryCrmContact.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, take: 200 }),
    db.factoryCrmOpportunity.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, take: 200 }),
    db.factoryCrmActivity.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);

  const pipelineTotals = FACTORY_CRM_STAGES.reduce<Record<string, { count: number; valueUsd: number }>>((acc, s) => {
    acc[s] = { count: 0, valueUsd: 0 };
    return acc;
  }, {});
  for (const opp of opportunities) {
    const bucket = pipelineTotals[opp.stage] || { count: 0, valueUsd: 0 };
    bucket.count += 1;
    bucket.valueUsd += opp.valueUsd;
    pipelineTotals[opp.stage] = bucket;
  }

  return { orgs, contacts, opportunities, activities, pipelineTotals };
}
