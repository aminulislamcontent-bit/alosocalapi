import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/security/admin-guard';
import {
  ALLOWED_OMNI_EVENTS,
  cancelOmniEvent,
  dispatchOmniEvent,
  retryOrDeadLetterEvent,
  type OmniEventType,
} from '@/lib/onboarding/omni-routing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const tenantId = req.nextUrl.searchParams.get('tenantId') || undefined;
  const status = req.nextUrl.searchParams.get('status') || undefined;

  const events = await db.omniEvent.findMany({
    where: {
      ...(tenantId ? { clientId: tenantId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ allowedEventTypes: ALLOWED_OMNI_EVENTS, events });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || 'dispatch');
  try {
    if (action === 'dispatch') {
      if (
        body.payload !== undefined &&
        (body.payload === null || typeof body.payload !== 'object' || Array.isArray(body.payload))
      ) {
        return NextResponse.json({ error: 'payload must be a plain JSON object.' }, { status: 400 });
      }
      const result = await dispatchOmniEvent({
        tenantId: String(body.tenantId || '').trim(),
        eventType: String(body.eventType || '') as OmniEventType,
        providerKey: body.providerKey ? String(body.providerKey) : undefined,
        sourceChannel: String(body.sourceChannel || 'admin_console'),
        payload: (body.payload as Record<string, unknown> | undefined) ?? {},
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
        maxAttempts: typeof body.maxAttempts === 'number' ? body.maxAttempts : undefined,
        actor: guard.user.username,
      });
      return NextResponse.json(result);
    }

    if (action === 'replay') {
      const eventId = String(body.eventId || '').trim();
      if (!eventId) return NextResponse.json({ error: 'eventId is required.' }, { status: 400 });
      const event = await retryOrDeadLetterEvent(eventId, guard.user.username);
      return NextResponse.json({ event });
    }

    if (action === 'cancel') {
      const eventId = String(body.eventId || '').trim();
      if (!eventId) return NextResponse.json({ error: 'eventId is required.' }, { status: 400 });
      const event = await cancelOmniEvent(eventId, String(body.reason || 'Cancelled by operator'), guard.user.username);
      return NextResponse.json({ event });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Omni-routing operation failed.' }, { status: 400 });
  }
}
