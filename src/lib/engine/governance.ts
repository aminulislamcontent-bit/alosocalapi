import { db } from '@/lib/db';

// ─── Contact governance: DNC / opt-out / lawful-basis gate (§8, §14) ─
// Outbound contact is NEVER automatic. Every contact path passes here.

export type GovernanceChannel =
  | 'website_form'
  | 'public_email'
  | 'public_phone'
  | 'social_page'
  | 'whatsapp'
  | 'sms'
  | 'email';

export function normalizeIdentifier(channel: string, identifier: string): string {
  const raw = identifier.trim().toLowerCase();
  if (channel === 'public_email' || channel === 'email') {
    return raw.replace(/\s+/g, '');
  }
  if (channel === 'public_phone' || channel === 'whatsapp' || channel === 'sms') {
    const digits = raw.replace(/[^0-9]/g, '');
    return digits.startsWith('880') ? digits : digits;
  }
  // domains / pages
  try {
    if (raw.includes('.')) {
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      return u.host.replace(/^www\./, '');
    }
  } catch {
    /* fallthrough */
  }
  return raw;
}

export interface GovernanceDecision {
  allowed: boolean;
  reason: string;
  blockers: string[];
}

export async function checkContactAllowed(opts: {
  clientId: string;
  channel: string;
  identifier: string;
  lawfulBasis?: string | null;
  consentStatus?: string | null;
  approvedApprovalId?: string | null;
}): Promise<GovernanceDecision> {
  const blockers: string[] = [];
  const id = normalizeIdentifier(opts.channel, opts.identifier);

  const gov = await db.contactGovernance.findUnique({
    where: {
      clientId_channel_identifier: {
        clientId: opts.clientId,
        channel: opts.channel,
        identifier: id,
      },
    },
  });
  if (gov && gov.status !== 'allow') {
    blockers.push(
      gov.status === 'dnc'
        ? `Do-Not-Contact রেজিস্টারে এই পরিচয় (${id}) ব্লক করা আছে।`
        : `এই পরিচয় (${id}) অপট-আউট করেছে।`,
    );
  }

  if (!opts.lawfulBasis) {
    blockers.push('Lawful basis নথিভুক্ত নেই (যেমন: consent, public_business_info + opt-in)।');
  }

  if (['email', 'whatsapp', 'sms', 'public_email', 'public_phone'].includes(opts.channel)) {
    if (opts.consentStatus !== 'granted') {
      blockers.push('সরাসরি চ্যানেলের জন্য consent "granted" হতে হবে।');
    }
  }

  // Direct outbound requires an approved human decision (§12)
  if (!opts.approvedApprovalId) {
    blockers.push('outbound_contact ধরনের অনুমোদিত (approved) ApprovalRequest নেই।');
  } else {
    const approval = await db.approvalRequest.findUnique({
      where: { id: opts.approvedApprovalId },
    });
    if (!approval || approval.status !== 'approved' || approval.clientId !== opts.clientId) {
      blockers.push('অনুমোদন রেকর্ডটি approved নয় বা এই টেন্যান্টের নয়।');
    }
  }

  return {
    allowed: blockers.length === 0,
    reason: blockers.length ? blockers.join(' ') : 'সব শর্ত পূরণ।',
    blockers,
  };
}

export async function registerGovernance(opts: {
  clientId: string;
  channel: string;
  identifier: string;
  status: 'allow' | 'dnc' | 'opted_out';
  reason?: string;
  source?: string;
}) {
  const identifier = normalizeIdentifier(opts.channel, opts.identifier);
  return db.contactGovernance.upsert({
    where: {
      clientId_channel_identifier: {
        clientId: opts.clientId,
        channel: opts.channel,
        identifier,
      },
    },
    update: { status: opts.status, reason: opts.reason ?? null, source: opts.source ?? null },
    create: {
      clientId: opts.clientId,
      channel: opts.channel,
      identifier,
      status: opts.status,
      reason: opts.reason ?? null,
      source: opts.source ?? null,
    },
  });
}
