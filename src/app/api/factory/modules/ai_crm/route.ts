import { NextRequest, NextResponse } from 'next/server';
import { requireFactoryAccess } from '@/lib/factory/tenancy';
import { getFirstPartyModule } from '@/lib/factory/modules/registry';
import {
  createCrmContact,
  createCrmOpportunity,
  createCrmOrganization,
  FACTORY_CRM_STAGES,
  getCrmWorkspaceSummary,
  logCrmActivity,
  updateCrmOpportunityStage,
  type FactoryCrmStage,
} from '@/lib/factory/modules/crm-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const access = await requireFactoryAccess(req, {
    workspaceId: req.nextUrl.searchParams.get('workspaceId'),
    permission: 'read',
  });
  if (!access.ok) return access.response;

  const summary = await getCrmWorkspaceSummary(access.workspaceId);
  return NextResponse.json({
    module: getFirstPartyModule('ai_crm'),
    workspaceId: access.workspaceId,
    stages: FACTORY_CRM_STAGES,
    ...summary,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const access = await requireFactoryAccess(req, {
    workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
    permission: 'write',
    requireCsrf: true,
  });
  if (!access.ok) return access.response;

  const action = String(body.action || '');
  try {
    if (action === 'create_org') {
      const organization = await createCrmOrganization({
        workspaceId: access.workspaceId,
        name: String(body.name || ''),
        domain: body.domain ? String(body.domain) : undefined,
        industry: body.industry ? String(body.industry) : undefined,
        countryCode: body.countryCode ? String(body.countryCode) : undefined,
        sizeBand: body.sizeBand ? String(body.sizeBand) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
        actor: access.user.username,
      });
      return NextResponse.json({ organization }, { status: 201 });
    }

    if (action === 'create_contact') {
      const contact = await createCrmContact({
        workspaceId: access.workspaceId,
        organizationId: body.organizationId ? String(body.organizationId) : undefined,
        fullName: String(body.fullName || ''),
        email: body.email ? String(body.email) : undefined,
        phone: body.phone ? String(body.phone) : undefined,
        jobTitle: body.jobTitle ? String(body.jobTitle) : undefined,
        source: body.source ? String(body.source) : 'direct',
        consentStatus: body.consentStatus ? (String(body.consentStatus) as 'not_collected' | 'granted' | 'refused') : 'not_collected',
        assignedTo: body.assignedTo ? String(body.assignedTo) : undefined,
        tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
        nextFollowUpAt: body.nextFollowUpAt ? String(body.nextFollowUpAt) : undefined,
        actor: access.user.username,
      });
      return NextResponse.json({ contact }, { status: 201 });
    }

    if (action === 'create_opportunity') {
      const opportunity = await createCrmOpportunity({
        workspaceId: access.workspaceId,
        organizationId: body.organizationId ? String(body.organizationId) : undefined,
        contactId: body.contactId ? String(body.contactId) : undefined,
        title: String(body.title || ''),
        pipeline: body.pipeline ? String(body.pipeline) : 'default',
        stage: body.stage ? (String(body.stage) as FactoryCrmStage) : 'qualified',
        valueUsd: typeof body.valueUsd === 'number' ? body.valueUsd : 0,
        probability: typeof body.probability === 'number' ? body.probability : 25,
        assignedTo: body.assignedTo ? String(body.assignedTo) : undefined,
        nextFollowUpAt: body.nextFollowUpAt ? String(body.nextFollowUpAt) : undefined,
        actor: access.user.username,
      });
      return NextResponse.json({ opportunity }, { status: 201 });
    }

    if (action === 'move_stage') {
      const opportunity = await updateCrmOpportunityStage({
        workspaceId: access.workspaceId,
        opportunityId: String(body.opportunityId || ''),
        stage: String(body.stage || '') as FactoryCrmStage,
        assignedTo: body.assignedTo ? String(body.assignedTo) : undefined,
        nextFollowUpAt: body.nextFollowUpAt ? String(body.nextFollowUpAt) : undefined,
        note: body.note ? String(body.note) : undefined,
        actor: access.user.username,
      });
      return NextResponse.json({ opportunity });
    }

    if (action === 'log_activity') {
      const activity = await logCrmActivity({
        workspaceId: access.workspaceId,
        contactId: body.contactId ? String(body.contactId) : undefined,
        opportunityId: body.opportunityId ? String(body.opportunityId) : undefined,
        activityType: String(body.activityType || 'note'),
        subject: String(body.subject || ''),
        body: String(body.body || ''),
        dueAt: body.dueAt ? String(body.dueAt) : undefined,
        actor: access.user.username,
      });
      return NextResponse.json({ activity }, { status: 201 });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'CRM operation failed.' }, { status: 400 });
  }
}
