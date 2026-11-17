import { NextRequest, NextResponse } from 'next/server';
import { requireFactoryAccess } from '@/lib/factory/tenancy';
import { FIRST_PARTY_MODULES } from '@/lib/factory/modules/registry';
import { summarizeCatalog } from '@/lib/intelligence/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Versioned Gateway Discovery Endpoint (/api/v1/factory)
 */
export async function GET(req: NextRequest) {
  const access = await requireFactoryAccess(req, {
    workspaceId: req.nextUrl.searchParams.get('workspaceId'),
    permission: 'read',
  });
  if (!access.ok) return access.response;

  return NextResponse.json({
    gatewayVersion: 'v1',
    workspaceId: access.workspaceId,
    role: access.role,
    firstPartyModulesCount: FIRST_PARTY_MODULES.length,
    firstPartyModules: FIRST_PARTY_MODULES.map(m => ({
      order: m.order,
      key: m.key,
      name: m.name,
      tier: m.tier,
      category: m.category,
      appRoute: m.appRoute,
      apiEndpoint: m.apiEndpoint,
      compatibleExternalProviders: m.compatibleExternalProviders,
    })),
    externalCatalogSummary: summarizeCatalog(),
    sharedEndpoints: {
      overview: '/api/factory/overview',
      workspaces: '/api/factory/workspaces',
      connections: '/api/factory/connections',
      jobs: '/api/factory/jobs',
      aiRouter: '/api/factory/ai',
      portability: '/api/factory/portability',
    },
  });
}
