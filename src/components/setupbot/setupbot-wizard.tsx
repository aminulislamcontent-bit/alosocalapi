'use client';

// SetupBot Pro — guided, local-only collection of user-supplied integration values.
// Provider authorization and live connectivity are not performed by this wizard.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, Check, CheckCircle2, Loader2, Lock,
  LogOut, Clock, Bot, ShieldCheck, RefreshCcw, Download, Copy, ArrowLeft,
  ArrowRight, Play, PauseCircle, AlertTriangle, Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { encryptCredentialForTransfer } from '@/lib/security/credential-transfer-client';
import { PlatformIcon } from '@/components/portal/platform-icons';
import { SB_VERSION } from '@/lib/setupbot/types';

interface SbField {
  k: string; label: string; bn: string; desc: string; steps: string[];
  ph?: string; sens?: boolean; pat?: string; hint?: string; help?: string; area?: boolean;
}
interface SbPlatform {
  key: string; name: string; bn: string; icon: string; grad: string;
  fields: SbField[]; vHint?: string | null; expiry?: string | null;
}
interface SbCategory {
  key: string; emoji: string; name: string; bn: string; desc: string; grad: string; platforms: SbPlatform[];
}
interface EntryItem {
  platform: string; fieldKey: string; hasValue: boolean; encryptedAtRest: boolean; status: string;
  validationStatus: string; validationNote: string; validatedAt: string | null; updatedAt: string;
}

const BRAND_ICONS = new Set(['facebook', 'instagram', 'whatsapp', 'tiktok', 'youtube', 'linkedin', 'x', 'pinterest', 'telegram', 'google_ads', 'google_analytics', 'messenger', 'website']);
type Phase = 'welcome' | 'cats' | 'plats' | 'collect' | 'review' | 'done';

export default function SetupBotWizard({ onAuthLost, transferPassphrase, onTransferPassphraseChange }: { onAuthLost: () => void; transferPassphrase: string; onTransferPassphraseChange: (value: string) => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<SbCategory[] | null>(null);
  const [entries, setEntries] = useState<Map<string, EntryItem>>(new Map());
  const [phase, setPhase] = useState<Phase>('welcome');
  const [selCats, setSelCats] = useState<string[]>([]);
  const [selPlats, setSelPlats] = useState<string[]>([]);
  const [flowIdx, setFlowIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [verdict, setVerdict] = useState<{ platform: string; status: string; note: string } | null>(null);
  const [sessionLeft, setSessionLeft] = useState('—');
  const [idlePaused, setIdlePaused] = useState(false);
  const [jsonPreview, setJsonPreview] = useState<string | null>(null);
  const lastActivity = useRef(Date.now());
  const [flow, setFlow] = useState<{ plat: string; f: SbField }[]>([]);

  const authLost = useCallback(() => onAuthLost(), [onAuthLost]);

  // ── load catalog + entries ──
  useEffect(() => {
    (async () => {
      try {
        const [cRes, eRes] = await Promise.all([
          fetch('/api/setupbot/catalog'),
          fetch('/api/setupbot/entries'),
        ]);
        if (cRes.status === 401 || eRes.status === 401) return authLost();
        const c = await cRes.json();
        const e = await eRes.json();
        if (!cRes.ok || !eRes.ok) {
          toast({ title: c.error ?? e.error ?? 'লোড ব্যর্থ', variant: 'destructive' });
          return;
        }
        setCatalog(c.categories);
        const m = new Map<string, EntryItem>();
        for (const it of e.entries) m.set(`${it.platform}:${it.fieldKey}`, it);
        setEntries(m);
      } catch {
        toast({ title: 'নেটওয়ার্ক সমস্যা', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [authLost, toast]);

  // ── session countdown ──
  useEffect(() => {
    const iv = setInterval(() => {
      const left = sessionUserLeft();
      if (left <= 0) { authLost(); return; }
      setSessionLeft(`${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(iv);
    function sessionUserLeft() {
      // cookie session — server enforces; UI shows the wizard idle timer instead
      return Number.POSITIVE_INFINITY;
    }
  }, [authLost]);

  // ── 30-min idle → pause & auto-save note (spec SESSION MANAGEMENT) ──
  useEffect(() => {
    if (phase === 'welcome' || phase === 'done') return;
    const iv = setInterval(() => {
      if (Date.now() - lastActivity.current > 30 * 60_000) setIdlePaused(true);
    }, 30_000);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    const bump = () => { lastActivity.current = Date.now(); };
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    return () => { window.removeEventListener('pointerdown', bump); window.removeEventListener('keydown', bump); };
  }, []);

  const platByKey = useMemo(() => {
    const m = new Map<string, SbPlatform>();
    for (const c of catalog ?? []) for (const p of c.platforms) m.set(p.key, p);
    return m;
  }, [catalog]);

  const catOf = useMemo(() => {
    const m = new Map<string, SbCategory>();
    for (const c of catalog ?? []) for (const p of c.platforms) m.set(p.key, c);
    return m;
  }, [catalog]);

  const touchedPlats = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries.values()) if (e.status !== 'pending') s.add(e.platform);
    return s;
  }, [entries]);

  // ── flow = flattened selected platforms × fields ──
  const buildFlow = useCallback((plats: string[]) => {
    const out: { plat: string; f: SbField }[] = [];
    for (const c of catalog ?? []) {
      for (const pk of plats) {
        const p = c.platforms.find(x => x.key === pk);
        if (p) for (const f of p.fields) out.push({ plat: pk, f });
      }
    }
    return out;
  }, [catalog]);

  const startCollect = (plats: string[]) => {
    const nextFlow = buildFlow(plats);
    setFlow(nextFlow);
    // skip to first unfinished field
    const idx = nextFlow.findIndex(({ plat, f }) => entries.get(`${plat}:${f.k}`)?.status !== 'collected');
    setFlowIdx(idx === -1 ? 0 : idx);
    setDraft('');
    setVerdict(null);
    setPhase('collect');
  };

  const cur = flow[flowIdx];
  const curPlat = cur ? platByKey.get(cur.plat) : undefined;
  const curEntry = cur ? entries.get(`${cur.plat}:${cur.f.k}`) : undefined;
  const totalSteps = flow.length || 1;

  const saveField = async (status: 'collected' | 'skipped') => {
    if (!cur || saving) return;
    if (status === 'collected' && !draft.trim()) { toast({ title: 'আগে ভ্যালুটি লিখুন', variant: 'destructive' }); return; }
    if (status === 'collected' && !transferPassphrase) { toast({ title: 'নিরাপদ ট্রান্সফার পাসফ্রেজ দিন', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const transfer = status === 'collected' ? await encryptCredentialForTransfer(draft.trim(), transferPassphrase) : undefined;
      const res = await fetch('/api/setupbot/entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: cur.plat, fieldKey: cur.f.k, ...(transfer ? { transfer } : {}), status }),
      });
      if (res.status === 401) return authLost();
      const d = await res.json();
      if (!res.ok) { toast({ title: d.error ?? 'সংরক্ষণ ব্যর্থ', variant: 'destructive' }); return; }
      setEntries(prev => new Map(prev).set(`${cur.plat}:${cur.f.k}`, d.entry));
      setDraft('');
      setVerdict(null);
      if (flowIdx + 1 >= flow.length) {
        onTransferPassphraseChange('');
        toast({ title: 'তথ্য দেওয়া শেষ! 🎉 চাইলে offline format check চালান।' });
        setPhase('review');
      } else {
        setFlowIdx(i => i + 1);
      }
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : 'নিরাপদে সংরক্ষণ করা যায়নি', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const validateCurPlatform = async (platform: string) => {
    if (validating) return;
    setValidating(true);
    try {
      const res = await fetch('/api/setupbot/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      });
      if (res.status === 401) return authLost();
      const d = await res.json();
      if (!res.ok) { toast({ title: d.error ?? 'যাচাই ব্যর্থ', variant: 'destructive' }); return; }
      setVerdict({ platform, status: d.status, note: d.note });
      setEntries(prev => {
        const m = new Map(prev);
        for (const [k, e] of m) {
          if (e.platform === platform && e.status === 'collected') {
            m.set(k, { ...e, validationStatus: d.status, validationNote: d.note, validatedAt: new Date().toISOString() });
          }
        }
        return m;
      });
    } catch {
      toast({ title: 'নেটওয়ার্ক সমস্যা', variant: 'destructive' });
    } finally {
      setValidating(false);
    }
  };

  const buildStatusReport = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/setupbot/export');
      if (res.status === 401) { authLost(); return null; }
      if (!res.ok) { toast({ title: 'এক্সপোর্ট ব্যর্থ', variant: 'destructive' }); return null; }
      const j = await res.json();
      return JSON.stringify(j, null, 2);
    } catch {
      toast({ title: 'নেটওয়ার্ক সমস্যা', variant: 'destructive' });
      return null;
    }
  }, [authLost, toast]);

  // ── loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex items-center gap-3"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /><span>SetupBot Pro প্রস্তুত হচ্ছে...</span></div>
      </div>
    );
  }

  // ── IDLE PAUSE OVERLAY (Phase 2 / session mgmt) ──
  if (idlePaused) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 px-4">
        <PauseCircle className="w-14 h-14 text-amber-400 mb-4" />
        <h2 className="text-xl font-bold mb-2">⏸️ ৩০ মিনিট নিষ্ক্রিয় — পজ করা হয়েছে</h2>
        <p className="text-slate-400 text-sm text-center max-w-md mb-6">আপনার সব প্রগ্রেস সেভ আছে। নিরাপদে ফিরে এসে &quot;resume&quot; চাপলে ঠিক যেখানে ছিলেন সেখান থেকেই শুরু হবে।</p>
        <div className="flex gap-3">
          <Button onClick={() => { setIdlePaused(false); lastActivity.current = Date.now(); }} className="gap-2 bg-emerald-600 hover:bg-emerald-500">
            <Play className="w-4 h-4" /> resume
          </Button>
          <Button variant="ghost" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined); authLost(); }} className="text-slate-400 gap-2">
            <LogOut className="w-4 h-4" /> লগআউট
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800 px-4 lg:px-8 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-white truncate">SetupBot Pro <span className="text-cyan-400 font-mono text-xs">v{SB_VERSION}</span></h1>
              <p className="text-xs text-slate-500">আপনার ইন্টিগ্রেশন সহকারী — ধাপে ধাপে</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400">
              <Clock className="w-3.5 h-3.5 text-cyan-400" /> {sessionLeft === '—' ? 'সক্রিয়' : sessionLeft}
            </span>
            <Button variant="ghost" size="sm" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined); authLost(); }} className="text-slate-400 hover:text-red-300 gap-1.5">
              <LogOut className="w-4 h-4" /> লগআউট
            </Button>
          </div>
        </div>
        {phase === 'collect' && flow.length > 0 && (
          <div className="max-w-4xl mx-auto mt-3 flex items-center gap-3">
            <Progress value={Math.round((flowIdx / totalSteps) * 100)} className="h-2 bg-slate-900 [&>div]:bg-gradient-to-r [&>div]:from-cyan-500 [&>div]:to-blue-600" />
            <span className="text-xs font-mono text-cyan-400 shrink-0">ধাপ {flowIdx + 1}/{totalSteps}</span>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 lg:px-8 py-6 pb-32">
        {/* ═══════════ PHASE 0 — WELCOME ═══════════ */}
        {phase === 'welcome' && (
          <div className="max-w-xl mx-auto text-center py-8">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center mb-6 shadow-lg shadow-cyan-500/20">
              <Bot className="w-11 h-11 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">স্বাগতম! 🎉 SetupBot — guided API-value collection</h2>
            <p className="text-slate-400 mb-6 leading-relaxed">নির্বাচিত প্ল্যাটফর্মের জন্য একবারে একটি করে user-supplied value দিন; বাংলা গাইড সাহায্য করবে। এটি provider-এ login, OAuth authorization, token refresh, live verification বা অন্য কোনো কাজ করে না।</p>
            <div className="text-left rounded-xl bg-slate-900/70 border border-emerald-500/30 p-5 mb-6 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><ShieldCheck className="w-4 h-4" /> নিরাপদ তথ্য জমা — সীমাবদ্ধতা জানুন</div>
              <p className="text-sm text-slate-300 leading-relaxed">Provider account password, OTP বা recovery code দেবেন না। শুধু owner-authorized API value দিন।</p>
              <p className="text-sm text-slate-400 leading-relaxed flex items-start gap-2"><Lock className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" />সেভের আগে browser-side encryption হয়; server-এ অল্প সময় plaintext প্রক্রিয়াকরণের পর configured ALOAPI vault key দিয়ে at-rest encryption হয়। Export-এ value বা ciphertext থাকে না।</p>
            </div>
            {touchedPlats.size > 0 && (
              <div className="text-left rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 mb-6 flex items-center justify-between gap-3">
                <div className="text-sm text-amber-200"><strong>{touchedPlats.size}টি প্ল্যাটফর্মে</strong> আপনার প্রগ্রেস সেভ আছে — ঠিক যেখানে ছিলেন সেখান থেকে শুরু করতে পারবেন।</div>
                <Button size="sm" onClick={() => startCollect([...touchedPlats])} className="gap-1.5 bg-amber-600 hover:bg-amber-500 shrink-0">
                  <Play className="w-3.5 h-3.5" /> resume
                </Button>
              </div>
            )}
            <Button size="lg" onClick={() => setPhase('cats')} className="w-full sm:w-auto gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold hover:opacity-90">
              <Sparkles className="w-5 h-5" /> শুরু করুন
            </Button>
          </div>
        )}

        {/* ═══════════ PHASE 1.0 — CATEGORY MENU ═══════════ */}
        {phase === 'cats' && catalog && (
          <div>
            <h2 className="text-xl font-bold text-white mb-1">আপনি কোন কোন ক্যাটাগরির প্ল্যাটফর্ম ব্যবহার করেন?</h2>
            <p className="text-sm text-slate-500 mb-5">যতগুলো দরকার সবগুলো সিলেক্ট করুন (একাধিক দিতে পারেন) — প্রতিটির ভেতরে আবার প্ল্যাটফর্ম বেছে নেবেন।</p>
            <div className="grid sm:grid-cols-2 gap-3 mb-5">
              {catalog.map((c, i) => {
                const on = selCats.includes(c.key);
                return (
                  <button key={c.key} onClick={() => setSelCats(prev => on ? prev.filter(k => k !== c.key) : [...prev, c.key])}
                    className={`text-left rounded-xl border p-4 transition-all ${on ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br ${c.grad} flex items-center justify-center text-lg`}>{c.emoji}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white">{i + 1}. {c.bn}</div>
                        <div className="text-xs text-slate-500 truncate">{c.desc}</div>
                      </div>
                      <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-cyan-500 border-cyan-400' : 'border-slate-600'}`}>
                        {on && <Check className="w-3.5 h-3.5 text-slate-950" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setPhase('plats')} disabled={selCats.length === 0} className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold hover:opacity-90">
                পরের ধাপ <ArrowRight className="w-4 h-4" /> <span className="text-xs font-mono">({selCats.length} ক্যাটাগরি)</span>
              </Button>
              <Button variant="ghost" onClick={() => { setSelCats(['social']); setPhase('plats'); }} className="text-slate-400 gap-2">
                ১০. শুধু Meta/WhatsApp দরকার
              </Button>
            </div>
          </div>
        )}

        {/* ═══════════ PHASE 1.1 — PLATFORM MENU ═══════════ */}
        {phase === 'plats' && catalog && (
          <div>
            <h2 className="text-xl font-bold text-white mb-1">কোন কোন প্ল্যাটফর্ম যুক্ত করবেন? নম্বর বলুন:</h2>
            <p className="text-sm text-slate-500 mb-5">প্রতিটি প্ল্যাটফর্মে কতগুলো তথ্য লাগবে সেটি ডানে দেখানো আছে। ✅ = আগে থেকে কিছু সেভ করা আছে।</p>
            <div className="space-y-5">
              {(catalog.filter(c => selCats.includes(c.key))).map(c => (
                <div key={c.key}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-7 h-7 rounded-lg bg-gradient-to-br ${c.grad} flex items-center justify-center text-sm`}>{c.emoji}</span>
                    <span className="text-sm font-semibold text-slate-200">{c.bn}</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {c.platforms.map(p => {
                      const on = selPlats.includes(p.key);
                      const done = touchedPlats.has(p.key);
                      return (
                        <button key={p.key} onClick={() => setSelPlats(prev => on ? prev.filter(k => k !== p.key) : [...prev, p.key])}
                          className={`text-left rounded-lg border px-3.5 py-2.5 transition-all flex items-center gap-3 ${on ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'}`}>
                          <div className="w-7 h-7 shrink-0 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center">
                            {BRAND_ICONS.has(p.icon) ? <PlatformIcon name={p.icon} className="w-4 h-4 text-slate-300" /> : <span className="text-xs">{p.icon}</span>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-white truncate">{p.bn}</div>
                            <div className="text-[11px] text-slate-500">{p.fields.length}টি তথ্য{done ? ' · ✅ আগের ডেটা আছে' : ''}</div>
                          </div>
                          <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-cyan-500 border-cyan-400' : 'border-slate-600'}`}>
                            {on && <Check className="w-3.5 h-3.5 text-slate-950" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-6">
              <Button onClick={() => startCollect(selPlats)} disabled={selPlats.length === 0} className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold hover:opacity-90">
                সংগ্রহ শুরু <ArrowRight className="w-4 h-4" /> <span className="text-xs font-mono">({selPlats.length} প্ল্যাটফর্ম)</span>
              </Button>
              <Button variant="ghost" onClick={() => setPhase('cats')} className="text-slate-400 gap-2"><ArrowLeft className="w-4 h-4" /> ফিরে যান</Button>
            </div>
          </div>
        )}

        {/* ═══════════ PHASE 1.2 + 2 — ONE-QUESTION-AT-A-TIME ═══════════ */}
        {phase === 'collect' && cur && curPlat && (
          <div className="max-w-xl mx-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br ${curPlat.grad} flex items-center justify-center`}>
                {BRAND_ICONS.has(curPlat.icon) ? <PlatformIcon name={curPlat.icon} className="w-6 h-6 text-white" /> : <span className="text-xl">{curPlat.icon}</span>}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-white truncate">{curPlat.bn}</div>
                <div className="text-xs text-slate-500 truncate">{curPlat.name} · {curPlat.fields.length}টি তথ্য{curPlat.expiry ? ` · মেয়াদ: ${curPlat.expiry}` : ''}</div>
              </div>
            </div>

            <Card className="bg-slate-900/60 border-slate-800">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="font-semibold text-white">{cur.f.bn} <span className="text-xs font-mono text-slate-500">{cur.f.label}</span></h3>
                    <p className="text-sm text-slate-400 mt-1">{cur.f.desc}</p>
                  </div>
                  <button onClick={() => setGuideOpen(g => !g)} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 shrink-0">
                    কীভাবে পাবেন? {guideOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {guideOpen && (
                  <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-4 mb-4 text-sm text-slate-300 space-y-2">
                    <ol className="list-decimal list-inside space-y-1.5">
                      {cur.f.steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                    {cur.f.hint && <p className="text-xs text-amber-300">ফরম্যাট: {cur.f.hint}</p>}
                    {cur.f.help && <a href={cur.f.help} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 underline">অফিশিয়াল হেল্প লিংক</a>}
                  </div>
                )}
                {curEntry?.status === 'collected' && curEntry.hasValue && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs text-emerald-200">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Saved encrypted value is present. The server never returns its plaintext; enter a replacement only if needed.
                  </div>
                )}
                <div className="mb-3 rounded-lg border border-cyan-500/20 bg-slate-950/70 p-3">
                  <label htmlFor="setupbot-transfer-passphrase" className="block text-xs font-semibold text-cyan-200">Transfer passphrase (16+ UTF-8 bytes)</label>
                  <Input id="setupbot-transfer-passphrase" type="password" autoComplete="off" value={transferPassphrase} onChange={event => onTransferPassphraseChange(event.target.value)} placeholder="Unique passphrase; not a provider password" className="mt-2 bg-slate-900 border-slate-700 text-sm" />
                  <p className="mt-1 text-[10px] text-slate-500">Only held in page memory; the browser encrypts this value before sending it.</p>
                </div>
                <div className="flex gap-2">
                  {cur.f.area && !cur.f.sens ? (
                    <Textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={cur.f.ph ?? 'এখানে পেস্ট করুন'} rows={4}
                      className="bg-slate-950 border-slate-700 text-slate-100 font-mono text-sm" />
                  ) : (
                    <Input value={draft} onChange={e => setDraft(e.target.value)} placeholder={cur.f.ph ?? 'এখানে পেস্ট করুন'} type={cur.f.sens ? 'password' : 'text'} autoComplete="off"
                      className="bg-slate-950 border-slate-700 text-slate-100 font-mono text-sm" />
                  )}
                </div>
                {cur.f.sens && <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1"><Lock className="w-3 h-3" /> Credential plaintext is masked while entering; it is not retrieved for display after save.</p>}

                {verdict && verdict.platform === cur.plat && (
                  <div className={`mt-4 rounded-lg border p-3 text-sm flex items-start gap-2 ${verdict.status === 'format_only' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : verdict.status === 'invalid' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>
                    {verdict.status === 'format_only' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span>{verdict.note}</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-5">
                  <Button onClick={() => saveField('collected')} disabled={saving} className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold hover:opacity-90">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {flowIdx + 1 >= flow.length ? 'সংরক্ষণ ও শেষ ধাপ' : 'সংরক্ষণ ও পরবর্তী'}
                  </Button>
                  <Button variant="ghost" onClick={() => saveField('skipped')} disabled={saving} className="text-amber-300 gap-1.5">নেই / স্কিপ</Button>
                  {flowIdx > 0 && (
                    <Button variant="ghost" onClick={() => { setFlowIdx(i => i - 1); setDraft(''); setVerdict(null); }} className="text-slate-400 gap-1.5"><ArrowLeft className="w-4 h-4" /> back</Button>
                  )}
                  {curEntry?.status === 'collected' && (
                    <Button variant="ghost" onClick={() => validateCurPlatform(cur.plat)} disabled={validating} className="text-cyan-300 gap-1.5">
                      {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Offline format check
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 mt-3">Provider-এর নিজস্ব sign-in-এ MFA চাইলে শুধু সেই official provider page/app-এ দিন। OTP বা recovery code কখনো ALOAPI-তে লিখবেন না। এই wizard কোনো OTP গ্রহণ বা সংরক্ষণ করে না।</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ═══════════ PHASE 3 — OFFLINE FORMAT REVIEW ═══════════ */}
        {phase === 'review' && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-bold text-white mb-1">Offline format review</h2>
            <p className="text-sm text-slate-400 mb-5">Optional local format/presence checks only. No provider API calls, login, authorization, token-validity test, or live account verification is performed.</p>
            <div className="rounded-xl border border-slate-800 overflow-hidden mb-5">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-slate-400 text-xs">
                  <tr><th className="text-left px-4 py-2.5">প্ল্যাটফর্ম</th><th className="text-left px-4 py-2.5">তথ্য</th><th className="text-left px-4 py-2.5">অবস্থা</th><th className="px-4 py-2.5"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {[...touchedPlats].map(pk => {
                    const p = platByKey.get(pk);
                    if (!p) return null;
                    const es = [...entries.values()].filter(e => e.platform === pk && e.status !== 'pending');
                    const collected = es.filter(e => e.status === 'collected');
                    const statuses = collected.map(entry => entry.validationStatus);
                    const cat = catOf.get(pk);
                    const row = statuses.some(status => status === 'invalid')
                      ? { icon: <AlertTriangle className="w-4 h-4 text-red-400 inline" />, label: 'ফরম্যাট মেলেনি', cls: 'text-red-300' }
                      : collected.length > 0 && statuses.every(status => status === 'format_only')
                        ? { icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 inline" />, label: 'ফরম্যাট পরীক্ষা পাস · access অনিরীক্ষিত', cls: 'text-emerald-300' }
                        : statuses.some(status => status === 'error')
                          ? { icon: <AlertTriangle className="w-4 h-4 text-amber-400 inline" />, label: 'পরীক্ষা করা যায়নি', cls: 'text-amber-300' }
                          : { icon: <Clock className="w-4 h-4 text-slate-500 inline" />, label: 'পরীক্ষা হয়নি', cls: 'text-slate-400' };
                    return (
                      <tr key={pk} className="bg-slate-950/40">
                        <td className="px-4 py-2.5 text-white">{p.bn}</td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{collected.length}/{p.fields.length} <span className="text-slate-600">({cat?.bn ?? '—'})</span></td>
                        <td className={`px-4 py-2.5 text-xs ${row.cls}`}>{row.icon} {row.label}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => startCollect([pk])} className="text-xs text-cyan-400 hover:text-cyan-300">আবার দিন</button>
                          <span className="text-slate-700 mx-1.5">|</span>
                          <button onClick={() => validateCurPlatform(pk)} disabled={validating} className="text-xs text-slate-400 hover:text-slate-200">ফরম্যাট পরীক্ষা</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={async () => {
                const j = await buildStatusReport();
                if (j) { setJsonPreview(j); setPhase('done'); }
              }} className="gap-2 bg-gradient-to-r from-emerald-500 to-green-600 text-slate-950 font-bold hover:opacity-90">
                Status-only report তৈরি করুন <ArrowRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" onClick={() => setPhase('cats')} className="text-slate-400 gap-2"><ArrowLeft className="w-4 h-4" /> আরও প্ল্যাটফর্ম যোগ করুন</Button>
            </div>
          </div>
        )}

        {/* ═══════════ PHASE 4 — STATUS-ONLY REPORT ═══════════ */}
        {phase === 'done' && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-white mb-2">তথ্য সংগ্রহ সম্পন্ন</h2>
              <p className="text-slate-400 text-sm leading-relaxed">ALOAPI credentials-কে server-side vault-এ encrypted at rest রাখে, তবে কোনো provider-এ connect, authorize, verify বা token refresh করে না। নিচের JSON-এ শুধু status/format-check metadata আছে — credential value বা ciphertext নেই।</p>
            </div>
            {jsonPreview && (
              <Card className="bg-slate-900/60 border-slate-800 mb-5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-200">Credential-free status JSON</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(jsonPreview).then(() => toast({ title: 'কপি হয়েছে ✔' })).catch(() => toast({ title: 'কপি ব্যর্থ', variant: 'destructive' })); }} className="text-cyan-300 gap-1.5 h-8"><Copy className="w-3.5 h-3.5" /> কপি</Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        const blob = new Blob([jsonPreview], { type: 'application/json' });
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = 'setupbot-status-report.json';
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }} className="text-emerald-300 gap-1.5 h-8"><Download className="w-3.5 h-3.5" /> ডাউনলোড</Button>
                    </div>
                  </div>
                  <pre className="max-h-72 overflow-auto custom-scrollbar rounded-lg bg-slate-950 border border-slate-800 p-3 text-[11px] font-mono text-slate-400 whitespace-pre-wrap">{jsonPreview.slice(0, 4000)}{jsonPreview.length > 4000 ? '\n… (সম্পূর্ণটি ডাউনলোড/কপি বাটনে)' : ''}</pre>
                </CardContent>
              </Card>
            )}
            <div className="text-center">
              <Button variant="ghost" onClick={() => setPhase('cats')} className="text-slate-400 gap-2"><RefreshCcw className="w-4 h-4" /> restart — আবার শুরু করুন</Button>
              <p className="text-xs text-slate-600 mt-4">ধন্যবাদ! কোনো সমস্যায় &quot;help&quot; লিখুন বা এজেন্সিকে জানান। 🙏</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
