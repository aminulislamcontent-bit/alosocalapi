import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/security/admin-guard';
import {
  ALL_INTEGRATION_CATALOG,
  auditCatalogDocumentation,
  CANONICAL_CATEGORIES,
  CAPABILITY_KEYS,
  IMPLEMENTATION_LEVELS,
  summarizeCatalog,
} from '@/lib/intelligence/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const category = req.nextUrl.searchParams.get('category') || '';
  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  const oauthOnly = req.nextUrl.searchParams.get('oauth') === 'true';
  const webhookOnly = req.nextUrl.searchParams.get('webhook') === 'true';

  const providers = ALL_INTEGRATION_CATALOG.filter(p => {
    if (category && p.canonicalCategory !== category && p.category !== category) return false;
    if (oauthOnly && !p.oauthSupport) return false;
    if (webhookOnly && !p.webhookSupport.supported) return false;
    if (q) {
      const hay = `${p.key} ${p.displayName} ${p.canonicalCategory} ${p.authenticationType} ${p.supportedOperations.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return NextResponse.json({
    summary: summarizeCatalog(),
    canonicalCategories: CANONICAL_CATEGORIES,
    capabilityKeys: CAPABILITY_KEYS,
    implementationLevels: IMPLEMENTATION_LEVELS,
    providers,
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const audit = auditCatalogDocumentation();
  return NextResponse.json({ audit });
}
