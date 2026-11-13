// ─── Explainable, evidence-based lead scoring (§7) ──────────────────
// Rule: AI must not invent buying intent. intentEvidence is computed
// ONLY from stored evidence items with a recognized type.

export interface EvidenceItem {
  type: string; // procurement | expansion | request | quotation | project | news_mention | directory | trend
  detail: string;
  url?: string;
  publishedAt?: string;
}

export interface ScoreComponent {
  key: string;
  max: number;
  got: number;
  why: string;
}

export interface ScoreResult {
  score: number; // 0..100
  breakdown: ScoreComponent[];
  summary: string;
}

const INTENT_WEIGHTS: Record<string, number> = {
  procurement: 10,
  quotation: 9,
  request: 8,
  project: 8,
  expansion: 7,
  enquiry_form: 6,
  news_mention: 4,
  trend: 3,
  directory: 1,
};

const RELIABILITY: Record<string, number> = {
  high: 10,
  medium: 7,
  low: 4,
  unknown: 3,
};

export interface ScorerInput {
  industrySlug: string | null;
  matchedKeywords: string[];
  campaignIndustries: string[];
  countryCode: string | null;
  campaignCountries: string[];
  textForProductMatch: string;
  campaignKeywords: string[];
  evidence: EvidenceItem[];
  freshnessAt: Date | null;
  sourceReliability: string;
  hasWebsite: boolean;
}

export function scoreLead(input: ScorerInput): ScoreResult {
  const breakdown: ScoreComponent[] = [];

  // 1. Industry relevance 0–20
  const industryHit =
    input.industrySlug && input.campaignIndustries.includes(input.industrySlug);
  const industryGot = industryHit ? 12 + Math.min(8, input.matchedKeywords.length * 4) : 0;
  breakdown.push({
    key: 'industry_relevance',
    max: 20,
    got: industryGot,
    why: industryHit
      ? `ক্যাম্পেইনের ইন্ডাস্ট্রি "${input.industrySlug}"-এর সাথে মেলে (${input.matchedKeywords.join(', ') || 'ট্যাক্সোনমি ম্যাচ'})।`
      : 'ক্যাম্পেইনের নির্বাচিত ইন্ডাস্ট্রির সাথে মেলেনি।',
  });

  // 2. Geographic match 0–15
  const geoHit = input.countryCode && input.campaignCountries.includes(input.countryCode);
  const geoGot = geoHit ? 15 : input.countryCode ? 5 : 0;
  breakdown.push({
    key: 'geographic_match',
    max: 15,
    got: geoGot,
    why: geoHit
      ? `${input.countryCode} ক্যাম্পেইনের টার্গেট দেশের তালিকায় আছে।`
      : input.countryCode
        ? `${input.countryCode} টার্গেট তালিকায় নেই — আংশিক স্কোর।`
        : 'জিও তথ্য নেই।',
  });

  // 3. Product/service match 0–20
  const kwHits = input.campaignKeywords.filter(k =>
    input.textForProductMatch.toLowerCase().includes(k.toLowerCase()),
  );
  const productGot = Math.min(20, kwHits.length * 7);
  breakdown.push({
    key: 'product_service_match',
    max: 20,
    got: productGot,
    why: kwHits.length
      ? `ক্যাম্পেইন কীওয়ার্ড মেলেছে: ${kwHits.slice(0, 5).join(', ')}।`
      : 'পাবলিক টেক্সটে ক্যাম্পেইন কীওয়ার্ড পাওয়া যায়নি।',
  });

  // 4. Buying-intent evidence 0–25 — evidence-backed only
  const intentScores = input.evidence
    .map(e => INTENT_WEIGHTS[e.type] ?? 0)
    .filter(v => v > 0)
    .sort((a, b) => b - a);
  const intentGot = Math.min(25, intentScores.slice(0, 3).reduce((a, b) => a + b, 0));
  const topEvidence = input.evidence
    .filter(e => (INTENT_WEIGHTS[e.type] ?? 0) > 0)
    .slice(0, 3)
    .map(e => `${e.type}: ${(e.detail || '').slice(0, 90)}`);
  breakdown.push({
    key: 'intent_evidence',
    max: 25,
    got: intentGot,
    why: topEvidence.length
      ? `প্রমাণিত সিগন্যাল — ${topEvidence.join(' | ')}`
      : 'কোনো ক্রয়-উদ্দেশ্যের পাবলিক প্রমাণ পাওয়া যায়নি (অনুমান করা হয়নি)।',
  });

  // 5. Data freshness 0–10
  let freshGot = 0;
  let freshWhy = 'তারিখ তথ্য নেই।';
  if (input.freshnessAt) {
    const days = Math.floor((Date.now() - input.freshnessAt.getTime()) / 86_400_000);
    if (days <= 7) {
      freshGot = 10;
      freshWhy = `${days} দিনের পুরনো ডেটা।`;
    } else if (days <= 30) {
      freshGot = 7;
      freshWhy = `${days} দিনের পুরনো ডেটা।`;
    } else if (days <= 90) {
      freshGot = 4;
      freshWhy = `${days} দিনের পুরনো ডেটা।`;
    } else {
      freshGot = 1;
      freshWhy = `${days} দিনের পুরনো — ডেটা এক্সপায়ারি ঝুঁকি।`;
    }
  }
  breakdown.push({ key: 'data_freshness', max: 10, got: freshGot, why: freshWhy });

  // 6. Source reliability 0–10
  const relGot = RELIABILITY[input.sourceReliability] ?? 3;
  breakdown.push({
    key: 'source_reliability',
    max: 10,
    got: relGot,
    why: `সোর্স রেটিং: ${input.sourceReliability}।`,
  });

  // 7. Business suitability bonus 0–10 (website = reachable business)
  const suitGot = input.hasWebsite ? 10 : 0;
  breakdown.push({
    key: 'business_suitability',
    max: 10,
    got: suitGot,
    why: input.hasWebsite ? 'অফিসিয়াল ওয়েবসাইট যাচাইযোগ্য।' : 'ওয়েবসাইট পাওয়া যায়নি।',
  });

  const score = breakdown.reduce((a, c) => a + c.got, 0);
  const strong = breakdown.filter(c => c.got >= c.max * 0.6).length;
  return {
    score,
    breakdown,
    summary: `স্কোর ${score}/100 — ${strong}/${breakdown.length} কম্পোনেন্ট শক্তিশালী। ${
      intentGot > 0 ? 'প্রমাণভিত্তিক ইনটেন্ট সিগন্যাল আছে।' : 'ক্রয়-উদ্দেশ্যের প্রমাণ নেই।'
    }`,
  };
}

export function autoAdvanceStatus(score: number, criteria: { minScore?: number }): string {
  const min = criteria.minScore ?? 60;
  // human does qualification; system only moves to data_validation
  return score >= min ? 'data_validation' : 'discovered';
}
