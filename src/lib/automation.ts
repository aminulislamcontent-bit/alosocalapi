import { db } from '@/lib/db';

// ─────────────────────────────────────────────────────────────
// ALO Education BD — CRM Automation Engine (server-side, DB-persisted)
// Events fire → enabled rules match → actions execute → runs recorded.
// Every action carries provenance (origin = rule:<id>).
// ─────────────────────────────────────────────────────────────

export type CrmEventType = 'lead_created' | 'stage_changed' | 'task_completed' | 'contact_created';

export interface CrmEvent {
  type: CrmEventType;
  contactId?: string;
  leadId?: string;
  contactName?: string;
  phone?: string;
  leadTitle?: string;
  course?: string;
  fromStage?: string;
  toStage?: string;
}

interface RulePayload {
  title?: string;
  dueInHours?: number;
  priority?: string;
  channel?: string;
  body?: string;
}

/** Fill {name} {phone} {lead} {course} {toStage} placeholders from the event */
function interpolate(tpl: string, ev: CrmEvent): string {
  return tpl
    .replaceAll('{name}', ev.contactName ?? 'ক্লায়েন্ট')
    .replaceAll('{phone}', ev.phone ?? '—')
    .replaceAll('{lead}', ev.leadTitle ?? 'লিড')
    .replaceAll('{course}', ev.course ?? 'কোর্স')
    .replaceAll('{toStage}', ev.toStage ?? '—');
}

/** Fire an event: evaluate all enabled rules for this trigger, execute actions, record runs */
export async function fireEvent(ev: CrmEvent): Promise<{ fired: number; details: string[] }> {
  const rules = await db.automationRule.findMany({
    where: { enabled: true, trigger: ev.type },
    orderBy: { createdAt: 'asc' },
  });

  const details: string[] = [];
  let fired = 0;

  for (const rule of rules) {
    // Condition gate for stage_changed rules
    if (rule.trigger === 'stage_changed' && rule.condition && rule.condition !== ev.toStage) {
      await db.automationRun.create({
        data: {
          ruleId: rule.id,
          leadId: ev.leadId,
          contactId: ev.contactId,
          status: 'skipped',
          detail: `শর্ত মেলেনি — নিয়ম "${rule.condition}" স্টেজ চায়, ইভেন্টে "${ev.toStage}"`,
        },
      });
      continue;
    }

    let payload: RulePayload = {};
    try {
      payload = JSON.parse(rule.payload || '{}') as RulePayload;
    } catch {
      payload = {};
    }

    try {
      if (rule.action === 'create_task') {
        const title = interpolate(payload.title ?? `ফলো-আপ: ${ev.contactName ?? 'ক্লায়েন্ট'}`, ev);
        const dueAt = payload.dueInHours
          ? new Date(Date.now() + payload.dueInHours * 3600_000)
          : null;
        await db.crmTask.create({
          data: {
            title,
            dueAt,
            priority: payload.priority ?? 'medium',
            contactId: ev.contactId,
            leadId: ev.leadId,
            origin: `rule:${rule.id}`,
          },
        });
        details.push(`✅ "${rule.name}" → টাস্ক তৈরি: ${title}${dueAt ? ` (ডেডলাইন ${dueAt.toLocaleDateString('bn-BD')})` : ''}`);
      } else if (rule.action === 'log_interaction') {
        const body = interpolate(payload.body ?? 'অটোমেশন ইভেন্ট রেকর্ড করা হয়েছে।', ev);
        await db.interaction.create({
          data: {
            contactId: ev.contactId!,
            leadId: ev.leadId,
            channel: payload.channel ?? 'system',
            body,
            origin: `rule:${rule.id}`,
          },
        });
        details.push(`✅ "${rule.name}" → টাইমলাইনে লগ: ${body.slice(0, 80)}${body.length > 80 ? '…' : ''}`);
      } else {
        details.push(`⚠️ "${rule.name}" → অজানা অ্যাকশন: ${rule.action}`);
      }
      fired++;
      await db.automationRun.create({
        data: {
          ruleId: rule.id,
          leadId: ev.leadId,
          contactId: ev.contactId,
          status: 'success',
          detail: details[details.length - 1] ?? 'সম্পন্ন',
        },
      });
    } catch (err) {
      await db.automationRun.create({
        data: {
          ruleId: rule.id,
          leadId: ev.leadId,
          contactId: ev.contactId,
          status: 'skipped',
          detail: `ত্রুটি: ${err instanceof Error ? err.message : 'unknown'}`,
        },
      });
    }
  }

  return { fired, details };
}

// ─── Built-in education automation templates ─────────────────

export const BUILT_IN_RULES: {
  name: string;
  trigger: CrmEventType;
  condition?: string;
  action: string;
  payload: Record<string, unknown>;
}[] = [
  {
    name: 'নতুন লিড → WhatsApp স্বাগতম মেসেজ',
    trigger: 'lead_created',
    action: 'log_interaction',
    payload: {
      channel: 'whatsapp',
      body: 'স্বাগতম {name}! ALO Education BD-তে {course}-এ আগ্রহের জন্য ধন্যবাদ। আমাদের প্রতিনিধি শীঘ্রই {phone} নম্বরে যোগাযোগ করবেন ইনশাআল্লাহ।',
    },
  },
  {
    name: 'নতুন লিড → ২৪ ঘণ্টায় ফলো-আপ কল',
    trigger: 'lead_created',
    action: 'create_task',
    payload: {
      title: 'ফলো-আপ কল দিন: {name} ({course})',
      dueInHours: 24,
      priority: 'high',
    },
  },
  {
    name: 'ডেমো স্টেজে → ডেমো রিমাইন্ডার টাস্ক',
    trigger: 'stage_changed',
    condition: 'demo',
    action: 'create_task',
    payload: {
      title: 'ডেমো ক্লাসের সময় নিশ্চিত করুন: {name}',
      dueInHours: 2,
      priority: 'high',
    },
  },
  {
    name: 'ভর্তি হলে → ডকুমেন্ট চেকলিস্ট টাস্ক',
    trigger: 'stage_changed',
    condition: 'enrolled',
    action: 'create_task',
    payload: {
      title: 'ভর্তির ডকুমেন্ট ও ফি সংগ্রহ করুন: {name}',
      dueInHours: 48,
      priority: 'high',
    },
  },
  {
    name: 'ভর্তি হলে → অভিনন্দন লগ',
    trigger: 'stage_changed',
    condition: 'enrolled',
    action: 'log_interaction',
    payload: {
      channel: 'system',
      body: 'অভিনন্দন! {name} সফলভাবে {course}-এ ভর্তি সম্পন্ন করেছেন। পরবর্তী ব্যাচের শিডিউল জানিয়ে দিন।',
    },
  },
  {
    name: 'লিড হারালে → ৩০ দিন পর রি-এনগেজ',
    trigger: 'stage_changed',
    condition: 'lost',
    action: 'create_task',
    payload: {
      title: 'রি-এনগেজমেন্ট কল: {name} — নতুন অফার জানান',
      dueInHours: 720,
      priority: 'low',
    },
  },
];

/** Insert built-in rules that are missing (matched by name). Safe to call repeatedly. */
export async function ensureBuiltInRules(): Promise<number> {
  let created = 0;
  for (const r of BUILT_IN_RULES) {
    const exists = await db.automationRule.findFirst({ where: { name: r.name } });
    if (exists) continue;
    await db.automationRule.create({
      data: {
        name: r.name,
        trigger: r.trigger,
        condition: r.condition ?? null,
        action: r.action,
        payload: JSON.stringify(r.payload),
        enabled: true,
        builtIn: true,
      },
    });
    created++;
  }
  return created;
}
