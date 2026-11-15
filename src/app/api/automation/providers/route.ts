import { NextResponse } from 'next/server';
import { requireEngineScope } from '@/lib/engine/guard';
import { getAutomationProviders } from '@/lib/automation-providers';

// ─── AI Automation Server Provider Stack status (§providers/) ─────
// Honest status: present = submodule cloned locally, configuredEnv =
// which of the provider's env vars are actually set. Nothing is faked.

export async function GET() {
  const scope = await requireEngineScope();
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const providers = getAutomationProviders();
  return NextResponse.json({
    stack: 'AI Automation Server Provider Stack',
    total: providers.length,
    present: providers.filter((p) => p.present).length,
    providers,
  });
}
