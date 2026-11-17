import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/security/admin-guard';
import { ALL_INTEGRATION_CATALOG, getProviderByKey } from '@/lib/intelligence/catalog';
import {
  buildProviderBundleFiles,
  createIntegrationPackage,
  createZipArchive,
  sha256,
} from '@/lib/intelligence/export-package';
import { dispatchOmniEvent } from '@/lib/onboarding/omni-routing';
import { auditEvent } from '@/lib/security/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const providerKey = req.nextUrl.searchParams.get('providerKey') || '';
  const tenantId = req.nextUrl.searchParams.get('tenantId') || 'workspace';
  const format = (req.nextUrl.searchParams.get('format') || 'zip').toLowerCase();
  const generatedAt = new Date().toISOString();

  if (providerKey) {
    const provider = getProviderByKey(providerKey);
    if (!provider) {
      return NextResponse.json({ error: 'Unknown providerKey.' }, { status: 404 });
    }
    const wf = await db.onboardingWorkflow.findUnique({
      where: { clientId_providerKey: { clientId: tenantId, providerKey } },
    });

    const files = buildProviderBundleFiles(provider, {
      tenantId,
      workflowState: wf?.state ?? 'NOT_STARTED',
      liveVerified: wf?.state === 'VERIFIED',
      lastVerifiedAt: null,
      generatedAt,
    });

    await auditEvent({
      actor: guard.user.username,
      action: 'export.provider_bundle',
      target: `${tenantId}:${providerKey}`,
      ip: guard.ip,
      metadata: { format, fileCount: Object.keys(files).length },
    });
    await dispatchOmniEvent({
      tenantId,
      eventType: 'export.generated',
      providerKey,
      sourceChannel: 'export_api',
      payload: { format, fileCount: Object.keys(files).length },
      actor: guard.user.username,
    }).catch(() => undefined);

    if (format === 'json') {
      return NextResponse.json({
        providerKey,
        tenantId,
        generatedAt,
        secretsIncluded: false,
        files,
      }, {
        headers: {
          'X-ALOAPI-Secrets-Included': 'false',
        },
      });
    }

    if (format === 'markdown') {
      const md = [
        files[`${provider.key}/account-setup.md`],
        files[`${provider.key}/api-documentation.md`],
        files[`${provider.key}/authentication.md`],
      ].join('\n---\n\n');
      return new NextResponse(md, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${provider.key}-setup-export.md"`,
          'X-ALOAPI-Secrets-Included': 'false',
        },
      });
    }

    if (format === 'yaml') {
      const pkg = createIntegrationPackage([provider], generatedAt);
      const yaml = pkg.files[`templates/${provider.key}.yaml`];
      return new NextResponse(yaml, {
        headers: {
          'Content-Type': 'text/yaml; charset=utf-8',
          'Content-Disposition': `attachment; filename="${provider.key}.yaml"`,
          'X-ALOAPI-Secrets-Included': 'false',
        },
      });
    }

    if (format === 'csv') {
      const pkg = createIntegrationPackage([provider], generatedAt);
      return new NextResponse(pkg.files['providers.csv'], {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${provider.key}-summary.csv"`,
          'X-ALOAPI-Secrets-Included': 'false',
        },
      });
    }

    // Default: standard ZIP bundle containing all 14 files + SHA256SUMS
    const zipBuf = createZipArchive(files);
    const digest = sha256(zipBuf);
    return new NextResponse(new Uint8Array(zipBuf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="aloapi-${provider.key}-bundle.zip"`,
        'X-ALOAPI-Package-SHA256': digest,
        'X-ALOAPI-Secrets-Included': 'false',
      },
    });
  }

  // Multi-provider full bundle
  if (format === 'zip') {
    const pkg = createIntegrationPackage(ALL_INTEGRATION_CATALOG, generatedAt);
    const zipBuf = createZipArchive(pkg.files);
    const digest = sha256(zipBuf);
    await auditEvent({
      actor: guard.user.username,
      action: 'export.catalog_zip',
      target: tenantId,
      ip: guard.ip,
      metadata: { providerCount: ALL_INTEGRATION_CATALOG.length, digest },
    });
    return new NextResponse(new Uint8Array(zipBuf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="aloapi-full-catalog-bundle.zip"`,
        'X-ALOAPI-Package-SHA256': digest,
        'X-ALOAPI-Secrets-Included': 'false',
      },
    });
  }

  if (format === 'json') {
    const pkg = createIntegrationPackage(ALL_INTEGRATION_CATALOG, generatedAt);
    return new NextResponse(pkg.files['catalog.json'], {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="aloapi-full-catalog.json"',
        'X-ALOAPI-Secrets-Included': 'false',
      },
    });
  }

  if (format === 'markdown') {
    const pkg = createIntegrationPackage(ALL_INTEGRATION_CATALOG, generatedAt);
    return new NextResponse(pkg.files['catalog.md'], {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="aloapi-full-catalog.md"',
        'X-ALOAPI-Secrets-Included': 'false',
      },
    });
  }

  if (format === 'csv') {
    const pkg = createIntegrationPackage(ALL_INTEGRATION_CATALOG, generatedAt);
    return new NextResponse(pkg.files['providers.csv'], {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="aloapi-full-catalog.csv"',
        'X-ALOAPI-Secrets-Included': 'false',
      },
    });
  }

  const pkg = createIntegrationPackage(ALL_INTEGRATION_CATALOG, generatedAt);
  return new NextResponse(new Uint8Array(pkg.archive), {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': 'attachment; filename="aloapi-full-catalog-bundle.tar.gz"',
      'X-ALOAPI-Package-SHA256': pkg.sha256,
      'X-ALOAPI-Secrets-Included': 'false',
    },
  });
}
