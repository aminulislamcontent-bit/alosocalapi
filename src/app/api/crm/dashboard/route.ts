import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { STAGES } from '@/lib/business';

/** GET /api/crm/dashboard — aggregate stats for the CRM dashboard */
export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);

  const [contacts, leads, tasks, weekInteractions, weekRuns, pipelineGroups, recentLeads] =
    await Promise.all([
      db.contact.count(),
      db.lead.count(),
      db.crmTask.findMany({ where: { done: false }, select: { dueAt: true, priority: true } }),
      db.interaction.count({ where: { createdAt: { gte: weekAgo } } }),
      db.automationRun.count({ where: { createdAt: { gte: weekAgo }, status: 'success' } }),
      db.lead.groupBy({ by: ['stage'], _count: { _all: true }, _sum: { value: true } }),
      db.lead.findMany({
        take: 6,
        orderBy: { updatedAt: 'desc' },
        include: { contact: { select: { name: true } } },
      }),
    ]);

  const byStage = Object.fromEntries(STAGES.map(s => [s.key, { count: 0, value: 0 }]));
  for (const g of pipelineGroups) {
    if (byStage[g.stage]) {
      byStage[g.stage] = { count: g._count._all, value: g._sum.value ?? 0 };
    }
  }

  const openTasks = tasks.length;
  const overdue = tasks.filter(t => t.dueAt && t.dueAt < now).length;
  const today = tasks.filter(t => t.dueAt && t.dueAt >= dayStart && t.dueAt < new Date(dayStart.getTime() + 86400_000)).length;
  const enrolled = byStage['enrolled']?.count ?? 0;
  const lost = byStage['lost']?.count ?? 0;
  const decided = enrolled + lost;
  const pipelineValue = Object.entries(byStage)
    .filter(([k]) => !['enrolled', 'lost'].includes(k))
    .reduce((s, [, v]) => s + v.value, 0);

  return NextResponse.json({
    stats: {
      contacts,
      leads,
      openTasks,
      overdue,
      dueToday: today,
      weekInteractions,
      weekRuns,
      pipelineValue,
      conversionRate: decided > 0 ? Math.round((enrolled / decided) * 100) : 0,
    },
    byStage,
    recentLeads: recentLeads.map(l => ({
      id: l.id,
      title: l.title,
      stage: l.stage,
      course: l.course,
      value: l.value,
      contactName: l.contact.name,
      updatedAt: l.updatedAt.toISOString(),
    })),
  });
}
