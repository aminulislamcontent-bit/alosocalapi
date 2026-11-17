import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { auditEvent } from '@/lib/security/audit';
import { runFactoryAiInference, type SupportedVoiceLanguage } from '@/lib/factory/ai-router';
import { recordFactoryUsage } from '@/lib/factory/billing';
import { listFactoryProviderConnections } from '@/lib/factory/provider-bridge';
import { getFirstPartyModule, FIRST_PARTY_MODULES, type FirstPartyModuleKey } from './registry';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function calculateSmsSegments(message: string): { encoding: 'GSM-7' | 'UCS-2'; chars: number; segments: number } {
  const gsmRegex = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~\]|€]*$/;
  const isGsm = gsmRegex.test(message);
  const chars = message.length;
  if (isGsm) {
    const segments = chars <= 160 ? 1 : Math.ceil(chars / 153);
    return { encoding: 'GSM-7', chars, segments };
  }
  const segments = chars <= 70 ? 1 : Math.ceil(chars / 67);
  return { encoding: 'UCS-2', chars, segments };
}

export async function getSuiteModuleState(workspaceId: string, moduleKey: FirstPartyModuleKey) {
  const mod = getFirstPartyModule(moduleKey);
  if (!mod) throw new Error(`Unknown module: ${moduleKey}`);

  const [configRow, records, connections, recentJobs] = await Promise.all([
    db.factoryModuleConfig.findUnique({ where: { workspaceId_moduleKey: { workspaceId, moduleKey } } }),
    db.factoryModuleRecord.findMany({
      where: { workspaceId, moduleKey },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    listFactoryProviderConnections(workspaceId, moduleKey),
    db.factoryJob.findMany({
      where: { workspaceId, moduleKey },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
  ]);

  let computedSummary: Record<string, unknown> = {
    totalRecords: records.length,
    byStatus: records.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {}),
  };

  if (moduleKey === 'analytics_attribution') {
    const [opps, emails, calls, usage] = await Promise.all([
      db.factoryCrmOpportunity.findMany({ where: { workspaceId } }),
      db.emailCampaign.findMany({ where: { workspaceId } }),
      db.voiceCallSession.findMany({ where: { workspaceId } }),
      db.factoryUsageEvent.findMany({ where: { workspaceId } }),
    ]);
    const wonValueUsd = opps.filter(o => o.status === 'won').reduce((s, o) => s + o.valueUsd, 0);
    const totalSpendUsd = usage.reduce((s, u) => s + u.totalCostUsd, 0);
    computedSummary = {
      ...computedSummary,
      attributionModel: 'linear',
      opportunitiesTotal: opps.length,
      wonRevenueUsd: Number(wonValueUsd.toFixed(2)),
      emailCampaignsCount: emails.length,
      voiceCallsCount: calls.length,
      recordedSpendUsd: Number(totalSpendUsd.toFixed(4)),
    };
  } else if (moduleKey === 'marketing_intelligence') {
    const allCounts = await db.factoryModuleRecord.groupBy({
      by: ['moduleKey'],
      where: { workspaceId },
      _count: { _all: true },
    });
    const [domains, calls, workflows, opps] = await Promise.all([
      db.emailSendingDomain.count({ where: { workspaceId, verifiedForProduction: true } }),
      db.voiceCallSession.count({ where: { workspaceId } }),
      db.factoryAutomationWorkflow.count({ where: { workspaceId, status: 'active' } }),
      db.factoryCrmOpportunity.count({ where: { workspaceId } }),
    ]);
    computedSummary = {
      ...computedSummary,
      totalModulesCount: FIRST_PARTY_MODULES.length,
      verifiedEmailDomains: domains,
      totalVoiceCalls: calls,
      activeAutomations: workflows,
      crmOpportunities: opps,
      recordsByModule: Object.fromEntries(allCounts.map(c => [c.moduleKey, c._count._all])),
    };
  }

  return {
    module: mod,
    config: configRow || {
      workspaceId,
      moduleKey,
      enabled: true,
      adapterMode: 'local',
      config: JSON.stringify(mod.defaultConfig),
      operationalStatus: 'READY',
    },
    records,
    connections,
    recentJobs,
    computedSummary,
  };
}

export async function updateModuleConfig(params: {
  workspaceId: string;
  moduleKey: FirstPartyModuleKey;
  enabled?: boolean;
  adapterMode?: string;
  config?: Record<string, unknown>;
  actor: string;
}) {
  const mod = getFirstPartyModule(params.moduleKey);
  if (!mod) throw new Error(`Unknown module: ${params.moduleKey}`);

  const saved = await db.factoryModuleConfig.upsert({
    where: { workspaceId_moduleKey: { workspaceId: params.workspaceId, moduleKey: params.moduleKey } },
    update: {
      enabled: params.enabled ?? true,
      adapterMode: params.adapterMode || 'local',
      config: JSON.stringify(params.config ?? mod.defaultConfig),
      updatedBy: params.actor,
    },
    create: {
      workspaceId: params.workspaceId,
      moduleKey: params.moduleKey,
      enabled: params.enabled ?? true,
      adapterMode: params.adapterMode || 'local',
      config: JSON.stringify(params.config ?? mod.defaultConfig),
      operationalStatus: 'READY',
      updatedBy: params.actor,
    },
  });

  await auditEvent({
    actor: params.actor,
    action: `factory.module.${params.moduleKey}.config`,
    target: `${params.workspaceId}:${params.moduleKey}`,
    metadata: { enabled: saved.enabled, adapterMode: saved.adapterMode },
  });

  return saved;
}

export async function executeSuiteModuleAction(params: {
  workspaceId: string;
  moduleKey: FirstPartyModuleKey;
  action: string;
  title?: string;
  recordId?: string;
  language?: SupportedVoiceLanguage;
  data?: Record<string, unknown>;
  actor: string;
  ip?: string;
}) {
  const mod = getFirstPartyModule(params.moduleKey);
  if (!mod) throw new Error(`Unknown module: ${params.moduleKey}`);

  const payload = params.data ?? {};
  const lang = params.language || 'en';

  // Common lifecycle transitions: approve / schedule / cancel
  if (params.action === 'approve' && params.recordId) {
    const existing = await db.factoryModuleRecord.findFirst({
      where: { id: params.recordId, workspaceId: params.workspaceId, moduleKey: params.moduleKey },
    });
    if (!existing) throw new Error('Module record not found.');
    const updated = await db.factoryModuleRecord.update({
      where: { id: existing.id },
      data: { status: 'approved' },
    });
    await auditEvent({
      actor: params.actor,
      action: `factory.module.${params.moduleKey}.approve`,
      target: `${params.workspaceId}:${existing.id}`,
      ip: params.ip,
    });
    return { record: updated };
  }

  // Module-specific real domain execution
  if (params.moduleKey === 'social_media_manager') {
    const network = String(payload.network || 'facebook');
    const topic = String(payload.topic || params.title || 'Marketing update');
    const ai = await runFactoryAiInference({
      workspaceId: params.workspaceId,
      moduleKey: params.moduleKey,
      task: 'marketing_copy',
      language: lang,
      prompt: `Social post for ${network}: ${topic}`,
      actor: params.actor,
    });
    const record = await db.factoryModuleRecord.create({
      data: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        recordType: 'social_post',
        title: params.title?.trim() || `${network}: ${topic.slice(0, 60)}`,
        status: 'awaiting_approval',
        data: JSON.stringify({
          network,
          caption: String(payload.caption || ai.outputText),
          hashtags: Array.isArray(payload.hashtags) ? payload.hashtags : ['#aloapi', `#${network}`],
          aiAdapter: ai.adapterUsed,
        }),
        scheduledFor: payload.scheduledFor ? new Date(String(payload.scheduledFor)) : null,
        createdBy: params.actor,
      },
    });
    return { record, ai };
  }

  if (params.moduleKey === 'chatbot_support') {
    const question = String(payload.question || params.title || 'How can I verify pricing?');
    const ai = await runFactoryAiInference({
      workspaceId: params.workspaceId,
      moduleKey: params.moduleKey,
      task: 'voice_reply',
      language: lang,
      prompt: question,
      actor: params.actor,
    });
    const escalated = Boolean(ai.structured.handoffRecommended);
    const record = await db.factoryModuleRecord.create({
      data: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        recordType: 'support_thread',
        title: question.slice(0, 80),
        status: escalated ? 'escalated_to_human' : 'resolved_by_bot',
        data: JSON.stringify({ question, reply: ai.outputText, escalated, sentiment: ai.structured.sentiment }),
        createdBy: params.actor,
      },
    });
    return { record, ai };
  }

  if (params.moduleKey === 'ads_management') {
    const dailyBudgetUsd = Number(payload.dailyBudgetUsd ?? 25);
    if (!Number.isFinite(dailyBudgetUsd) || dailyBudgetUsd <= 0 || dailyBudgetUsd > 5000) {
      throw new Error('Daily ad budget must be between $1 and $5000 USD.');
    }
    const ai = await runFactoryAiInference({
      workspaceId: params.workspaceId,
      moduleKey: params.moduleKey,
      task: 'marketing_copy',
      language: lang,
      prompt: `Ad headline & copy for ${String(payload.channel || 'meta_marketing_api')}: ${params.title || 'Campaign'}`,
      actor: params.actor,
    });
    const record = await db.factoryModuleRecord.create({
      data: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        recordType: 'ad_campaign',
        title: params.title?.trim() || 'Ad Campaign Plan',
        status: 'awaiting_spend_approval',
        data: JSON.stringify({
          channel: String(payload.channel || 'meta_marketing_api'),
          dailyBudgetUsd,
          objective: String(payload.objective || 'leads'),
          adCopy: ai.outputText,
        }),
        createdBy: params.actor,
      },
    });
    return { record, ai };
  }

  if (params.moduleKey === 'seo_content') {
    const keyword = String(payload.keyword || params.title || 'ai marketing automation');
    const ai = await runFactoryAiInference({
      workspaceId: params.workspaceId,
      moduleKey: params.moduleKey,
      task: 'seo_brief',
      language: lang,
      prompt: keyword,
      actor: params.actor,
    });
    const metaDesc = String(payload.metaDescription || `Comprehensive verified guide to ${keyword}.`);
    const record = await db.factoryModuleRecord.create({
      data: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        recordType: 'seo_brief',
        title: params.title?.trim() || `SEO Brief: ${keyword}`,
        status: metaDesc.length <= 160 ? 'validated' : 'needs_meta_trim',
        data: JSON.stringify({ keyword, metaDescription: metaDesc, metaLength: metaDesc.length, brief: ai.structured }),
        createdBy: params.actor,
      },
    });
    return { record, ai };
  }

  if (params.moduleKey === 'lead_generation') {
    const fullName = String(payload.fullName || params.title || 'Inbound Prospect').trim();
    const email = payload.email ? String(payload.email).trim().toLowerCase() : null;
    const budgetUsd = Number(payload.budgetUsd ?? 500);
    const consentGranted = Boolean(payload.consentGranted);
    const ai = await runFactoryAiInference({
      workspaceId: params.workspaceId,
      moduleKey: params.moduleKey,
      task: 'lead_qualification',
      language: lang,
      prompt: String(payload.intentNote || fullName),
      context: { budgetUsd, consentGranted },
      actor: params.actor,
    });
    const record = await db.factoryModuleRecord.create({
      data: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        recordType: 'captured_lead',
        title: fullName,
        status: consentGranted ? 'qualified_ready_for_crm' : 'consent_required',
        data: JSON.stringify({ fullName, email, budgetUsd, consentGranted, qualification: ai.structured }),
        createdBy: params.actor,
      },
    });
    if (consentGranted && payload.promoteToCrm) {
      await db.factoryCrmContact.create({
        data: {
          workspaceId: params.workspaceId,
          fullName,
          email,
          source: 'lead_generation',
          consentStatus: 'granted',
          assignedTo: params.actor,
        },
      });
    }
    return { record, ai };
  }

  if (params.moduleKey === 'creative_studio') {
    const concept = String(payload.concept || params.title || 'Product Launch Banner');
    const ai = await runFactoryAiInference({
      workspaceId: params.workspaceId,
      moduleKey: params.moduleKey,
      task: 'marketing_copy',
      language: lang,
      prompt: `Creative brief variants for ${concept}`,
      actor: params.actor,
    });
    const record = await db.factoryModuleRecord.create({
      data: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        recordType: 'creative_brief',
        title: concept,
        status: 'draft_ready',
        data: JSON.stringify({
          aspectRatio: String(payload.aspectRatio || '1:1'),
          brandColor: String(payload.brandColor || '#06b6d4'),
          variantA: ai.outputText,
          variantB: `${concept} — Compliance-Verified Offer`,
        }),
        createdBy: params.actor,
      },
    });
    return { record, ai };
  }

  if (params.moduleKey === 'sms_marketing') {
    const message = String(payload.message || params.title || '').trim();
    if (!message) throw new Error('SMS message body is required.');
    const senderId = String(payload.senderId || '').trim();
    if (!senderId) throw new Error('Verified carrier Sender ID is required for SMS compliance.');
    const segments = calculateSmsSegments(message);
    const recipientsCount = Math.max(1, Number(payload.recipientsCount ?? 1));
    const record = await db.factoryModuleRecord.create({
      data: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        recordType: 'sms_campaign',
        title: params.title?.trim() || `SMS (${senderId})`,
        status: 'queued_for_authorized_provider',
        data: JSON.stringify({ senderId, message, ...segments, recipientsCount, optOutKeyword: 'STOP' }),
        createdBy: params.actor,
      },
    });
    await recordFactoryUsage({
      workspaceId: params.workspaceId,
      moduleKey: params.moduleKey,
      metric: 'sms_segments_planned',
      quantity: segments.segments * recipientsCount,
      adapter: 'local_planner',
    });
    return { record, segments };
  }

  if (params.moduleKey === 'whatsapp_marketing') {
    const templateName = String(payload.templateName || params.title || 'welcome_utility').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,64}$/.test(templateName)) {
      throw new Error('WhatsApp template names must be lowercase alphanumeric with underscores (3-64 chars).');
    }
    const category = String(payload.category || 'UTILITY').toUpperCase();
    if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(category)) {
      throw new Error('WhatsApp template category must be MARKETING, UTILITY, or AUTHENTICATION.');
    }
    const record = await db.factoryModuleRecord.create({
      data: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        recordType: 'whatsapp_template',
        title: templateName,
        status: 'awaiting_meta_template_approval',
        data: JSON.stringify({
          templateName,
          category,
          language: String(payload.locale || 'bn_BD'),
          bodyText: String(payload.bodyText || 'Hello {{1}}, thank you for opting in.'),
        }),
        createdBy: params.actor,
      },
    });
    return { record };
  }

  if (params.moduleKey === 'landing_pages') {
    const headline = String(payload.headline || params.title || 'Welcome');
    const subheadline = String(payload.subheadline || 'Verified Marketing Solution');
    const ctaText = String(payload.ctaText || 'Request Demo');
    const slug = String(payload.slug || headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page');
    const compiledHtml = `<!DOCTYPE html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><title>${escapeHtml(headline)}</title></head><body><main><h1>${escapeHtml(headline)}</h1><p>${escapeHtml(subheadline)}</p><button type="button">${escapeHtml(ctaText)}</button></main></body></html>`;
    const record = await db.factoryModuleRecord.create({
      data: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        recordType: 'landing_page',
        title: headline,
        status: 'ready_preview',
        data: JSON.stringify({ slug, headline, subheadline, ctaText, compiledHtml }),
        createdBy: params.actor,
      },
    });
    return { record };
  }

  if (params.moduleKey === 'forms_surveys') {
    const formTitle = params.title?.trim() || 'Lead Intake Form';
    if (params.action === 'submit_response') {
      if (!payload.consentChecked) {
        throw new Error('Explicit consent checkbox must be checked before accepting form PII.');
      }
      const record = await db.factoryModuleRecord.create({
        data: {
          workspaceId: params.workspaceId,
          moduleKey: params.moduleKey,
          recordType: 'form_submission',
          title: String(payload.respondentEmail || payload.respondentName || 'Form Submission'),
          status: 'received',
          data: JSON.stringify({ formId: payload.formId || null, responses: payload.responses || {}, consentChecked: true }),
          createdBy: params.actor,
        },
      });
      return { record };
    }
    const record = await db.factoryModuleRecord.create({
      data: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        recordType: 'form_schema',
        title: formTitle,
        status: 'published',
        data: JSON.stringify({
          fields: Array.isArray(payload.fields) ? payload.fields : ['fullName', 'email', 'consentCheckbox'],
          requireConsent: true,
        }),
        createdBy: params.actor,
      },
    });
    return { record };
  }

  if (params.moduleKey === 'appointment_booking') {
    const startIso = String(payload.startTime || '');
    const endIso = String(payload.endTime || '');
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new Error('Valid ISO startTime and endTime (endTime > startTime) are required.');
    }
    const existingBookings = await db.factoryModuleRecord.findMany({
      where: { workspaceId: params.workspaceId, moduleKey: 'appointment_booking', recordType: 'booking', status: 'confirmed' },
    });
    for (const b of existingBookings) {
      const bData = JSON.parse(b.data) as { startTime: string; endTime: string; host?: string };
      const bStart = new Date(bData.startTime);
      const bEnd = new Date(bData.endTime);
      if (start < bEnd && end > bStart && (bData.host || 'default') === String(payload.host || 'default')) {
        throw new Error(`Booking conflict with existing slot (${bData.startTime} - ${bData.endTime}).`);
      }
    }
    const record = await db.factoryModuleRecord.create({
      data: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        recordType: 'booking',
        title: params.title?.trim() || `Appointment (${String(payload.guestName || 'Client')})`,
        status: 'confirmed',
        scheduledFor: start,
        data: JSON.stringify({
          host: String(payload.host || 'default'),
          guestName: String(payload.guestName || 'Client'),
          guestEmail: payload.guestEmail || null,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        }),
        createdBy: params.actor,
      },
    });
    return { record };
  }

  if (params.moduleKey === 'reputation_manager') {
    const reviewText = String(payload.reviewText || params.title || 'Great service!');
    const rating = Math.min(5, Math.max(1, Number(payload.rating ?? 5)));
    const ai = await runFactoryAiInference({
      workspaceId: params.workspaceId,
      moduleKey: params.moduleKey,
      task: 'sentiment_analysis',
      language: lang,
      prompt: reviewText,
      actor: params.actor,
    });
    const record = await db.factoryModuleRecord.create({
      data: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        recordType: 'customer_review',
        title: `${rating}★ — ${reviewText.slice(0, 60)}`,
        status: 'awaiting_reply_approval',
        data: JSON.stringify({
          source: String(payload.source || 'google_business_profile'),
          rating,
          reviewText,
          sentiment: ai.structured,
          suggestedReply:
            rating <= 3
              ? 'Thank you for sharing honest feedback. Our specialist team would like to assist you directly.'
              : 'Thank you sincerely for your kind review!',
        }),
        createdBy: params.actor,
      },
    });
    return { record, ai };
  }

  if (params.moduleKey === 'affiliate_marketing') {
    const partnerEmail = String(payload.partnerEmail || '').trim().toLowerCase();
    const customerEmail = String(payload.customerEmail || '').trim().toLowerCase();
    const selfReferralFlag = Boolean(partnerEmail && customerEmail && partnerEmail === customerEmail);
    const referralCode = String(payload.referralCode || `ALO-${crypto.randomBytes(3).toString('hex').toUpperCase()}`);
    const saleUsd = Number(payload.saleUsd ?? 0);
    const ratePct = Number(payload.commissionRatePct ?? 15);
    const commissionUsd = Number(((saleUsd * ratePct) / 100).toFixed(2));
    const record = await db.factoryModuleRecord.create({
      data: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        recordType: 'affiliate_entry',
        title: params.title?.trim() || `Affiliate ${referralCode}`,
        status: selfReferralFlag ? 'flagged_self_referral' : 'awaiting_payout_approval',
        data: JSON.stringify({
          referralCode,
          partnerEmail,
          customerEmail,
          saleUsd,
          commissionRatePct: ratePct,
          commissionUsd,
          selfReferralFlag,
        }),
        createdBy: params.actor,
      },
    });
    return { record };
  }

  // customer_journey, analytics_attribution, marketing_intelligence
  const record = await db.factoryModuleRecord.create({
    data: {
      workspaceId: params.workspaceId,
      moduleKey: params.moduleKey,
      recordType: `${params.moduleKey}_snapshot`,
      title: params.title?.trim() || `${mod.shortName} Snapshot`,
      status: 'recorded',
      data: JSON.stringify({ ...payload, recordedAt: new Date().toISOString() }),
      createdBy: params.actor,
    },
  });

  await auditEvent({
    actor: params.actor,
    action: `factory.module.${params.moduleKey}.${params.action}`,
    target: `${params.workspaceId}:${record.id}`,
    ip: params.ip,
  });

  return { record };
}
