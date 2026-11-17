import { NextRequest, NextResponse } from 'next/server';
import { requireFactoryAccess } from '@/lib/factory/tenancy';
import { runFactoryAiInference, type AiAdapterType, type SupportedVoiceLanguage } from '@/lib/factory/ai-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const access = await requireFactoryAccess(req, {
    workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
    permission: 'execute',
    requireCsrf: true,
  });
  if (!access.ok) return access.response;

  try {
    const result = await runFactoryAiInference({
      workspaceId: access.workspaceId,
      moduleKey: String(body.moduleKey || 'marketing_intelligence'),
      task: String(body.task || 'marketing_copy') as
        | 'marketing_copy'
        | 'voice_reply'
        | 'call_summary'
        | 'sentiment_analysis'
        | 'seo_brief'
        | 'lead_qualification',
      language: body.language ? (String(body.language) as SupportedVoiceLanguage) : 'en',
      prompt: String(body.prompt || ''),
      context: body.context && typeof body.context === 'object' ? (body.context as Record<string, unknown>) : undefined,
      adapter: body.adapter ? (String(body.adapter) as AiAdapterType) : 'local_deterministic',
      model: body.model ? String(body.model) : undefined,
      ollamaBaseUrl: body.ollamaBaseUrl ? String(body.ollamaBaseUrl) : undefined,
      openAiBaseUrl: body.openAiBaseUrl ? String(body.openAiBaseUrl) : undefined,
      actor: access.user.username,
    });
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI inference failed.' }, { status: 400 });
  }
}
