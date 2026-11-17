import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/security/admin-guard';
import {
  buildHandoverZipArchive,
  exportOwnerAuthorizedEncryptedHandover,
  generateClientHandoverPackage,
  validateClientProjectImport,
} from '@/lib/engineering/handover-packager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const projectId = req.nextUrl.searchParams.get('projectId') || '';
  const format = (req.nextUrl.searchParams.get('format') || 'json').toLowerCase();
  if (!projectId) {
    const packages = await db.clientHandoverPackage.findMany({ orderBy: { exportedAt: 'desc' }, take: 50 });
    return NextResponse.json({ packages });
  }

  try {
    const generated = await generateClientHandoverPackage({
      projectId,
      actor: guard.user.username,
      ip: guard.ip,
    });

    if (format === 'zip') {
      const { zipBuf, zipSha256 } = buildHandoverZipArchive(generated);
      return new NextResponse(new Uint8Array(zipBuf), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="aloapi-handover-${projectId}.zip"`,
          'X-ALOAPI-Secrets-Included': 'false',
          'X-ALOAPI-Package-SHA256': zipSha256,
        },
      });
    }

    if (format === 'import_manifest') {
      return NextResponse.json(generated.clientImportManifest, {
        headers: {
          'X-ALOAPI-Secrets-Included': 'false',
          'X-ALOAPI-Package-SHA256': generated.sha256,
        },
      });
    }

    return NextResponse.json(generated, {
      headers: {
        'X-ALOAPI-Secrets-Included': 'false',
        'X-ALOAPI-Package-SHA256': generated.sha256,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Handover generation failed.' }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || 'generate_package');
  try {
    if (action === 'generate_package') {
      const pkg = await generateClientHandoverPackage({
        projectId: String(body.projectId || ''),
        handoverModeOverride: body.handoverMode ? String(body.handoverMode) : undefined,
        actor: guard.user.username,
        ip: guard.ip,
      });
      return NextResponse.json(pkg, { status: 201 });
    }

    if (action === 'export_encrypted_transfer') {
      const encrypted = await exportOwnerAuthorizedEncryptedHandover({
        projectId: String(body.projectId || ''),
        explicitOwnerTransferApproval: Boolean(body.explicitOwnerTransferApproval),
        actor: guard.user.username,
        ip: guard.ip,
      });
      return NextResponse.json(encrypted);
    }

    if (action === 'validate_client_import') {
      const res = await validateClientProjectImport({
        importManifest: body.importManifest && typeof body.importManifest === 'object'
          ? (body.importManifest as Record<string, unknown>)
          : {},
        expectedSha256: body.expectedSha256 ? String(body.expectedSha256) : undefined,
        manifestForHashCheck: body.manifestForHashCheck && typeof body.manifestForHashCheck === 'object'
          ? (body.manifestForHashCheck as Record<string, unknown>)
          : undefined,
        actor: guard.user.username,
      });
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Handover action failed.' }, { status: 400 });
  }
}
