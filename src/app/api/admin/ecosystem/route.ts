import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/security/admin-guard';
import { catalog, validateSelection } from '@/lib/ecosystem/catalog';
import { localPreflight } from '@/lib/ecosystem/ollama';
import matrix from '../../../../../reports/project-integration-status.json';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;
  return NextResponse.json(
    { ...catalog, projects: matrix.projects },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;
  try {
    const input = await req.json();
    if (input?.action === 'validate')
      return NextResponse.json({ ids: validateSelection(input.ids) });
    if (input?.action === 'preflight')
      return NextResponse.json(await localPreflight(input.id));
    return NextResponse.json(
      { error: 'Unsupported action; installation is not a web operation.' },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          'Invalid selection, runtime configuration, or unsupported model.',
      },
      { status: 400 },
    );
  }
}
