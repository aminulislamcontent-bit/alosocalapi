import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { ensureBuiltInRules } from '@/lib/automation';

const TRIGGERS = ['lead_created', 'stage_changed', 'task_completed', 'contact_created'];
const ACTIONS = ['create_task', 'log_interaction'];

/** GET /api/crm/automations — rules + latest runs (seeds built-ins on first visit) */
export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const seeded = await ensureBuiltInRules();
  const [rules, runs] = await Promise.all([
    db.automationRule.findMany({ orderBy: [{ builtIn: 'desc' }, { createdAt: 'asc' }] }),
    db.automationRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { rule: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({
    seeded,
    rules: rules.map(r => ({
      id: r.id,
      name: r.name,
      trigger: r.trigger,
      condition: r.condition,
      action: r.action,
      payload: JSON.parse(r.payload || '{}'),
      enabled: r.enabled,
      builtIn: r.builtIn,
    })),
    runs: runs.map(r => ({
      id: r.id,
      ruleName: r.rule.name,
      status: r.status,
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

/** POST /api/crm/automations — create a custom rule (or {"action":"seed"}) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    name?: string;
    trigger?: string;
    condition?: string;
    ruleAction?: string;
    payload?: Record<string, unknown>;
  };

  if (body.action === 'seed') {
    const created = await ensureBuiltInRules();
    return NextResponse.json({ ok: true, seeded: created });
  }

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'নিয়মের নাম দিন।' }, { status: 400 });
  if (!TRIGGERS.includes(body.trigger ?? '')) {
    return NextResponse.json({ error: 'সঠিক ট্রিগার নির্বাচন করুন।' }, { status: 400 });
  }
  if (!ACTIONS.includes(body.ruleAction ?? '')) {
    return NextResponse.json({ error: 'সঠিক অ্যাকশন নির্বাচন করুন।' }, { status: 400 });
  }

  const rule = await db.automationRule.create({
    data: {
      name,
      trigger: body.trigger!,
      condition: body.condition?.trim() || null,
      action: body.ruleAction!,
      payload: JSON.stringify(body.payload ?? {}),
      enabled: true,
      builtIn: false,
    },
  });

  return NextResponse.json({ ok: true, rule: { id: rule.id } });
}

/** PATCH /api/crm/automations — toggle enabled / edit rule */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    enabled?: boolean;
    name?: string;
    payload?: Record<string, unknown>;
  };
  const id = body.id ?? '';
  if (!id) return NextResponse.json({ error: 'আইডি প্রয়োজন।' }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if (body.payload) data.payload = JSON.stringify(body.payload);

  const rule = await db.automationRule.update({ where: { id }, data }).catch(() => null);
  if (!rule) return NextResponse.json({ error: 'নিয়ম পাওয়া যায়নি।' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/crm/automations — only custom rules can be deleted */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: 'আইডি প্রয়োজন।' }, { status: 400 });

  const rule = await db.automationRule.findUnique({ where: { id: body.id } });
  if (!rule) return NextResponse.json({ error: 'পাওয়া যায়নি।' }, { status: 404 });
  if (rule.builtIn) {
    return NextResponse.json(
      { error: 'বিল্ট-ইন নিয়ম মোছা যায় না — চাইলে বন্ধ (disable) করুন।' },
      { status: 403 }
    );
  }
  await db.automationRule.delete({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}
