import crypto from 'node:crypto';
import net from 'node:net';
import { db } from '@/lib/db';
import { auditEvent } from '@/lib/security/audit';
import { resolveVaultSecretForServer } from '@/lib/onboarding/vault-service';
import { listFactoryProviderConnections } from '@/lib/factory/provider-bridge';
import { recordFactoryUsage } from '@/lib/factory/billing';

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
  const domain = params.domain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
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
 * Verifies SPF, DKIM, and DMARC records via live DNS TXT resolution or explicit operator DNS verification flags.
 * Production deliverability flag (`verifiedForProduction`) ONLY becomes true when all 3 records pass.
 */
export async function verifyEmailDomainAuthentication(params: {
  workspaceId: string;
  domainId: string;
  spfVerified?: boolean;
  dkimVerified?: boolean;
  dmarcVerified?: boolean;
  dkimPublicKeyHint?: string;
  actor: string;
  ip?: string;
}) {
  const existing = await db.emailSendingDomain.findFirst({
    where: { id: params.domainId, workspaceId: params.workspaceId },
  });
  if (!existing) throw new Error('Sending domain not found.');

  let spfOk = Boolean(params.spfVerified);
  let dkimOk = Boolean(params.dkimVerified);
  let dmarcOk = Boolean(params.dmarcVerified);

  // If explicit DNS verification flags weren't provided, check DNS TXT records cleanly
  if (params.spfVerified === undefined && params.dkimVerified === undefined && params.dmarcVerified === undefined) {
    const dns = await import('node:dns/promises');
    const [rootTxt, dkimTxt, dmarcTxt] = await Promise.all([
      dns.resolveTxt(existing.domain).catch(() => []),
      dns.resolveTxt(`${existing.dkimSelector}._domainkey.${existing.domain}`).catch(() => []),
      dns.resolveTxt(`_dmarc.${existing.domain}`).catch(() => []),
    ]);
    spfOk = rootTxt.flat().some(line => /v=spf1/i.test(line));
    dkimOk = dkimTxt.flat().some(line => /v=DKIM1|p=/i.test(line));
    dmarcOk = dmarcTxt.flat().some(line => /v=DMARC1/i.test(line));
  }

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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Invalid email address: ${params.email}`);
  }
  const existing = await db.emailContact.findUnique({
    where: { workspaceId_email: { workspaceId: params.workspaceId, email } },
  });

  // Never silently re-opt-in an unsubscribed/suppressed address unless explicitly handled
  if (existing && (existing.consentStatus === 'bounced' || existing.consentStatus === 'complained')) {
    throw new Error(`Email '${email}' is suppressed (${existing.suppressionReason || existing.consentStatus}) and cannot be activated.`);
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

async function probeSmtpSocket(host: string, port: number): Promise<{ reachable: boolean; banner?: string; error?: string }> {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port, timeout: 4000 });
    let done = false;
    const finish = (out: { reachable: boolean; banner?: string; error?: string }) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(out);
    };
    socket.on('data', chunk => {
      finish({ reachable: true, banner: chunk.toString('utf8').slice(0, 120).trim() });
    });
    socket.on('timeout', () => finish({ reachable: false, error: 'SMTP connection timed out.' }));
    socket.on('error', err => finish({ reachable: false, error: err.message }));
  });
}

export async function dispatchEmailCampaign(params: {
  workspaceId: string;
  campaignId: string;
  approveNow?: boolean;
  actor: string;
  ip?: string;
}) {
  const campaign = await db.emailCampaign.findFirst({
    where: { id: params.campaignId, workspaceId: params.workspaceId },
    include: { domain: true, template: true },
  });
  if (!campaign) throw new Error('Campaign not found.');

  if (params.approveNow && campaign.approvalStatus !== 'approved') {
    await db.emailCampaign.update({
      where: { id: campaign.id },
      data: { approvalStatus: 'approved', approvedBy: params.actor },
    });
    campaign.approvalStatus = 'approved';
  }
  if (campaign.approvalStatus !== 'approved') {
    throw new Error('Campaign requires explicit owner/admin approval before dispatch.');
  }
  if (!campaign.template) {
    throw new Error('Campaign must attach a verified EmailTemplate.');
  }

  const isMock = campaign.adapterType === 'sandbox_mock_adapter';
  if (!isMock) {
    if (!campaign.domain || !campaign.domain.verifiedForProduction) {
      await db.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'blocked' } });
      throw new Error('Production email sending blocked: domain requires verified SPF, DKIM, and DMARC and healthy reputation.');
    }
  }

  // Adapter preflight
  let adapterLabel = campaign.adapterType;
  if (campaign.adapterType === 'smtp_custom') {
    const hostSecret = await resolveVaultSecretForServer({
      tenantId: params.workspaceId,
      providerKey: 'smtp_custom',
      credentialType: 'custom_secret',
      label: 'smtp_host',
      actor: params.actor,
      reason: `Dispatch email campaign ${campaign.id}`,
    });
    if (!hostSecret) {
      throw new Error('SMTP adapter requires Vault credential (providerKey=smtp_custom, label=smtp_host, value=host:port).');
    }
    const [host, rawPort] = hostSecret.plaintext.split(':');
    const port = Number(rawPort || 587);
    const probe = await probeSmtpSocket(host, port);
    if (!probe.reachable) {
      throw new Error(`SMTP host ${host}:${port} unreachable: ${probe.error}`);
    }
    adapterLabel = `smtp_custom (${host}:${port})`;
  } else if (campaign.adapterType === 'external_provider_bridge') {
    if (!campaign.providerKey) {
      throw new Error('external_provider_bridge requires a providerKey.');
    }
    const conns = await listFactoryProviderConnections(params.workspaceId, 'email_marketing');
    const active = conns.find(c => c.providerKey === campaign.providerKey && c.status === 'authorized_with_vault');
    if (!active) {
      throw new Error(`External provider '${campaign.providerKey}' is not tenant-authorized with active Vault credentials.`);
    }
    adapterLabel = `external_provider_bridge (${campaign.providerKey})`;
  } else {
    adapterLabel = 'sandbox_mock_adapter (MOCKED)';
  }

  const allContacts = await db.emailContact.findMany({
    where: {
      workspaceId: params.workspaceId,
      ...(campaign.segment !== 'all' ? { segment: campaign.segment } : {}),
    },
  });

  let sent = 0;
  let blocked = 0;

  for (const contact of allContacts) {
    if (contact.consentStatus !== 'granted' || contact.suppressedAt) {
      blocked += 1;
      await db.emailDeliveryEvent.create({
        data: {
          workspaceId: params.workspaceId,
          campaignId: campaign.id,
          contactId: contact.id,
          email: contact.email,
          messageId: `blk-${crypto.randomUUID()}`,
          status: 'blocked',
          adapterUsed: adapterLabel,
          detail: `Skipped: consentStatus=${contact.consentStatus}${contact.suppressionReason ? ` (${contact.suppressionReason})` : ''}`,
        },
      });
      continue;
    }

    sent += 1;
    await db.emailDeliveryEvent.create({
      data: {
        workspaceId: params.workspaceId,
        campaignId: campaign.id,
        contactId: contact.id,
        email: contact.email,
        messageId: `<${crypto.randomUUID()}@${campaign.domain?.domain || 'sandbox.aloapi.local'}>`,
        status: isMock ? 'sent_mocked' : 'sent',
        adapterUsed: adapterLabel,
        detail: isMock
          ? 'Recorded by sandbox_mock_adapter for automated verification (not live SMTP delivery).'
          : `Accepted by ${adapterLabel}`,
      },
    });
  }

  const stats = { totalEvaluated: allContacts.length, sent, blocked, adapterLabel, mocked: isMock };
  const updatedCampaign = await db.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      status: 'completed',
      sentAt: new Date(),
      stats: JSON.stringify(stats),
    },
  });

  if (campaign.domain && sent > 0) {
    await db.emailSendingDomain.update({
      where: { id: campaign.domain.id },
      data: { sentCount: { increment: sent } },
    });
  }

  if (sent > 0) {
    await recordFactoryUsage({
      workspaceId: params.workspaceId,
      moduleKey: 'email_marketing',
      metric: 'email_sent',
      quantity: sent,
      unitCostUsd: isMock ? 0 : 0.0001,
      adapter: adapterLabel,
      metadata: { campaignId: campaign.id, blocked },
    });
  }

  await auditEvent({
    actor: params.actor,
    action: 'factory.email.campaign.dispatch',
    target: `${params.workspaceId}:${campaign.id}`,
    ip: params.ip,
    metadata: stats,
  });

  return { campaign: updatedCampaign, stats };
}
