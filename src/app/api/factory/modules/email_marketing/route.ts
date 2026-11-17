import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireFactoryAccess } from '@/lib/factory/tenancy';
import { getFirstPartyModule } from '@/lib/factory/modules/registry';
import {
  createEmailCampaign,
  createEmailTemplate,
  dispatchEmailCampaign,
  processEmailUnsubscribe,
  recordEmailBounce,
  registerEmailDomain,
  upsertEmailContact,
  verifyEmailDomainAuthentication,
  type EmailAdapterType,
} from '@/lib/factory/modules/email-marketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const access = await requireFactoryAccess(req, {
    workspaceId: req.nextUrl.searchParams.get('workspaceId'),
    permission: 'read',
  });
  if (!access.ok) return access.response;

  const wid = access.workspaceId;
  const [domains, contacts, templates, campaigns, deliveryEvents] = await Promise.all([
    db.emailSendingDomain.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'desc' } }),
    db.emailContact.findMany({ where: { workspaceId: wid }, orderBy: { updatedAt: 'desc' }, take: 200 }),
    db.emailTemplate.findMany({ where: { workspaceId: wid }, orderBy: { updatedAt: 'desc' } }),
    db.emailCampaign.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.emailDeliveryEvent.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);

  return NextResponse.json({
    module: getFirstPartyModule('email_marketing'),
    workspaceId: wid,
    domains,
    contacts,
    templates,
    campaigns,
    deliveryEvents,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || '');
  const perm = action === 'dispatch_campaign' ? 'execute' : 'write';
  const access = await requireFactoryAccess(req, {
    workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
    permission: perm,
    requireCsrf: true,
  });
  if (!access.ok) return access.response;

  try {
    if (action === 'register_domain') {
      const domain = await registerEmailDomain({
        workspaceId: access.workspaceId,
        domain: String(body.domain || ''),
        dkimSelector: body.dkimSelector ? String(body.dkimSelector) : undefined,
        spfRecord: body.spfRecord ? String(body.spfRecord) : undefined,
        dmarcPolicy: body.dmarcPolicy ? String(body.dmarcPolicy) : undefined,
        actor: access.user.username,
        ip: access.ip,
      });
      return NextResponse.json({ domain }, { status: 201 });
    }

    if (action === 'verify_domain') {
      const domain = await verifyEmailDomainAuthentication({
        workspaceId: access.workspaceId,
        domainId: String(body.domainId || ''),
        spfVerified: typeof body.spfVerified === 'boolean' ? body.spfVerified : undefined,
        dkimVerified: typeof body.dkimVerified === 'boolean' ? body.dkimVerified : undefined,
        dmarcVerified: typeof body.dmarcVerified === 'boolean' ? body.dmarcVerified : undefined,
        dkimPublicKeyHint: body.dkimPublicKeyHint ? String(body.dkimPublicKeyHint) : undefined,
        actor: access.user.username,
        ip: access.ip,
      });
      return NextResponse.json({ domain });
    }

    if (action === 'upsert_contact') {
      const contact = await upsertEmailContact({
        workspaceId: access.workspaceId,
        email: String(body.email || ''),
        fullName: body.fullName ? String(body.fullName) : undefined,
        segment: body.segment ? String(body.segment) : undefined,
        tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
        consentStatus: String(body.consentStatus || 'pending') as 'pending' | 'granted' | 'unsubscribed',
        consentSource: body.consentSource ? String(body.consentSource) : undefined,
        actor: access.user.username,
      });
      return NextResponse.json({ contact });
    }

    if (action === 'unsubscribe') {
      const contact = await processEmailUnsubscribe({
        unsubscribeToken: String(body.unsubscribeToken || ''),
        reason: body.reason ? String(body.reason) : undefined,
        ip: access.ip,
      });
      return NextResponse.json({ contact });
    }

    if (action === 'record_bounce') {
      const result = await recordEmailBounce({
        workspaceId: access.workspaceId,
        campaignId: String(body.campaignId || ''),
        email: String(body.email || ''),
        bounceType: String(body.bounceType || 'hard') as 'hard' | 'soft' | 'complaint',
        detail: body.detail ? String(body.detail) : undefined,
        actor: access.user.username,
      });
      return NextResponse.json(result);
    }

    if (action === 'save_template') {
      const template = await createEmailTemplate({
        workspaceId: access.workspaceId,
        name: String(body.name || ''),
        subject: String(body.subject || ''),
        preheader: body.preheader ? String(body.preheader) : undefined,
        htmlBody: String(body.htmlBody || ''),
        textBody: String(body.textBody || ''),
        language: body.language ? String(body.language) : 'en',
        variables: Array.isArray(body.variables) ? (body.variables as string[]) : undefined,
      });
      return NextResponse.json({ template });
    }

    if (action === 'create_campaign') {
      const campaign = await createEmailCampaign({
        workspaceId: access.workspaceId,
        name: String(body.name || ''),
        domainId: body.domainId ? String(body.domainId) : undefined,
        templateId: body.templateId ? String(body.templateId) : undefined,
        segment: body.segment ? String(body.segment) : 'general',
        adapterType: body.adapterType ? (String(body.adapterType) as EmailAdapterType) : 'smtp_custom',
        providerKey: body.providerKey ? String(body.providerKey) : undefined,
        scheduledFor: body.scheduledFor ? String(body.scheduledFor) : undefined,
        actor: access.user.username,
      });
      return NextResponse.json({ campaign }, { status: 201 });
    }

    if (action === 'dispatch_campaign') {
      const out = await dispatchEmailCampaign({
        workspaceId: access.workspaceId,
        campaignId: String(body.campaignId || ''),
        approveNow: Boolean(body.approveNow),
        actor: access.user.username,
        ip: access.ip,
      });
      return NextResponse.json(out);
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Email marketing operation failed.' }, { status: 400 });
  }
}
