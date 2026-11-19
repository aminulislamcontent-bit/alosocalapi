import crypto from 'node:crypto';
import { emailTransport } from './email-transport';
import { db } from '@/lib/db';
import { auditEvent } from '@/lib/security/audit';

export type EmailAdapterType = 'smtp_custom' | 'external_provider_bridge' | 'sandbox_mock_adapter';

export async function registerEmailDomain(params: {
  workspaceId: string;
  domain: string;
  dkimSelector?: string;
  spfRecord?: string;
  dmarcPolicy?: string;
  actor: string;
  ip?: string;
}) {
  const domain = params.domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    throw new Error(`Invalid sending domain format: ${params.domain}`);
  }

  const record = await db.emailSendingDomain.upsert({
    where: { workspaceId_domain: { workspaceId: params.workspaceId, domain } },
    update: {
      dkimSelector: params.dkimSelector?.trim() || 'aloapi1',
      spfRecord: params.spfRecord?.trim() || 'v=spf1 ~all',
      dmarcPolicy: params.dmarcPolicy?.trim() || 'v=DMARC1; p=quarantine;',
    },
    create: {
      workspaceId: params.workspaceId,
      domain,
      dkimSelector: params.dkimSelector?.trim() || 'aloapi1',
      spfRecord: params.spfRecord?.trim() || 'v=spf1 ~all',
      dmarcPolicy: params.dmarcPolicy?.trim() || 'v=DMARC1; p=quarantine;',
      verifiedForProduction: false,
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'factory.email.domain.register',
    target: `${params.workspaceId}:${domain}`,
    ip: params.ip,
  });

  return record;
}

/**
 * Verifies SPF, DKIM, and DMARC records via live DNS TXT resolution.
 * Production deliverability flag (`verifiedForProduction`) ONLY becomes true when all 3 records pass.
 */
export async function verifyEmailDomainAuthentication(params: {
  workspaceId: string;
  domainId: string;
  dkimPublicKeyHint?: string;
  actor: string;
  ip?: string;
}) {
  const existing = await db.emailSendingDomain.findFirst({
    where: { id: params.domainId, workspaceId: params.workspaceId },
  });
  if (!existing) throw new Error('Sending domain not found.');

  const dns = await import('node:dns/promises');
  const [rootTxt, dkimTxt, dmarcTxt] = await Promise.all([
    dns.resolveTxt(existing.domain).catch(() => []),
    dns.resolveTxt(`${existing.dkimSelector}._domainkey.${existing.domain}`).catch(() => []),
    dns.resolveTxt(`_dmarc.${existing.domain}`).catch(() => []),
  ]);
  const spfOk = rootTxt.flat().some((line) => /v=spf1/i.test(line));
  const dkimOk = dkimTxt.flat().some((line) => /v=DKIM1|p=/i.test(line));
  const dmarcOk = dmarcTxt.flat().some((line) => /v=DMARC1/i.test(line));
  const spfStatus = spfOk ? 'verified' : 'failed';
  const dkimStatus = dkimOk ? 'verified' : 'failed';
  const dmarcStatus = dmarcOk ? 'verified' : 'failed';
  const verifiedForProduction = spfOk && dkimOk && dmarcOk && existing.reputationScore >= 70;

  const updated = await db.emailSendingDomain.update({
    where: { id: existing.id },
    data: {
      spfStatus,
      dkimStatus,
      dmarcStatus,
      dkimPublicKeyHint: params.dkimPublicKeyHint || existing.dkimPublicKeyHint,
      verifiedForProduction,
      lastCheckedAt: new Date(),
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'factory.email.domain.verify',
    target: `${params.workspaceId}:${existing.domain}`,
    ip: params.ip,
    metadata: { spfStatus, dkimStatus, dmarcStatus, verifiedForProduction },
  });

  return updated;
}

export async function upsertEmailContact(params: {
  workspaceId: string;
  email: string;
  fullName?: string;
  segment?: string;
  tags?: string[];
  consentStatus: 'pending' | 'granted' | 'unsubscribed';
  consentSource?: string;
  actor: string;
}) {
  const email = params.email.trim().toLowerCase();
  if (!/^[a-z0-9_+.'%-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) {
    throw new Error(`Invalid email address: ${params.email}`);
  }
  const existing = await db.emailContact.findUnique({
    where: { workspaceId_email: { workspaceId: params.workspaceId, email } },
  });

  // Never silently re-opt-in an unsubscribed/suppressed address unless explicitly handled
  if (existing && (existing.consentStatus === 'bounced' || existing.consentStatus === 'complained')) {
    throw new Error(
      `Email '${email}' is suppressed (${existing.suppressionReason || existing.consentStatus}) and cannot be activated.`,
    );
  }

  const token = existing?.unsubscribeToken || crypto.randomBytes(18).toString('hex');
  return db.emailContact.upsert({
    where: { workspaceId_email: { workspaceId: params.workspaceId, email } },
    update: {
      fullName: params.fullName ?? existing?.fullName,
      segment: params.segment || existing?.segment || 'general',
      tags: params.tags ? JSON.stringify(params.tags) : existing?.tags || '[]',
      consentStatus: params.consentStatus,
      consentSource: params.consentSource || existing?.consentSource || 'manual',
      consentAt: params.consentStatus === 'granted' ? new Date() : existing?.consentAt,
      suppressedAt: params.consentStatus === 'unsubscribed' ? new Date() : null,
      suppressionReason: params.consentStatus === 'unsubscribed' ? 'operator_unsubscribed' : null,
    },
    create: {
      workspaceId: params.workspaceId,
      email,
      fullName: params.fullName,
      segment: params.segment || 'general',
      tags: JSON.stringify(params.tags ?? []),
      consentStatus: params.consentStatus,
      consentSource: params.consentSource || 'manual',
      consentAt: params.consentStatus === 'granted' ? new Date() : null,
      suppressedAt: params.consentStatus === 'unsubscribed' ? new Date() : null,
      suppressionReason: params.consentStatus === 'unsubscribed' ? 'operator_unsubscribed' : null,
      unsubscribeToken: token,
    },
  });
}

export async function processEmailUnsubscribe(params: {
  unsubscribeToken: string;
  reason?: string;
  ip?: string;
}) {
  const contact = await db.emailContact.findUnique({
    where: { unsubscribeToken: params.unsubscribeToken.trim() },
  });
  if (!contact) throw new Error('Invalid or unknown unsubscribe token.');

  const updated = await db.emailContact.update({
    where: { id: contact.id },
    data: {
      consentStatus: 'unsubscribed',
      suppressedAt: new Date(),
      suppressionReason: params.reason || 'recipient_one_click_unsubscribe',
    },
  });

  await auditEvent({
    actor: 'recipient',
    action: 'factory.email.unsubscribe',
    target: `${contact.workspaceId}:${contact.email}`,
    ip: params.ip,
    metadata: { reason: updated.suppressionReason },
  });

  return updated;
}

export async function recordEmailBounce(params: {
  workspaceId: string;
  campaignId: string;
  email: string;
  bounceType: 'hard' | 'soft' | 'complaint';
  detail?: string;
  actor: string;
}) {
  const email = params.email.trim().toLowerCase();
  const campaign = await db.emailCampaign.findFirst({
    where: { id: params.campaignId, workspaceId: params.workspaceId },
    include: { domain: true },
  });
  if (!campaign) throw new Error('Email campaign not found.');

  const contact = await db.emailContact.findUnique({
    where: { workspaceId_email: { workspaceId: params.workspaceId, email } },
  });
  if (contact && (params.bounceType === 'hard' || params.bounceType === 'complaint')) {
    await db.emailContact.update({
      where: { id: contact.id },
      data: {
        consentStatus: params.bounceType === 'complaint' ? 'complained' : 'bounced',
        suppressedAt: new Date(),
        suppressionReason: `auto_suppressed_${params.bounceType}`,
      },
    });
  }

  await db.emailDeliveryEvent.create({
    data: {
      workspaceId: params.workspaceId,
      campaignId: campaign.id,
      contactId: contact?.id,
      email,
      messageId: `bounce-${crypto.randomUUID()}`,
      status: params.bounceType === 'complaint' ? 'complained' : `bounced_${params.bounceType}`,
      adapterUsed: campaign.adapterType,
      bounceType: params.bounceType,
      detail: params.detail || `Recorded ${params.bounceType} feedback`,
    },
  });

  let domainAutoPaused = false;
  if (campaign.domain) {
    const newBounce = campaign.domain.bounceCount + (params.bounceType === 'complaint' ? 0 : 1);
    const newComplaint = campaign.domain.complaintCount + (params.bounceType === 'complaint' ? 1 : 0);
    const totalSent = Math.max(1, campaign.domain.sentCount);
    const bounceRate = (newBounce / totalSent) * 100;
    const newScore = Math.max(0, Number((100 - bounceRate * 5 - newComplaint * 15).toFixed(1)));
    const pauseDomain = (totalSent >= 10 && bounceRate > 5) || newComplaint >= 3 || newScore < 70;

    await db.emailSendingDomain.update({
      where: { id: campaign.domain.id },
      data: {
        bounceCount: newBounce,
        complaintCount: newComplaint,
        reputationScore: newScore,
        verifiedForProduction: pauseDomain ? false : campaign.domain.verifiedForProduction,
      },
    });
    domainAutoPaused = pauseDomain;
  }

  await auditEvent({
    actor: params.actor,
    action: 'factory.email.bounce',
    target: `${params.workspaceId}:${email}`,
    metadata: { campaignId: campaign.id, bounceType: params.bounceType, domainAutoPaused },
  });

  return { suppressed: params.bounceType !== 'soft', domainAutoPaused };
}

export async function createEmailTemplate(params: {
  workspaceId: string;
  name: string;
  subject: string;
  preheader?: string;
  htmlBody: string;
  textBody: string;
  language?: string;
  variables?: string[];
}) {
  return db.emailTemplate.upsert({
    where: { workspaceId_name: { workspaceId: params.workspaceId, name: params.name.trim() } },
    update: {
      subject: params.subject,
      preheader: params.preheader,
      htmlBody: params.htmlBody,
      textBody: params.textBody,
      language: params.language || 'en',
      variables: JSON.stringify(params.variables ?? []),
    },
    create: {
      workspaceId: params.workspaceId,
      name: params.name.trim(),
      subject: params.subject,
      preheader: params.preheader,
      htmlBody: params.htmlBody,
      textBody: params.textBody,
      language: params.language || 'en',
      variables: JSON.stringify(params.variables ?? []),
    },
  });
}

export async function createEmailCampaign(params: {
  workspaceId: string;
  name: string;
  domainId?: string;
  templateId?: string;
  segment?: string;
  adapterType?: EmailAdapterType;
  providerKey?: string;
  scheduledFor?: string;
  actor: string;
}) {
  if (
    params.domainId &&
    !(await db.emailSendingDomain.findFirst({
      where: { id: params.domainId, workspaceId: params.workspaceId },
    }))
  )
    throw new Error('Unknown workspace domain.');
  if (
    params.templateId &&
    !(await db.emailTemplate.findFirst({ where: { id: params.templateId, workspaceId: params.workspaceId } }))
  )
    throw new Error('Unknown workspace template.');
  const campaign = await db.emailCampaign.create({
    data: {
      workspaceId: params.workspaceId,
      name: params.name.trim(),
      domainId: params.domainId || null,
      templateId: params.templateId || null,
      segment: params.segment || 'general',
      status: params.scheduledFor ? 'scheduled' : 'draft',
      adapterType: params.adapterType || 'smtp_custom',
      providerKey: params.providerKey || null,
      approvalStatus: 'pending',
      scheduledFor: params.scheduledFor ? new Date(params.scheduledFor) : null,
      stats: JSON.stringify({ eligible: 0, sent: 0, blocked: 0, failed: 0 }),
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'factory.email.campaign.create',
    target: `${params.workspaceId}:${campaign.id}`,
    metadata: { adapterType: campaign.adapterType, segment: campaign.segment },
  });

  return campaign;
}

type CampaignAction = { workspaceId: string; campaignId: string; actor: string; ip?: string };
async function loadCampaign(p: CampaignAction) {
  const c = await db.emailCampaign.findFirst({
    where: { workspaceId: p.workspaceId, id: p.campaignId },
    include: { domain: true, template: true },
  });
  if (!c || c.template?.workspaceId !== p.workspaceId || (c.domain && c.domain.workspaceId !== p.workspaceId))
    throw new Error('Campaign requires a workspace-owned template and domain.');
  return c;
}
function digest(c: Awaited<ReturnType<typeof loadCampaign>>) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        c.workspaceId,
        c.id,
        c.name,
        c.segment,
        c.domainId,
        c.domain?.domain,
        c.template,
        c.adapterType,
        c.providerKey,
        c.scheduledFor,
      ]),
    )
    .digest('hex');
}
export async function approveEmailCampaign(p: CampaignAction) {
  const c = await loadCampaign(p);
  return db.emailCampaign.update({
    where: { id: c.id },
    data: {
      approvalStatus: 'approved',
      approvedBy: p.actor,
      approvedAt: new Date(),
      approvalDigest: digest(c),
    },
  });
}
export async function dispatchEmailCampaign(p: CampaignAction) {
  const c = await loadCampaign(p);
  if (c.approvalStatus !== 'approved' || digest(c) !== c.approvalDigest)
    throw new Error('Current campaign version requires approval.');
  if (c.adapterType !== 'sandbox_mock_adapter' && !c.domain?.verifiedForProduction)
    throw new Error('Production email sending blocked: domain requires verified SPF, DKIM, and DMARC.');
  // Never resubmit historical campaigns that predate per-recipient submission keys.
  if (
    await db.emailDeliveryEvent.count({
      where: { campaignId: c.id, submissionKey: null, status: { in: ['sent', 'sent_mocked'] } },
    })
  )
    throw new Error('Historical dispatch cannot be replayed.');
  const submit = await emailTransport(p.workspaceId, p.actor, c.adapterType, c.providerKey);
  const contacts = await db.emailContact.findMany({
    where: { workspaceId: p.workspaceId, ...(c.segment === 'all' ? {} : { segment: c.segment }) },
  });
  for (const contact of contacts) {
    const submissionKey = `${c.id}:${contact.id}`;
    const messageId = `<${crypto.randomUUID()}@${c.domain?.domain || 'localhost'}>`;
    let event;
    try {
      event = await db.emailDeliveryEvent.create({
        data: {
          submissionKey,
          workspaceId: p.workspaceId,
          campaignId: c.id,
          contactId: contact.id,
          email: contact.email,
          messageId,
          adapterUsed: c.adapterType,
          status: contact.consentStatus === 'granted' && !contact.suppressedAt ? 'SUBMITTING' : 'blocked',
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      // Only retry when no submission took place. Never replay an ambiguous SMTP outcome.
      if (contact.consentStatus !== 'granted' || contact.suppressedAt) continue;
      const reserved = await db.emailDeliveryEvent.updateMany({
        where: { submissionKey, status: { in: ['PREFLIGHT_PASSED', 'NOT_CONFIGURED'] } },
        data: { status: 'SUBMITTING', messageId },
      });
      if (!reserved.count) continue;
      event = await db.emailDeliveryEvent.findUniqueOrThrow({ where: { submissionKey } });
    }
    if (event.status === 'blocked') continue;
    const out = !/^[a-z0-9_+.'%-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(contact.email)
      ? { status: 'REJECTED', receipt: undefined }
      : await submit({
          from: `postmaster@${c.domain?.domain}`,
          to: contact.email,
          subject: c.template!.subject,
          text: c.template!.textBody,
          html: c.template!.htmlBody,
          messageId,
        });
    await db.$transaction(async (tx) => {
      await tx.emailDeliveryEvent.update({
        where: { id: event.id },
        data: { status: out.status, detail: out.receipt },
      });
      if (out.status === 'ACCEPTED') {
        await tx.factoryUsageEvent.create({
          data: {
            workspaceId: p.workspaceId,
            moduleKey: 'email_marketing',
            metric: 'email_sent',
            quantity: 1,
            unitCostUsd: 0.0001,
            totalCostUsd: 0.0001,
            adapter: c.adapterType,
            metadata: JSON.stringify({ eventId: event.id }),
          },
        });
        await tx.emailSendingDomain.update({
          where: { id: c.domainId! },
          data: { sentCount: { increment: 1 } },
        });
      }
    });
  }
  const groups = await db.emailDeliveryEvent.groupBy({
    by: ['status'],
    where: { campaignId: c.id, submissionKey: { not: null } },
    _count: true,
  });
  const outcomes = Object.fromEntries(groups.map((g) => [g.status, g._count]));
  const stats = { sent: outcomes.ACCEPTED || 0, blocked: outcomes.blocked || 0, outcomes };
  const completed = stats.sent > 0 && groups.every((g) => ['ACCEPTED', 'blocked'].includes(g.status));
  const campaign = await db.emailCampaign.update({
    where: { id: c.id },
    data: {
      status: completed ? 'completed' : 'needs_review',
      sentAt: stats.sent ? (c.sentAt ?? new Date()) : null,
      stats: JSON.stringify(stats),
    },
  });
  return { campaign, stats };
}
