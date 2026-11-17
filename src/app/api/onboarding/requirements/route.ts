import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/security/admin-guard';
import {
  PLATFORM_SPECIFIC_PLAYBOOKS,
  saveRequirementProfileAndRecommend,
  type ClientRequirementInput,
} from '@/lib/onboarding/recommendations';
import { dispatchOmniEvent } from '@/lib/onboarding/omni-routing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const tenantId = req.nextUrl.searchParams.get('tenantId') || undefined;
  const profiles = await db.clientRequirementProfile.findMany({
    where: tenantId ? { clientId: tenantId } : undefined,
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ profiles, playbooks: PLATFORM_SPECIFIC_PLAYBOOKS });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Partial<ClientRequirementInput> | null;
  if (!body || !body.tenantId || !body.businessName) {
    return NextResponse.json({ error: 'tenantId and businessName are required.' }, { status: 400 });
  }

  const input: ClientRequirementInput = {
    tenantId: String(body.tenantId).trim(),
    businessName: String(body.businessName).trim(),
    industry: String(body.industry || 'General Business'),
    businessModel: body.businessModel || 'b2c',
    targetCountries: Array.isArray(body.targetCountries) ? body.targetCountries : ['BD', 'US'],
    monthlyMarketingBudget: body.monthlyMarketingBudget || 'growth_500_2500',
    technicalExperience: body.technicalExperience || 'intermediate',
    requiredChannels: Array.isArray(body.requiredChannels) && body.requiredChannels.length
      ? body.requiredChannels
      : ['social', 'messaging', 'email', 'crm', 'seo', 'analytics'],
    emailVolume: body.emailVolume || '2500_to_50000',
    ecommercePlatform: body.ecommercePlatform || 'none',
    existingWebsiteDomain: String(body.existingWebsiteDomain || ''),
    existingAccounts: Array.isArray(body.existingAccounts) ? body.existingAccounts : [],
    requiredIntegrations: Array.isArray(body.requiredIntegrations) ? body.requiredIntegrations : [],
    budgetConstraint: body.budgetConstraint || 'balanced_value',
    teamSize: body.teamSize || 'small_2_10',
    privacyComplianceNeeds: Array.isArray(body.privacyComplianceNeeds) ? body.privacyComplianceNeeds : ['GDPR'],
    automationPreferences: body.automationPreferences || 'hybrid',
  };

  const result = await saveRequirementProfileAndRecommend(input);
  await dispatchOmniEvent({
    tenantId: input.tenantId,
    eventType: 'client.onboarded',
    sourceChannel: 'requirements_engine',
    payload: {
      businessName: input.businessName,
      requiredCount: result.recommendation.requiredPlatforms.length,
      recommendedCount: result.recommendation.recommendedPlatforms.length,
    },
    actor: guard.user.username,
  }).catch(() => undefined);

  return NextResponse.json(result);
}
