import { loopback, localPreflight } from '@/lib/ecosystem/ollama';
import { localModel } from '@/lib/ecosystem/catalog';
import { resolveVaultSecretForServer } from '@/lib/onboarding/vault-service';
import { recordFactoryUsage } from './billing';

export type AiAdapterType = 'local_deterministic' | 'ollama_local_http' | 'openai_compatible';
export type SupportedVoiceLanguage = 'bn' | 'en' | 'hi' | 'ar' | 'es';

export interface AiInferenceRequest {
  workspaceId: string;
  moduleKey: string;
  task:
    | 'marketing_copy'
    | 'voice_reply'
    | 'call_summary'
    | 'sentiment_analysis'
    | 'seo_brief'
    | 'lead_qualification';
  language?: SupportedVoiceLanguage;
  prompt: string;
  context?: Record<string, unknown>;
  adapter?: AiAdapterType;
  model?: string;
  ollamaBaseUrl?: string;
  openAiBaseUrl?: string;
  catalogId?: string;
  actor: string;
}

export interface AiInferenceResult {
  adapterUsed: AiAdapterType;
  model: string;
  language: SupportedVoiceLanguage;
  outputText: string;
  structured: Record<string, unknown>;
  tokensEstimated: number;
  isExternalModelCall: boolean;
  notice?: string;
}

const LOCAL_VOICE_RESPONSES: Record<SupportedVoiceLanguage, { ack: string; offerHelp: string; handoff: string }> = {
  bn: {
    ack: 'ধন্যবাদ। আমি আপনার কথা বুঝতে পেরেছি।',
    offerHelp: 'আপনার কোর্স বা সার্ভিস সংক্রান্ত বিস্তারিত জানাতে পারি, অথবা চাইলে আমাদের মানব প্রতিনিধির সাথে সংযোগ করে দিতে পারি।',
    handoff: 'আমি এখনই আপনাকে আমাদের একজন অভিজ্ঞ মানব প্রতিনিধির কাছে স্থানান্তর করছি। অনুগ্রহ করে একটু অপেক্ষা করুন।',
  },
  en: {
    ack: 'Thank you, I have noted your request.',
    offerHelp: 'I can share verified details about plans, appointments, or connect you directly with a specialist.',
    handoff: 'Transferring your call now to an available human representative along with your conversation summary.',
  },
  hi: {
    ack: 'धन्यवाद, मैंने आपकी बात समझ ली है।',
    offerHelp: 'मैं आपको सेवा की जानकारी दे सकता हूँ या हमारे प्रतिनिधि से आपकी बात करवा सकता हूँ।',
    handoff: 'मैं अभी आपकी कॉल हमारे मानव प्रतिनिधि को ट्रांसफर कर रहा हूँ।',
  },
  ar: {
    ack: 'شكراً لتواصلك، لقد تم تسجيل طلبك.',
    offerHelp: 'يمكنني تزويدك بالتفاصيل المعتمدة أو تحويلك مباشرة إلى أحد ممثلي خدمة العملاء.',
    handoff: 'جاري تحويل مكالمتك الآن إلى ممثل بشري مختص.',
  },
  es: {
    ack: 'Gracias, he registrado su consulta.',
    offerHelp: 'Puedo compartir información verificada o conectarle con un especialista humano.',
    handoff: 'Transfiriendo su llamada a un agente humano con el resumen de su solicitud.',
  },
};

function detectSentimentLocal(text: string): { sentiment: 'positive' | 'neutral' | 'negative'; score: number; urgent: boolean } {
  const lower = text.toLowerCase();
  const negWords = ['angry', 'bad', 'terrible', 'refund', 'complaint', 'stop', 'cancel', 'সমস্যা', 'খারাপ', 'অভিযোগ', 'বিরক্ত'];
  const posWords = ['great', 'good', 'thanks', 'interested', 'book', 'yes', 'ভালো', 'ধন্যবাদ', 'আগ্রহী', 'হ্যাঁ'];
  let score = 0;
  for (const w of negWords) if (lower.includes(w)) score -= 1;
  for (const w of posWords) if (lower.includes(w)) score += 1;
  const urgent = ['human', 'agent', 'manager', 'complaint', 'refund', 'মানুষ', 'এজেন্ট', 'প্রতিনিধি'].some(w => lower.includes(w));
  const sentiment = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  return { sentiment, score, urgent };
}

function runLocalDeterministicInference(req: AiInferenceRequest): AiInferenceResult {
  const lang = req.language || 'en';
  const voiceStrings = LOCAL_VOICE_RESPONSES[lang] || LOCAL_VOICE_RESPONSES.en;
  const cleanPrompt = req.prompt.trim();
  const sentimentInfo = detectSentimentLocal(cleanPrompt);

  let outputText = '';
  let structured: Record<string, unknown> = {};

  if (req.task === 'voice_reply') {
    const wantsHuman = sentimentInfo.urgent || /\b(human|agent|representative|speak to|প্রতিনিধি|কথা বলতে চাই)\b/i.test(cleanPrompt);
    outputText = wantsHuman ? voiceStrings.handoff : `${voiceStrings.ack} ${voiceStrings.offerHelp}`;
    structured = {
      intent: wantsHuman ? 'human_handoff_requested' : 'general_inquiry',
      handoffRecommended: wantsHuman,
      sentiment: sentimentInfo.sentiment,
    };
  } else if (req.task === 'call_summary') {
    const turns = Array.isArray(req.context?.turns) ? (req.context?.turns as { speaker: string; text: string }[]) : [];
    const snippet = turns.map(t => `${t.speaker}: ${t.text}`).join(' | ').slice(0, 320);
    outputText = `Call Summary (${lang}): ${turns.length} turn(s) captured. Sentiment: ${sentimentInfo.sentiment}. ${snippet || cleanPrompt.slice(0, 200)}`;
    structured = { turnCount: turns.length, sentiment: sentimentInfo.sentiment, escalationFlag: sentimentInfo.urgent };
  } else if (req.task === 'sentiment_analysis') {
    outputText = `Sentiment classified as ${sentimentInfo.sentiment} (score ${sentimentInfo.score}, urgent=${sentimentInfo.urgent}).`;
    structured = sentimentInfo;
  } else if (req.task === 'seo_brief') {
    const topic = cleanPrompt || 'Marketing Platform Strategy';
    outputText = `SEO Brief (${lang}): Primary Focus "${topic}" | Recommended H2s: Overview, Verified Requirements, Compliance Checklist, Next Steps.`;
    structured = {
      primaryKeyword: topic,
      recommendedTitleLength: 58,
      recommendedMetaLength: 155,
      sections: ['Problem & Context', 'Verified Implementation Steps', 'Compliance & Governance', 'FAQ'],
    };
  } else if (req.task === 'lead_qualification') {
    const budget = Number(req.context?.budgetUsd ?? 0);
    const hasConsent = Boolean(req.context?.consentGranted);
    const score = Math.min(100, (hasConsent ? 40 : 10) + (budget >= 500 ? 35 : budget > 0 ? 20 : 5) + (cleanPrompt.length > 20 ? 25 : 10));
    const tier = score >= 75 ? 'hot' : score >= 50 ? 'warm' : 'nurture';
    outputText = `Lead Qualification Score: ${score}/100 (${tier}). Consent verified: ${hasConsent}.`;
    structured = { score, tier, consentGranted: hasConsent };
  } else {
    outputText = lang === 'bn'
      ? `[লোকাল ড্রাফট] ${cleanPrompt} — যাচাইকৃত তথ্য ও স্পষ্ট কল-টু-অ্যাকশনসহ সংক্ষিপ্ত বার্তা।`
      : `[Local Rule Draft] ${cleanPrompt} — concise, compliance-checked copy prepared for owner review.`;
    structured = { origin: 'local_deterministic', requiresOwnerReview: true };
  }

  const tokensEstimated = Math.max(24, Math.ceil((cleanPrompt.length + outputText.length) / 4));
  return {
    adapterUsed: 'local_deterministic',
    model: 'aloapi-local-rule-v1',
    language: lang,
    outputText,
    structured,
    tokensEstimated,
    isExternalModelCall: false,
    notice: 'Executed with built-in local deterministic inference adapter (zero external LLM API claim).',
  };
}

export async function runFactoryAiInference(req: AiInferenceRequest): Promise<AiInferenceResult> {
  const adapter: AiAdapterType = req.adapter || 'local_deterministic';
  const lang = req.language || 'en';
  let result: AiInferenceResult;

  if (adapter === 'ollama_local_http') {
    if (req.catalogId !== undefined && (req.ollamaBaseUrl || req.model)) throw Error('Catalog execution does not accept runtime overrides.');
    const model = req.catalogId !== undefined ? localModel(req.catalogId) : req.model || 'llama3.2';
    const baseUrl = loopback((req.catalogId === undefined && req.ollamaBaseUrl) || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
    if (req.catalogId !== undefined) {
      const preflight = await localPreflight(req.catalogId);
      if (preflight.reason !== 'ready') throw Error(`Catalog execution blocked: ${preflight.reason}`);
    }
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      redirect: 'error',
      body: JSON.stringify({ model, prompt: req.prompt, stream: false }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`Local Ollama server returned HTTP ${res.status}.`);
    }
    const body = (await res.json()) as { response?: string; eval_count?: number; prompt_eval_count?: number };
    const text = String(body.response || '').trim();
    if (!text) throw Error('Local Ollama returned no completion.');
    const tokens = Number(body.eval_count || 0) + Number(body.prompt_eval_count || 0) || Math.ceil(text.length / 4);
    result = {
      adapterUsed: 'ollama_local_http',
      model,
      language: lang,
      outputText: text,
      structured: { origin: 'ollama_local_http' },
      tokensEstimated: tokens,
      isExternalModelCall: false,
    };
  } else if (adapter === 'openai_compatible') {
    const secret = await resolveVaultSecretForServer({
      tenantId: req.workspaceId,
      providerKey: 'ai_inference_external',
      credentialType: 'api_key',
      actor: req.actor,
      reason: `AI inference task ${req.task} in module ${req.moduleKey}`,
    });
    if (!secret) {
      throw new Error('External AI adapter requires an authorized Vault credential (providerKey=ai_inference_external, credentialType=api_key).');
    }
    const baseUrl = (req.openAiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:') {
      throw new Error('External OpenAI-compatible base URL must use HTTPS.');
    }
    const model = req.model || 'gpt-4o-mini';
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret.plaintext}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: req.prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`External OpenAI-compatible inference returned HTTP ${res.status}.`);
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const text = body.choices?.[0]?.message?.content?.trim() || '';
    const tokens = body.usage?.total_tokens || Math.ceil(text.length / 4);
    result = {
      adapterUsed: 'openai_compatible',
      model,
      language: lang,
      outputText: text,
      structured: { origin: 'openai_compatible' },
      tokensEstimated: tokens,
      isExternalModelCall: true,
    };
  } else {
    result = runLocalDeterministicInference(req);
  }

  await recordFactoryUsage({
    workspaceId: req.workspaceId,
    moduleKey: req.moduleKey,
    metric: 'ai_tokens',
    quantity: result.tokensEstimated,
    unitCostUsd: result.isExternalModelCall ? 0.000002 : 0,
    adapter: result.adapterUsed,
    metadata: { task: req.task, model: result.model, language: result.language },
  });

  return result;
}
