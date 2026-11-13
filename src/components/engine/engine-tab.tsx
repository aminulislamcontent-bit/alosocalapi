'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Radar, Globe2, Target, Users2, Gauge, FileEdit, Database, Stamp,
  ScrollText, RefreshCw, Play, ShieldAlert, Plus, Link as LinkIcon, Check, X,
} from 'lucide-react';

// ─── Universal Lead Discovery & Growth Engine UI ─────────────────────
// Every number shown comes from the engine APIs (real stored data).
// Unavailable sources are displayed as unavailable — never faked.

interface Tenant { id: string; name: string; business: string; username: string }
interface TaxonomyCat { slug: string; nameEn: string; nameBn: string; custom: boolean; active: boolean; keywords: string[]; subIndustries: { slug: string; nameEn: string; nameBn: string }[] }
interface Provider { key: string; name: string; category: string; sourceUrl: string; accessMethod: string; integrationStatus: string; reliability: string; authRequired: boolean; licensing: string; notes?: string | null; lastVerifiedAt?: string | null; lastCheck?: Record<string, unknown> | null }
interface Country { code: string; nameEn: string; nameBn: string; region: string }
interface Lead {
  id: string; businessName: string; website?: string | null; category?: string | null; countryCode?: string | null;
  pipelineStatus: string; reviewStatus: string; score?: number | null; sourceProviderKey: string; sourceUrl: string;
  confidence: number; lawfulBasis?: string | null; consentStatus: string; contactType?: string | null;
  scoreBreakdown?: { summary?: string; breakdown?: { key: string; max: number; got: number; why: string }[] } | null;
}
interface Campaign { id: string; name: string; profileId?: string | null; budgetPreference: string; status: string; stats: Record<string, unknown>; sourceKeys: string[] }
interface Profile { id: string; name: string; industries: string[]; countries: string[]; keywords: string[] }
interface RunRow { id: string; campaignId?: string | null; mode: string; status: string; stats: Record<string, unknown>; logs: string[]; startedAt: string }
interface Finding { country: string; industry: string | null; industryName: string | null; demandSignals: number; newsMentions: number; opportunityScore: number; sampleTrends: { title: string; traffic?: string; url?: string }[]; sampleNews: { title: string; url: string; source?: string }[] }
interface Report { id: string; scope: Record<string, unknown>; findings: Finding[]; sources: string[]; generatedAt: string }
interface Approval { id: string; type: string; status: string; justification?: string | null; requestedBy?: string | null; createdAt: string; payload: Record<string, unknown> }
interface AuditRow { id: string; actor: string; actorRole: string; action: string; resource: string; resourceId?: string | null; createdAt: string }
interface ContentRow { id: string; platform: string; draft: string; hashtags: string[]; status: string; origin?: string }
interface AuditRowWebsite { id: string; url: string; scores: Record<string, number | undefined>; status: string; recommendations: { area: string; severity: string; recommendation: string; evidence: string }[]; createdAt: string }
interface Dashboard {
  leads: { total: number; avgScore: number | null; pipeline: { status: string; count: number }[]; byCountry: { country: string | null; count: number }[]; byCategory: { category: string | null; count: number }[] };
  discovery: { runs7d: RunRow[]; opportunityReports: number };
  providers: { byStatus: Record<string, number>; verified: string[] };
  governance: { pendingApprovals: number };
  websiteGrowth: AuditRowWebsite[];
  content: { status: string; count: number }[];
  googleFirstParty: { connected: string[]; notConfigured: string[]; note: string };
  unavailable: string[];
}

const SUBTABS = [
  { key: 'overview', label: 'ওভারভিউ', icon: Gauge },
  { key: 'opportunities', label: 'মার্কেট সুযোগ', icon: Radar },
  { key: 'campaigns', label: 'ক্যাম্পেইন', icon: Target },
  { key: 'leads', label: 'লিড পাইপলাইন', icon: Users2 },
  { key: 'website', label: 'ওয়েবসাইট গ্রোথ', icon: Globe2 },
  { key: 'content', label: 'কনটেন্ট ক্যালেন্ডার', icon: FileEdit },
  { key: 'sources', label: 'ডেটা সোর্স', icon: Database },
  { key: 'approvals', label: 'অনুমোদন ও খরচ', icon: Stamp },
  { key: 'audit', label: 'অডিট লগ', icon: ScrollText },
] as const;

const PIPELINE_STATES = ['discovered', 'data_validation', 'qualification_review', 'qualified', 'assigned', 'contact_permitted', 'contacted', 'follow_up', 'opportunity', 'customer', 'closed', 'rejected', 'duplicate', 'do_not_contact', 'data_expired'];

const STATUS_COLORS: Record<string, string> = {
  verified: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  rate_limited: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  blocked_here: 'bg-red-500/15 text-red-300 border-red-500/30',
  requires_credentials: 'bg-slate-600/20 text-slate-300 border-slate-600/40',
  planned: 'bg-slate-600/20 text-slate-400 border-slate-600/40',
  failing: 'bg-red-500/15 text-red-300 border-red-500/30',
};

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/60 p-4 ${className}`}>
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">{title}</h4>
      {children}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'bg-slate-600/20 text-slate-300 border-slate-600/40';
  return <span className={`px-2 py-0.5 rounded border text-[10px] font-mono ${color}`}>{status}</span>;
}

export default function EngineTab({ showToast }: { showToast?: (msg: string, type?: string) => void }) {
  const [sub, setSub] = useState<(typeof SUBTABS)[number]['key']>('overview');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [taxonomy, setTaxonomy] = useState<TaxonomyCat[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toast = (m: string, t = 'success') => { showToast?.(m, t); };

  useEffect(() => {
    api<{ clients?: Tenant[]; clients_list?: Tenant[] }>('/api/admin/clients')
      .then(d => {
        const list = (d.clients ?? d.clients_list ?? []) as Tenant[];
        setTenants(list);
        if (list[0]) setClientId(list[0].id);
      })
      .catch(() => toast('ক্লায়েন্ট তালিকা লোড ব্যর্থ', 'error'));
    api<{ categories: TaxonomyCat[] }>('/api/engine/taxonomy').then(d => setTaxonomy(d.categories)).catch(() => undefined);
    api<{ providers: Provider[] }>('/api/engine/providers').then(d => setProviders(d.providers)).catch(() => undefined);
    api<{ countries: Country[] }>('/api/engine/geo').then(d => setCountries(d.countries)).catch(() => undefined);
  }, [toast]);

  const loadDashboard = useCallback(() => {
    if (!clientId) return;
    setLoading(true);
    api<Dashboard>(`/api/engine/dashboard?clientId=${clientId}`)
      .then(setDash)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    const t = setTimeout(loadDashboard, 0);
    return () => clearTimeout(t);
  }, [loadDashboard]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Radar className="w-5 h-5 text-cyan-400" />
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-100">লিড ডিসকভারি ও গ্রোথ ইঞ্জিন <span className="text-slate-500 font-normal">— Universal Acquisition Engine</span></h3>
          <p className="text-[11px] text-slate-500">ফ্রি-ফার্স্ট সোর্স • প্রমাণসহ লিড • টেন্যান্ট আইসোলেশন • কোনো ফেক ডেটা নেই</p>
        </div>
        <select
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
        >
          <option value="">— টেন্যান্ট নির্বাচন —</option>
          {tenants.map(t => <option key={t.id} value={t.id}>{t.business || t.name} ({t.username})</option>)}
        </select>
        <button onClick={loadDashboard} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:text-cyan-300">
          <RefreshCw className={`w-3.5 h-3.5 inline mr-1 ${loading ? 'animate-spin' : ''}`} /> রিফ্রেশ
        </button>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        {SUBTABS.map(s => (
          <button
            key={s.key}
            onClick={() => setSub(s.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap font-semibold transition-all ${
              sub === s.key ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <s.icon className="w-3.5 h-3.5" /> {s.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
      {!clientId && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">প্রথমে একটি টেন্যান্ট (ক্লায়েন্ট ওয়ার্কস্পেস) নির্বাচন করুন।</div>}

      {sub === 'overview' && clientId && <Overview dash={dash} providers={providers} />}
      {sub === 'opportunities' && clientId && <Opportunities clientId={clientId} taxonomy={taxonomy} countries={countries} onToast={toast} />}
      {sub === 'campaigns' && clientId && <Campaigns clientId={clientId} taxonomy={taxonomy} providers={providers} onToast={toast} />}
      {sub === 'leads' && clientId && <Leads clientId={clientId} onToast={toast} />}
      {sub === 'website' && clientId && <WebsiteGrowth clientId={clientId} onToast={toast} />}
      {sub === 'content' && clientId && <Content clientId={clientId} onToast={toast} />}
      {sub === 'sources' && <Sources providers={providers} onToast={toast} />}
      {sub === 'approvals' && clientId && <ApprovalsCost clientId={clientId} onToast={toast} />}
      {sub === 'audit' && clientId && <AuditLog clientId={clientId} />}
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────

function Overview({ dash, providers }: { dash: Dashboard | null; providers: Provider[] }) {
  if (!dash) return <div className="text-xs text-slate-500">ডেটা লোড হচ্ছে…</div>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card title="মোট লিড (verified data)">
        <div className="text-2xl font-bold text-cyan-300">{dash.leads.total}</div>
        <div className="text-[11px] text-slate-500">গড় স্কোর: {dash.leads.avgScore != null ? dash.leads.avgScore.toFixed(1) : '—'}</div>
      </Card>
      <Card title="পাইপলাইন অবস্থা">
        <div className="space-y-1 max-h-28 overflow-y-auto">
          {dash.leads.pipeline.map(p => (
            <div key={p.status} className="flex justify-between text-[11px]">
              <span className="text-slate-400">{p.status}</span>
              <span className="text-slate-200 font-mono">{p.count}</span>
            </div>
          ))}
          {!dash.leads.pipeline.length && <div className="text-[11px] text-slate-500">এখনো কোনো লিড নেই।</div>}
        </div>
      </Card>
      <Card title="সোর্স স্বাস্থ্য (real verification)">
        <div className="space-y-1">
          {Object.entries(dash.providers.byStatus).map(([k, v]) => (
            <div key={k} className="flex justify-between text-[11px]">
              <Badge status={k} /> <span className="text-slate-200 font-mono">{v}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="গভর্ন্যান্স">
        <div className="text-2xl font-bold text-amber-300">{dash.governance.pendingApprovals}</div>
        <div className="text-[11px] text-slate-500">pending অনুমোদন</div>
        <div className="mt-2 text-[11px] text-slate-400">রিপোর্ট: {dash.discovery.opportunityReports}</div>
      </Card>
      <Card title="Google First-Party (আলাদা ক্যাটাগরি)" className="col-span-2">
        <div className="text-[11px] text-slate-300 mb-2">{dash.googleFirstParty.note}</div>
        <div className="text-[11px]"><span className="text-emerald-300">connected:</span> {dash.googleFirstParty.connected.join(', ') || '—'}</div>
        <div className="text-[11px]"><span className="text-slate-500">not configured:</span> {dash.googleFirstParty.notConfigured.join(', ')}</div>
      </Card>
      <Card title="Unavailable সোর্স (সৎ তালিকা)" className="col-span-2">
        <div className="text-[11px] text-slate-400 space-y-0.5 max-h-24 overflow-y-auto">
          {dash.unavailable.map(u => <div key={u}>• {u}</div>)}
        </div>
      </Card>
    </div>
  );
}

// ─── Opportunities (Mode A universal) ────────────────────────────────

function Opportunities({ clientId, taxonomy, countries, onToast }: { clientId: string; taxonomy: TaxonomyCat[]; countries: Country[]; onToast: (m: string, t?: string) => void }) {
  const [geo, setGeo] = useState('BD');
  const [industries, setIndustries] = useState<string[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => api<{ reports: Report[] }>(`/api/engine/universal?clientId=${clientId}`).then(d => setReports(d.reports)).catch(e => onToast(e.message, 'error'));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  const runScan = async () => {
    setBusy(true);
    try {
      const r = await api<{ reportId: string; summary: Record<string, unknown> }>('/api/engine/universal', {
        method: 'POST',
        body: JSON.stringify({ clientId, countries: geo.split(',').map(s => s.trim()).filter(Boolean), industrySlugs: industries }),
      });
      onToast(`স্ক্যান সম্পন্ন — ${JSON.stringify(r.summary.findings ?? '')} ফাইন্ডিং`);
      load();
    } catch (e) { onToast(e instanceof Error ? e.message : 'ব্যর্থ', 'error'); }
    setBusy(false);
  };

  const countrySuggestions = countries.filter(c => ['BD', 'IN', 'US', 'GB', 'AE', 'MY', 'SA', 'CA', 'AU', 'SG'].includes(c.code));

  return (
    <div className="space-y-3">
      <Card title="Universal Discovery (Mode A)">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input value={geo} onChange={e => setGeo(e.target.value)} placeholder="দেশ কোড (BD, IN, …)" className="w-56 px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200" />
          <div className="flex gap-1 flex-wrap">
            {countrySuggestions.map(c => (
              <button key={c.code} onClick={() => setGeo(c.code)} className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300">{c.code}</button>
            ))}
          </div>
          <select
            multiple
            value={industries}
            onChange={e => setIndustries(Array.from(e.target.selectedOptions).map(o => o.value))}
            className="h-24 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-[11px] w-64"
          >
            {taxonomy.map(t => <option key={t.slug} value={t.slug}>{t.nameBn} / {t.nameEn}</option>)}
          </select>
          <button onClick={runScan} disabled={busy} className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-50">
            <Play className="w-3.5 h-3.5 inline mr-1" /> {busy ? 'স্ক্যান চলছে…' : 'ইউনিভার্সাল স্ক্যান'}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">শুধু যাচাইকৃত ফ্রি সোর্স ব্যবহার হয় (Google Trends RSS + Google News RSS)। ফলাফলে প্রমাণ লিংক থাকবে।</p>
      </Card>

      {reports.map(r => (
        <Card key={r.id} title={`রিপোর্ট — ${r.generatedAt.slice(0, 16).replace('T', ' ')} | সোর্স: ${r.sources.join(', ') || '—'}`}>
          <div className="space-y-2">
            {r.findings.slice(0, 8).map((f, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-900 p-2.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-100">{f.country} → {f.industryName ?? f.industry}</span>
                  <span className="font-mono text-cyan-300">score {f.opportunityScore}</span>
                </div>
                <div className="text-slate-400">ট্রেন্ড সিগন্যাল: {f.demandSignals} • নিউজ মেনশন: {f.newsMentions}</div>
                {f.sampleTrends.slice(0, 2).map((t, j) => (
                  <div key={j} className="text-slate-500 truncate">• {t.title} {t.traffic ? `(${t.traffic})` : ''}</div>
                ))}
                {f.sampleNews.slice(0, 2).map((n, j) => (
                  <a key={j} href={n.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-cyan-300 truncate block">🔗 {n.title}</a>
                ))}
              </div>
            ))}
            {!r.findings.length && <div className="text-[11px] text-slate-500">এই স্কোপে কোনো ইন্ডাস্ট্রি-ম্যাপড সিগন্যাল পাওয়া যায়নি।</div>}
          </div>
        </Card>
      ))}
      {!reports.length && <div className="text-xs text-slate-500">এখনো কোনো রিপোর্ট নেই — উপরের স্ক্যান চালান।</div>}
    </div>
  );
}

// ─── Campaigns (Mode B targeted) ──────────────────────────────────────

function Campaigns({ clientId, taxonomy, providers, onToast }: { clientId: string; taxonomy: TaxonomyCat[]; providers: Provider[]; onToast: (m: string, t?: string) => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  // profile form
  const [pName, setPName] = useState('');
  const [pCountries, setPCountries] = useState('BD');
  const [pIndustries, setPIndustries] = useState<string[]>([]);
  const [pKeywords, setPKeywords] = useState('');
  // campaign form
  const [cName, setCName] = useState('');
  const [cProfile, setCProfile] = useState('');
  const [cBudget, setCBudget] = useState('free_first');
  const [cSources, setCSources] = useState<string[]>(['wikidata_sparql', 'google_news_rss']);

  const load = () => {
    api<{ profiles: Profile[] }>(`/api/engine/profiles?clientId=${clientId}`).then(d => setProfiles(d.profiles)).catch(() => undefined);
    api<{ campaigns: Campaign[] }>(`/api/engine/campaigns?clientId=${clientId}`).then(d => setCampaigns(d.campaigns)).catch(() => undefined);
    api<{ runs: RunRow[] }>(`/api/engine/discovery?clientId=${clientId}`).then(d => setRuns(d.runs)).catch(() => undefined);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  const createProfile = async () => {
    try {
      await api('/api/engine/profiles', {
        method: 'POST',
        body: JSON.stringify({
          clientId, name: pName,
          countries: pCountries.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
          industries: pIndustries,
          keywords: pKeywords.split(',').map(s => s.trim()).filter(Boolean),
        }),
      });
      onToast('প্রোফাইল তৈরি হয়েছে'); setPName(''); load();
    } catch (e) { onToast(e instanceof Error ? e.message : 'ব্যর্থ', 'error'); }
  };

  const createCampaign = async () => {
    try {
      const r = await api<{ campaignId: string }>('/api/engine/campaigns', {
        method: 'POST',
        body: JSON.stringify({ clientId, name: cName, profileId: cProfile, budgetPreference: cBudget, sourceKeys: cSources, qualificationCriteria: { minScore: 55 } }),
      });
      await api('/api/engine/campaigns', { method: 'PATCH', body: JSON.stringify({ clientId, id: r.campaignId, status: 'active' }) });
      onToast('ক্যাম্পেইন তৈরি + সক্রিয়'); setCName(''); load();
    } catch (e) { onToast(e instanceof Error ? e.message : 'ব্যর্থ', 'error'); }
  };

  const runDiscovery = async (id: string) => {
    try {
      const r = await api<{ summary: Record<string, unknown> }>('/api/engine/discovery', { method: 'POST', body: JSON.stringify({ clientId, campaignId: id }) });
      onToast(`ডিসকভারি সম্পন্ন: ${r.summary.inserted ?? 0} নতুন, ${r.summary.updated ?? 0} আপডেট`);
      load();
    } catch (e) { onToast(e instanceof Error ? e.message : 'ব্যর্থ', 'error'); }
  };

  const freeProviders = providers.filter(p => !p.authRequired);

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <Card title="নতুন টার্গেটিং প্রোফাইল">
          <div className="space-y-2 text-xs">
            <input value={pName} onChange={e => setPName(e.target.value)} placeholder="প্রোফাইলের নাম" className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200" />
            <input value={pCountries} onChange={e => setPCountries(e.target.value)} placeholder="দেশ কোড (কমা দিয়ে)" className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200" />
            <select multiple value={pIndustries} onChange={e => setPIndustries(Array.from(e.target.selectedOptions).map(o => o.value))} className="w-full h-24 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-[11px]">
              {taxonomy.map(t => <option key={t.slug} value={t.slug}>{t.nameBn} / {t.nameEn}</option>)}
            </select>
            <input value={pKeywords} onChange={e => setPKeywords(e.target.value)} placeholder="কীওয়ার্ড (কমা দিয়ে)" className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200" />
            <button onClick={createProfile} disabled={!pName} className="w-full py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-50"><Plus className="w-3.5 h-3.5 inline mr-1" /> প্রোফাইল তৈরি</button>
          </div>
        </Card>
        <Card title="নতুন ক্যাম্পেইন (Mode B)">
          <div className="space-y-2 text-xs">
            <input value={cName} onChange={e => setCName(e.target.value)} placeholder="ক্যাম্পেইনের নাম" className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200" />
            <select value={cProfile} onChange={e => setCProfile(e.target.value)} className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200">
              <option value="">— প্রোফাইল —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={cBudget} onChange={e => setCBudget(e.target.value)} className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200">
              <option value="free_only">Free Only</option>
              <option value="free_first">Free First</option>
              <option value="paid_with_approval">Paid With Approval</option>
            </select>
            <div className="flex flex-wrap gap-1.5">
              {freeProviders.map(p => (
                <button
                  key={p.key}
                  onClick={() => setCSources(s => s.includes(p.key) ? s.filter(k => k !== p.key) : [...s, p.key])}
                  className={`px-2 py-0.5 rounded border text-[10px] font-mono ${cSources.includes(p.key) ? 'bg-cyan-600/20 text-cyan-300 border-cyan-500/40' : 'bg-slate-900 text-slate-400 border-slate-700'}`}
                >{p.key}</button>
              ))}
            </div>
            <button onClick={createCampaign} disabled={!cName || !cProfile} className="w-full py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-50"><Target className="w-3.5 h-3.5 inline mr-1" /> ক্যাম্পেইন তৈরি + সক্রিয়</button>
          </div>
        </Card>
      </div>

      <Card title="ক্যাম্পেইন তালিকা">
        <div className="space-y-2">
          {campaigns.map(c => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2.5 text-xs">
              <span className="font-semibold text-slate-100">{c.name}</span>
              <Badge status={c.status} />
              <span className="text-slate-500 font-mono text-[10px]">{c.budgetPreference}</span>
              <span className="text-slate-500 text-[10px]">sources: {c.sourceKeys.join(', ') || '—'}</span>
              {Boolean(c.stats?.lastRunId) ? (<span className="text-[10px] text-slate-400">শেষ রান: inserted {String(c.stats.inserted ?? 0)}, updated {String(c.stats.updated ?? 0)}</span>) : null}
              <button onClick={() => runDiscovery(c.id)} className="ml-auto px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white text-[11px] font-semibold">
                <Play className="w-3 h-3 inline mr-1" /> ডিসকভারি চালান
              </button>
            </div>
          ))}
          {!campaigns.length && <div className="text-[11px] text-slate-500">কোনো ক্যাম্পেইন নেই।</div>}
        </div>
      </Card>

      <Card title="ডিসকভারি রান হিস্ট্রি (provenance সহ)">
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {runs.map(r => (
            <div key={r.id} className="text-[11px] text-slate-400 flex gap-2 flex-wrap">
              <Badge status={r.status} />
              <span className="font-mono">{r.mode}</span>
              <span>{r.startedAt.slice(0, 16).replace('T', ' ')}</span>
              <span className="text-slate-500">inserted {String(r.stats.inserted ?? 0)} • candidates {String(r.stats.candidates ?? 0)} • dup-updated {String(r.stats.updated ?? 0)}</span>
            </div>
          ))}
          {!runs.length && <div className="text-[11px] text-slate-500">কোনো রান নেই।</div>}
        </div>
      </Card>
    </div>
  );
}

// ─── Leads pipeline ───────────────────────────────────────────────────

function Leads({ clientId, onToast }: { clientId: string; onToast: (m: string, t?: string) => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = () => {
    api<{ leads: Lead[]; total: number }>(`/api/engine/leads?clientId=${clientId}${filter ? `&pipelineStatus=${filter}` : ''}&limit=60`)
      .then(d => { setLeads(d.leads); setTotal(d.total); })
      .catch(e => onToast(e.message, 'error'));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId, filter]);

  const patch = async (id: string, action: string, value?: string, text?: string) => {
    try {
      await api('/api/engine/leads', { method: 'PATCH', body: JSON.stringify({ clientId, id, action, value, text }) });
      load();
    } catch (e) { onToast(e instanceof Error ? e.message : 'ব্যর্থ', 'error'); }
  };

  const contact = async (id: string) => {
    try {
      const r = await api<{ ok: boolean; blocked?: boolean; reason?: string; approvalId?: string }>('/api/engine/leads/contact', {
        method: 'POST', body: JSON.stringify({ clientId, leadId: id }),
      });
      if (r.blocked) onToast(`ব্লকড: ${r.reason}`, 'error');
      else onToast('যোগাযোগ workflow রেকর্ড হয়েছে (অনুমোদন সহ)');
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'ব্যর্থ';
      onToast(msg, 'error');
    }
  };

  return (
    <div className="space-y-3">
      <Card title="ফিল্টার">
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <button onClick={() => setFilter('')} className={`px-2 py-1 rounded ${!filter ? 'bg-cyan-600/20 text-cyan-300' : 'bg-slate-900 text-slate-400'} border border-slate-700`}>সব ({total})</button>
          {['qualified', 'data_validation', 'discovered', 'contacted', 'do_not_contact'].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`px-2 py-1 rounded ${filter === s ? 'bg-cyan-600/20 text-cyan-300' : 'bg-slate-900 text-slate-400'} border border-slate-700`}>{s}</button>
          ))}
        </div>
      </Card>

      <div className="space-y-2">
        {leads.map(l => (
          <div key={l.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-100">{l.businessName}</span>
              {l.website && <a href={l.website} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline flex items-center gap-0.5"><LinkIcon className="w-3 h-3" />{l.website.replace(/^https?:\/\//, '').slice(0, 30)}</a>}
              <span className="text-slate-500">{l.countryCode}</span>
              {l.category && <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">{l.category}</span>}
              <span className="font-mono text-cyan-300">score {l.score?.toFixed(0) ?? '—'}</span>
              <Badge status={l.pipelineStatus} />
              <select
                value={l.pipelineStatus}
                onChange={e => patch(l.id, 'pipeline_status', e.target.value)}
                className="ml-auto px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-200"
              >
                {PIPELINE_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
              <span>সোর্স: <a href={l.sourceUrl} target="_blank" rel="noreferrer" className="underline hover:text-cyan-300">{l.sourceProviderKey}</a></span>
              <span>confidence {l.confidence.toFixed(2)}</span>
              <span>lawful basis: {l.lawfulBasis ?? '—'}</span>
              <span>consent: {l.consentStatus}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={() => patch(l.id, 'review_status', 'verified')} className="px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-[10px]"><Check className="w-3 h-3 inline" /> verify</button>
              <button onClick={() => patch(l.id, 'review_status', 'rejected')} className="px-2 py-0.5 rounded bg-red-600/20 text-red-300 border border-red-500/30 text-[10px]"><X className="w-3 h-3 inline" /> reject</button>
              <button onClick={() => patch(l.id, 'dnc')} className="px-2 py-0.5 rounded bg-amber-600/20 text-amber-300 border border-amber-500/30 text-[10px]"><ShieldAlert className="w-3 h-3 inline" /> DNC</button>
              <button onClick={() => contact(l.id)} className="px-2 py-0.5 rounded bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 text-[10px]">contact (gated)</button>
              <button onClick={() => setExpanded(expanded === l.id ? null : l.id)} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">স্কোর ব্যাখ্যা</button>
            </div>
            {expanded === l.id && l.scoreBreakdown?.breakdown && (
              <div className="mt-2 rounded-lg bg-slate-900 border border-slate-800 p-2.5 space-y-1">
                <div className="text-[10px] text-slate-300 font-semibold">{l.scoreBreakdown.summary}</div>
                {l.scoreBreakdown.breakdown.map(b => (
                  <div key={b.key} className="flex gap-2 text-[10px]">
                    <span className="font-mono text-slate-400 w-44 shrink-0">{b.key}</span>
                    <span className="font-mono text-cyan-300">{b.got}/{b.max}</span>
                    <span className="text-slate-500 flex-1">{b.why}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {!leads.length && <div className="text-xs text-slate-500">কোনো লিড নেই — ক্যাম্পেইনে ডিসকভারি চালান বা ইমপোর্ট করুন।</div>}
      </div>
    </div>
  );
}

// ─── Website growth ───────────────────────────────────────────────────

function WebsiteGrowth({ clientId, onToast }: { clientId: string; onToast: (m: string, t?: string) => void }) {
  const [url, setUrl] = useState('');
  const [audits, setAudits] = useState<AuditRowWebsite[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => api<{ audits: AuditRowWebsite[] }>(`/api/engine/growth/website?clientId=${clientId}`).then(d => setAudits(d.audits)).catch(() => undefined);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  const run = async () => {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; error?: string }>('/api/engine/growth/website', { method: 'POST', body: JSON.stringify({ clientId, url }) });
      if (!r.ok && r.error) onToast(r.error, 'error'); else onToast('PSI অডিট সম্পন্ন (real Lighthouse data)');
      load();
    } catch (e) { onToast(e instanceof Error ? e.message : 'ব্যর্থ', 'error'); }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <Card title="PageSpeed Insights অডিট (official API, ফ্রি টিয়ার)">
        <div className="flex gap-2 text-xs">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://aloeducation.bd" className="flex-1 px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200" />
          <button onClick={run} disabled={busy || !url} className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-50">{busy ? 'চলছে…' : 'অডিট'}</button>
        </div>
      </Card>
      {audits.map(a => (
        <Card key={a.id} title={`${a.url} — ${a.createdAt.slice(0, 16).replace('T', ' ')} ${a.status !== 'completed' ? `(${a.status})` : ''}`}>
          {a.status === 'completed' ? (
            <>
              <div className="flex gap-3 text-[11px] mb-2">
                {Object.entries(a.scores).map(([k, v]) => (
                  <span key={k} className={`px-2 py-1 rounded font-mono border ${(v ?? 0) >= 90 ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : (v ?? 0) >= 50 ? 'text-amber-300 border-amber-500/30 bg-amber-500/10' : 'text-red-300 border-red-500/30 bg-red-500/10'}`}>
                    {k}: {v ?? '—'}
                  </span>
                ))}
              </div>
              <div className="space-y-1">
                {a.recommendations.map((r, i) => (
                  <div key={i} className="text-[11px] text-slate-300">
                    <span className={`font-semibold ${r.severity === 'high' ? 'text-red-300' : 'text-amber-300'}`}>[{r.severity}] {r.area}:</span> {r.recommendation}
                    <div className="text-slate-500 text-[10px]">প্রমাণ: {r.evidence}</div>
                  </div>
                ))}
                {!a.recommendations.length && <div className="text-[11px] text-emerald-300">কোনো সমস্যা পতাকা পাওয়া যায়নি।</div>}
              </div>
            </>
          ) : <div className="text-[11px] text-amber-300">PSI quota (429) — ডেটা আছে বলে দাবি করা হয়নি। পরে চেষ্টা করুন বা ফ্রি API key দিন।</div>}
        </Card>
      ))}
      {!audits.length && <div className="text-xs text-slate-500">কোনো অডিট নেই।</div>}
    </div>
  );
}

// ─── Content calendar ────────────────────────────────────────────────

function Content({ clientId, onToast }: { clientId: string; onToast: (m: string, t?: string) => void }) {
  const [items, setItems] = useState<ContentRow[]>([]);
  const [platform, setPlatform] = useState('facebook');
  const [topic, setTopic] = useState('');

  const load = () => api<{ items: ContentRow[] }>(`/api/engine/growth/content?clientId=${clientId}`).then(d => setItems(d.items)).catch(() => undefined);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  const generate = async () => {
    try {
      await api('/api/engine/growth/content', { method: 'POST', body: JSON.stringify({ clientId, platform, topic }) });
      onToast('ড্রাফট তৈরি (rule_template origin)'); setTopic(''); load();
    } catch (e) { onToast(e instanceof Error ? e.message : 'ব্যর্থ', 'error'); }
  };
  const patch = async (id: string, status: string) => {
    try {
      await api('/api/engine/growth/content', { method: 'PATCH', body: JSON.stringify({ clientId, id, status }) });
      load();
    } catch (e) { onToast(e instanceof Error ? e.message : 'ব্যর্থ', 'error'); }
  };

  return (
    <div className="space-y-3">
      <Card title="নতুন কনটেন্ট ড্রাফট (টেমপ্লেট-ভিত্তিক — মানুষ সম্পাদনা করবে)">
        <div className="flex gap-2 text-xs">
          <select value={platform} onChange={e => setPlatform(e.target.value)} className="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200">
            {['facebook', 'instagram', 'youtube', 'linkedin', 'tiktok', 'x'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="টপিক / কনটেন্ট ব্রিফ" className="flex-1 px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200" />
          <button onClick={generate} disabled={!topic} className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-50">ড্রাফট</button>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">নীতি: ফেক ফলোয়ার নেই, অটো-এনগেজমেন্ট নেই। প্রকাশনার আগে admin অনুমোদন আবশ্যক।</p>
      </Card>
      {items.map(i => (
        <Card key={i.id} title={`${i.platform} — ${i.status}`}>
          <div className="text-[11px] text-slate-200 whitespace-pre-wrap">{i.draft}</div>
          <div className="mt-1 text-[10px] text-slate-500">{i.hashtags.join(' ')}</div>
          <div className="mt-2 flex gap-1.5">
            {i.status === 'draft' && <button onClick={() => patch(i.id, 'awaiting_approval')} className="px-2 py-0.5 rounded bg-amber-600/20 text-amber-300 border border-amber-500/30 text-[10px]">অনুমোদনের জন্য পাঠান</button>}
            {i.status === 'awaiting_approval' && <button onClick={() => patch(i.id, 'approved')} className="px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-[10px]">অনুমোদন দিন (admin)</button>}
            {i.status === 'approved' && <button onClick={() => patch(i.id, 'published')} className="px-2 py-0.5 rounded bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 text-[10px]">প্রকাশিত চিহ্নিত করুন</button>}
            {['draft', 'awaiting_approval', 'approved'].includes(i.status) && <button onClick={() => patch(i.id, 'rejected')} className="px-2 py-0.5 rounded bg-red-600/20 text-red-300 border border-red-500/30 text-[10px]">বাতিল</button>}
          </div>
        </Card>
      ))}
      {!items.length && <div className="text-xs text-slate-500">কোনো কনটেন্ট আইটেম নেই।</div>}
    </div>
  );
}

// ─── Sources (provider registry) ─────────────────────────────────────

function Sources({ providers, onToast }: { providers: Provider[]; onToast: (m: string, t?: string) => void }) {
  const [verifiedList, setVerifiedList] = useState<Provider[] | null>(null);
  const [busy, setBusy] = useState(false);
  const providersState = verifiedList ?? providers;

  const verify = async () => {
    setBusy(true);
    try {
      await api('/api/engine/providers/verify', { method: 'POST', body: JSON.stringify({}) });
      onToast('সোর্স ভেরিফিকেশন সম্পন্ন — স্ট্যাটাস রিয়েল টেস্ট থেকে আপডেট হয়েছে');
      const d = await api<{ providers: Provider[] }>('/api/engine/providers');
      setVerifiedList(d.providers);
    } catch (e) { onToast(e instanceof Error ? e.message : 'ব্যর্থ', 'error'); }
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <button onClick={verify} disabled={busy} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 hover:text-cyan-300 disabled:opacity-50">
        <RefreshCw className={`w-3.5 h-3.5 inline mr-1 ${busy ? 'animate-spin' : ''}`} /> রিয়েল ভেরিফিকেশন চালান (সব ফ্রি সোর্স)
      </button>
      {providersState.map(p => (
        <div key={p.key} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-100">{p.name}</span>
            <Badge status={p.integrationStatus} />
            <span className="text-[10px] text-slate-500">{p.category} • {p.accessMethod}</span>
            <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-cyan-400 hover:underline">docs</a>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">লাইসেন্স: {p.licensing}</div>
          {p.notes && <div className="text-[10px] text-slate-400">নোট: {p.notes}</div>}
          {p.lastCheck && (
            <div className="text-[10px] text-slate-500 font-mono">
              last check: {JSON.stringify(p.lastCheck).slice(0, 140)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Approvals + cost ────────────────────────────────────────────────

function ApprovalsCost({ clientId, onToast }: { clientId: string; onToast: (m: string, t?: string) => void }) {
  const [requests, setRequests] = useState<Approval[]>([]);
  const [cost, setCost] = useState<{ period: string; usageToday: { providerKey: string; units: number; selfLimit: number | null; providerName: string }[]; warnings: { providerKey: string; used: number; limit: number; pct: number }[]; estimatedUsdThisMonth: number; note: string } | null>(null);

  const load = () => {
    api<{ requests: Approval[] }>(`/api/engine/approvals?clientId=${clientId}`).then(d => setRequests(d.requests)).catch(() => undefined);
    api<typeof cost>(`/api/engine/cost?clientId=${clientId}`).then(setCost).catch(() => undefined);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  const decide = async (id: string, decision: string) => {
    try {
      await api('/api/engine/approvals', { method: 'PATCH', body: JSON.stringify({ id, decision }) });
      onToast(`অনুমোদন ${decision === 'approved' ? 'মঞ্জুর' : 'প্রত্যাখ্যাত'}`);
      load();
    } catch (e) { onToast(e instanceof Error ? e.message : 'ব্যর্থ', 'error'); }
  };

  return (
    <div className="space-y-3">
      <Card title="অনুমোদন অনুরোধ (human-in-the-loop)">
        <div className="space-y-2">
          {requests.map(r => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2.5 text-xs">
              <Badge status={r.status} />
              <span className="font-mono text-[10px] text-cyan-300">{r.type}</span>
              <span className="text-slate-400 text-[10px]">by {r.requestedBy} • {r.createdAt.slice(0, 16).replace('T', ' ')}</span>
              {r.justification && <span className="text-slate-500 text-[10px]">{r.justification}</span>}
              {r.status === 'pending' && (
                <span className="ml-auto flex gap-1.5">
                  <button onClick={() => decide(r.id, 'approved')} className="px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-[10px]">মঞ্জুর</button>
                  <button onClick={() => decide(r.id, 'rejected')} className="px-2 py-0.5 rounded bg-red-600/20 text-red-300 border border-red-500/30 text-[10px]">প্রত্যাখ্যান</button>
                </span>
              )}
            </div>
          ))}
          {!requests.length && <div className="text-[11px] text-slate-500">কোনো অনুমোদন অনুরোধ নেই।</div>}
        </div>
      </Card>

      {cost && (
        <Card title={`খরচ বুদ্ধিমত্তা — ${cost.period} (USD)`}>
          <div className="text-[11px] text-slate-300 mb-2">এ মাসে আনুমানিক খরচ: <span className="font-mono text-emerald-300">${cost.estimatedUsdThisMonth.toFixed(2)}</span> — {cost.note}</div>
          <div className="space-y-1">
            {cost.usageToday.map(u => (
              <div key={u.providerKey} className="flex justify-between text-[11px]">
                <span className="text-slate-400">{u.providerName}</span>
                <span className="font-mono text-slate-200">{u.units} {u.selfLimit ? `/ ${u.selfLimit}/দিন` : ''}</span>
              </div>
            ))}
            {!cost.usageToday.length && <div className="text-[11px] text-slate-500">আজ কোনো ব্যবহার হয়নি।</div>}
          </div>
          {cost.warnings.map(w => (
            <div key={w.providerKey} className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
              কোটা সতর্কতা: {w.providerKey} — {w.used}/{w.limit} ({w.pct}%)
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ─── Audit log ───────────────────────────────────────────────────────

function AuditLog({ clientId }: { clientId: string }) {
  const [events, setEvents] = useState<AuditRow[]>([]);
  useEffect(() => {
    api<{ events: AuditRow[] }>(`/api/engine/audit?clientId=${clientId}&limit=80`).then(d => setEvents(d.events)).catch(() => undefined);
  }, [clientId]);

  return (
    <Card title="অডিট ট্রেইল (immutable)">
      <div className="space-y-1 max-h-96 overflow-y-auto">
        {events.map(e => (
          <div key={e.id} className="text-[11px] flex flex-wrap gap-2 text-slate-400">
            <span className="font-mono text-slate-500">{e.createdAt.slice(0, 19).replace('T', ' ')}</span>
            <span className={`font-semibold ${e.actorRole === 'admin' ? 'text-cyan-300' : 'text-slate-300'}`}>{e.actor}</span>
            <span className="font-mono text-slate-200">{e.action}</span>
            <span className="text-slate-500">{e.resource}{e.resourceId ? `#${e.resourceId.slice(0, 8)}` : ''}</span>
          </div>
        ))}
        {!events.length && <div className="text-[11px] text-slate-500">কোনো অডিট ইভেন্ট নেই।</div>}
      </div>
    </Card>
  );
}
