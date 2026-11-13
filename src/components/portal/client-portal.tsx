'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, CircleHelp, Check, CheckCircle2, SkipForward, Eye, EyeOff,
  Loader2, ShieldCheck, Lock, LogOut, Clock, ListChecks, Sparkles, RefreshCcw, Bot,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { PlatformIcon } from '@/components/portal/platform-icons';
import SetupBotWizard from '@/components/setupbot/setupbot-wizard';
import {
  PLATFORM_TEMPLATES, computeProgress, getTemplate,
  type CredentialField,
} from '@/lib/platforms';
import type { SessionUser } from '@/lib/auth';

interface EntryItem {
  platform: string;
  fieldKey: string;
  value: string;
  status: string;
  updatedAt: string;
}

interface ClientData {
  id: string;
  name: string;
  business: string;
  username: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  platforms: string[];
}

const fieldId = (platform: string, fieldKey: string) => `${platform}:${fieldKey}`;

export default function ClientPortal({
  sessionUser,
  onLogout,
}: {
  sessionUser: SessionUser;
  onLogout: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<Record<string, 'saving' | 'saved'>>({});
  const [openPlatform, setOpenPlatform] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState<Record<string, boolean>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ collected: number; skipped: number; total: number } | null>(null);
  const [countdown, setCountdown] = useState(15);
  const [sessionLeft, setSessionLeft] = useState<string>('—');
  const [mode, setMode] = useState<'guided' | 'bot'>('guided');
  const savingRef = useRef(false);

  const handleAuthLost = useCallback(() => onLogout(), [onLogout]);

  // ── Load data ──
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/entries');
      if (res.status === 401) return handleAuthLost();
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? 'ডেটা লোড ব্যর্থ', variant: 'destructive' });
        return;
      }
      setClientData(data.client);
      setEntries(data.entries);
      const d: Record<string, string> = {};
      for (const e of data.entries) {
        if (e.status === 'collected') d[fieldId(e.platform, e.fieldKey)] = e.value;
      }
      setDrafts(d);
      // Open first incomplete platform
      const progress = computeProgress(data.client.platforms, data.entries);
      const firstOpen = data.client.platforms.find(
        (p: string) => (progress.perPlatform[p]?.pending ?? 0) > 0
      );
      setOpenPlatform(firstOpen ?? data.client.platforms[0] ?? null);
    } catch {
      toast({ title: 'নেটওয়ার্ক সমস্যা', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [handleAuthLost, toast]);

  useEffect(() => { load(); }, [load]);

  // ── Session expiry countdown ──
  useEffect(() => {
    const expires = sessionUser.expiresAt ? new Date(sessionUser.expiresAt).getTime() : 0;
    const tick = () => {
      const left = expires - Date.now();
      if (left <= 0) {
        setSessionLeft('শেষ');
        handleAuthLost();
        return;
      }
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      setSessionLeft(`${m}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [sessionUser.expiresAt, handleAuthLost]);

  // ── Auto-logout countdown on success screen ──
  useEffect(() => {
    if (!done) return;
    if (countdown <= 0) {
      (async () => {
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
        handleAuthLost();
      })();
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [done, countdown, handleAuthLost]);

  const progress = useMemo(
    () => (clientData ? computeProgress(clientData.platforms, entries) : null),
    [clientData, entries]
  );

  const entryMap = useMemo(() => {
    const m = new Map<string, EntryItem>();
    for (const e of entries) m.set(fieldId(e.platform, e.fieldKey), e);
    return m;
  }, [entries]);

  // ── Save / skip a field ──
  const saveField = async (platform: string, field: CredentialField, status: 'collected' | 'skipped') => {
    if (savingRef.current) return;
    const id = fieldId(platform, field.key);
    const value = status === 'collected' ? (drafts[id] ?? '').trim() : '';
    if (status === 'collected' && !value) {
      toast({ title: 'আগে ভ্যালুটি লিখুন', variant: 'destructive' });
      return;
    }
    savingRef.current = true;
    setSaveState(s => ({ ...s, [id]: 'saving' }));
    try {
      const res = await fetch('/api/portal/entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, fieldKey: field.key, value, status }),
      });
      if (res.status === 401) return handleAuthLost();
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? 'সংরক্ষণ ব্যর্থ', variant: 'destructive' });
        return;
      }
      setEntries(prev => {
        const rest = prev.filter(e => !(e.platform === platform && e.fieldKey === field.key));
        return [...rest, data.entry];
      });
      if (status === 'skipped') setDrafts(d => ({ ...d, [id]: '' }));
      setSaveState(s => ({ ...s, [id]: 'saved' }));
      toast({
        title: status === 'skipped'
          ? `${field.labelBn} — স্কিপ করা হলো`
          : `${field.labelBn} সংরক্ষিত হয়েছে ✔`,
      });
    } catch {
      toast({ title: 'নেটওয়ার্ক সমস্যা', variant: 'destructive' });
    } finally {
      savingRef.current = false;
    }
  };

  // ── Complete collection ──
  const doComplete = async (force: boolean) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/portal/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      if (res.status === 401) return handleAuthLost();
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? 'সম্পন্ন করা যায়নি', variant: 'destructive' });
        return;
      }
      setDone(data.summary);
      setCountdown(15);
    } catch {
      toast({ title: 'নেটওয়ার্ক সমস্যা', variant: 'destructive' });
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  const logoutNow = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    handleAuthLost();
  };

  // ── ─────────────────────────────────────────────────────────────
  // SUCCESS SCREEN — collection finished, auto-logout countdown
  if (done) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 relative overflow-hidden">
        <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-emerald-500/10 blur-3xl" />
        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="max-w-lg w-full text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center mb-6">
              <CheckCircle2 className="w-11 h-11 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">সংগ্রহ সম্পন্ন হয়েছে! 🎉</h1>
            <p className="text-slate-400 mb-8">
              ধন্যবাদ <strong className="text-slate-200">{clientData?.name}</strong>! আপনার তথ্যগুলো নিরাপদে জমা হয়েছে।
              এখন এই পেজটি বন্ধ করে দিতে পারেন।
            </p>

            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
                <div className="text-2xl font-bold text-emerald-400">{done.collected}</div>
                <div className="text-xs text-slate-500 mt-1">সংগৃহীত তথ্য</div>
              </div>
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
                <div className="text-2xl font-bold text-amber-400">{done.skipped}</div>
                <div className="text-xs text-slate-500 mt-1">স্কিপ করা</div>
              </div>
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
                <div className="text-2xl font-bold text-cyan-400">{done.total}</div>
                <div className="text-xs text-slate-500 mt-1">মোট ফিল্ড</div>
              </div>
            </div>

            <div className="text-left rounded-xl bg-slate-900/70 border border-slate-800 p-5 mb-8 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <ShieldCheck className="w-4 h-4 text-cyan-400" /> নিরাপত্তা নোট
              </div>
              <ul className="space-y-2 text-sm text-slate-400 leading-relaxed">
                <li className="flex gap-2"><Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />আপনার সাময়িক পাসওয়ার্ড এখন <strong className="text-slate-200">নিষ্ক্রিয়</strong> হয়ে গেছে — আর কেউ এই পোর্টালে ঢুকতে পারবে না।</li>
                <li className="flex gap-2"><RefreshCcw className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />আপনি চাইলে এখন <strong className="text-slate-200">নিরাপদে আপনার সোশ্যাল মিডিয়া পাসওয়ার্ড পরিবর্তন করতে পারেন</strong> — দেওয়া API টোকেনগুলো পাসওয়ার্ড বদলালেও কাজ করতে থাকে।</li>
                <li className="flex gap-2"><Sparkles className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />কাজ শেষ হলে চাইলে টোকেনগুলো আপনি নিজেই রিভোক (বাতিল) করতে পারবেন।</li>
              </ul>
            </div>

            <p className="text-sm text-slate-500">
              স্বয়ংক্রিয় লগআউট হচ্ছে... <span className="font-mono text-cyan-400 font-bold">{countdown}</span> সেকেন্ড
            </p>
            <Button variant="ghost" onClick={logoutNow} className="mt-4 text-slate-400 hover:text-slate-200 gap-2">
              <LogOut className="w-4 h-4" /> এখনই লগআউট করুন
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ── Loading ──
  if (loading || !clientData || !progress) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          <span>আপনার কালেকশন প্ল্যান লোড হচ্ছে...</span>
        </div>
      </div>
    );
  }

  const templates = clientData.platforms
    .map(p => getTemplate(p))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  // ── SetupBot Pro mode — full-screen conversational wizard ──
  if (mode === 'bot') {
    return <SetupBotWizard onAuthLost={handleAuthLost} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800 px-4 lg:px-8 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-bold text-white truncate">স্বাগতম, {clientData.name} 👋</h1>
            <p className="text-xs text-slate-500 truncate">{clientData.business} · @{clientData.username}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setMode('bot')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 text-xs font-bold hover:opacity-90 transition-all shadow-md shadow-cyan-500/20"
              aria-label="SetupBot Pro মোড চালু করুন"
            >
              <Bot className="w-4 h-4" /> SetupBot Pro
            </button>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400">
              <Clock className="w-3.5 h-3.5 text-cyan-400" /> সেশন: {sessionLeft}
            </span>
            <Button variant="ghost" size="sm" onClick={logoutNow} className="text-slate-400 hover:text-red-300 gap-1.5">
              <LogOut className="w-4 h-4" /> লগআউট
            </Button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto mt-3 flex items-center gap-3">
          <Progress value={progress.percent} className="h-2 bg-slate-900 [&>div]:bg-gradient-to-r [&>div]:from-cyan-500 [&>div]:to-blue-600" />
          <span className="text-xs font-mono text-cyan-400 shrink-0">{progress.percent}%</span>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 lg:px-8 py-6 pb-32">
        {/* Intro card */}
        <Card className="bg-slate-900/60 border-slate-800 mb-6">
          <CardContent className="p-5">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <ListChecks className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="text-sm leading-relaxed text-slate-300">
                <p className="font-semibold text-slate-100 mb-1">কী করতে হবে?</p>
                <p className="text-slate-400">
                  নিচে আপনার সার্ভিসের জন্য প্রয়োজনীয় {progress.total}টি ফিল্ড আছে — প্রতিটির পাশে
                  &quot;<span className="text-cyan-400">কীভাবে পাবেন?</span>&quot; খুললে বাংলায় ধাপে ধাপে দেখানো আছে।
                  কোনোটি না পেলে বা না থাকলে <span className="text-amber-400">&quot;নেই / স্কিপ&quot;</span> চাপুন —
                  সমস্যা নেই। সব শেষ হলে নিচের <span className="text-emerald-400">&quot;সংগ্রহ সম্পন্ন করুন&quot;</span> চাপবেন।
                  <strong className="text-slate-200"> কোনো পাসওয়ার্ড দেওয়ার দরকার নেই — শুধু আইডি ও টোকেন।</strong>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Platform sections */}
        <div className="space-y-4">
          {templates.map(tpl => {
            const p = progress.perPlatform[tpl.key] ?? { total: 0, collected: 0, skipped: 0, pending: 0 };
            const pct = p.total === 0 ? 0 : Math.round(((p.collected + p.skipped) / p.total) * 100);
            const isOpen = openPlatform === tpl.key;
            return (
              <Card key={tpl.key} className={`bg-slate-900/60 border transition-colors ${isOpen ? 'border-cyan-500/40' : 'border-slate-800'}`}>
                <button
                  onClick={() => setOpenPlatform(isOpen ? null : tpl.key)}
                  className="w-full text-left p-4 flex items-center gap-4"
                  aria-expanded={isOpen}
                >
                  <div className={`w-11 h-11 shrink-0 rounded-xl bg-gradient-to-tr ${tpl.gradient} p-0.5`}>
                    <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                      <PlatformIcon name={tpl.icon} className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-white">{tpl.nameBn}</h3>
                      {p.pending === 0 && p.total > 0 && (
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
                          <Check className="w-3 h-3" /> সম্পন্ন
                        </Badge>
                      )}
                      {p.pending > 0 && (
                        <Badge variant="outline" className="border-slate-700 text-slate-400 text-[10px]">
                          {p.pending} বাকি
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{tpl.taglineBn}</p>
                  </div>
                  <div className="hidden sm:block w-24 shrink-0">
                    <Progress value={pct} className="h-1.5 bg-slate-950 [&>div]:bg-cyan-500" />
                    <p className="text-[10px] text-slate-500 mt-1 font-mono">{p.collected + p.skipped}/{p.total}</p>
                  </div>
                  {isOpen ? <ChevronDown className="w-5 h-5 text-slate-500 shrink-0" /> : <ChevronRight className="w-5 h-5 text-slate-500 shrink-0" />}
                </button>

                {isOpen && (
                  <CardContent className="px-4 pb-4 pt-0 border-t border-slate-800/60">
                    <p className="text-xs text-slate-400 bg-slate-950/60 rounded-lg p-3 my-4 leading-relaxed border border-slate-800/60">
                      💡 {tpl.guideBn}
                    </p>
                    <div className="space-y-3">
                      {tpl.fields.map(f => {
                        const id = fieldId(tpl.key, f.key);
                        const entry = entryMap.get(id);
                        const st = entry?.status ?? 'pending';
                        const isSensitive = f.sensitive !== false;
                        const isOpenGuide = guideOpen[id] ?? false;
                        const revealed = reveal[id] ?? false;
                        return (
                          <div key={f.key} className={`rounded-xl border p-4 transition-colors ${st === 'collected' ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : st === 'skipped' ? 'border-slate-800 bg-slate-950/40' : 'border-slate-800 bg-slate-950/60'}`}>
                            <div className="flex items-start justify-between gap-3 mb-1.5">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-medium text-sm text-slate-100">{f.labelBn}</h4>
                                  <span className="text-[10px] font-mono text-slate-500">{f.label}</span>
                                  {f.required === false && (
                                    <Badge variant="outline" className="text-[9px] border-slate-700 text-slate-500">ঐচ্ছিক</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{f.descBn}</p>
                              </div>
                              <div className="shrink-0">
                                {st === 'collected' && (
                                  <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] gap-1">
                                    <Check className="w-3 h-3" /> সংগৃহীত
                                  </Badge>
                                )}
                                {st === 'skipped' && (
                                  <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px]">স্কিপ</Badge>
                                )}
                                {st === 'pending' && (
                                  <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-500">বাকি</Badge>
                                )}
                              </div>
                            </div>

                            {/* How-to guide */}
                            <div className="mb-3">
                              <button
                                onClick={() => setGuideOpen(g => ({ ...g, [id]: !isOpenGuide }))}
                                className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                                aria-expanded={isOpenGuide}
                              >
                                <CircleHelp className="w-3.5 h-3.5" />
                                {isOpenGuide ? 'গাইড লুকান' : 'কীভাবে পাবেন?'}
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpenGuide ? 'rotate-180' : ''}`} />
                              </button>
                              {isOpenGuide && (
                                <ol className="mt-2.5 space-y-1.5 border-l-2 border-cyan-500/30 pl-4">
                                  {f.steps.map((step, si) => (
                                    <li key={si} className="text-xs text-slate-400 leading-relaxed">
                                      <span className="inline-flex w-4 h-4 items-center justify-center rounded bg-cyan-500/10 text-cyan-400 text-[10px] font-mono mr-1.5">{si + 1}</span>
                                      {step}
                                    </li>
                                  ))}
                                  {f.helpUrl && (
                                    <li className="pt-1">
                                      <a href={f.helpUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 underline underline-offset-2 hover:text-cyan-300">
                                        অফিসিয়াল লিংক খুলুন ↗
                                      </a>
                                    </li>
                                  )}
                                </ol>
                              )}
                            </div>

                            {/* Input row */}
                            <div className="flex flex-col sm:flex-row gap-2">
                              {f.kind === 'textarea' ? (
                                <Textarea
                                  value={drafts[id] ?? ''}
                                  onChange={e => setDrafts(d => ({ ...d, [id]: e.target.value }))}
                                  placeholder={f.placeholder ?? 'এখানে লিখুন...'}
                                  rows={3}
                                  className="bg-slate-900 border-slate-800 text-sm text-slate-100 flex-1"
                                  aria-label={f.labelBn}
                                />
                              ) : (
                                <div className="relative flex-1">
                                  <Input
                                    type={isSensitive && !revealed ? 'password' : 'text'}
                                    value={drafts[id] ?? ''}
                                    onChange={e => setDrafts(d => ({ ...d, [id]: e.target.value }))}
                                    onBlur={() => {
                                      const cur = (drafts[id] ?? '').trim();
                                      if (cur && cur !== (entry?.value ?? '') && st !== 'skipped') {
                                        saveField(tpl.key, f, 'collected');
                                      }
                                    }}
                                    onKeyDown={e => { if (e.key === 'Enter') saveField(tpl.key, f, 'collected'); }}
                                    placeholder={f.placeholder ?? 'ভ্যালু পেস্ট করুন'}
                                    className="bg-slate-900 border-slate-800 text-sm text-slate-100 pr-10 font-mono"
                                    aria-label={f.labelBn}
                                  />
                                  {isSensitive && (
                                    <button
                                      type="button"
                                      onClick={() => setReveal(r => ({ ...r, [id]: !revealed }))}
                                      aria-label={revealed ? 'লুকান' : 'দেখান'}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                    >
                                      {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                  )}
                                </div>
                              )}
                              <div className="flex gap-2 shrink-0">
                                {saveState[id] === 'saving' ? (
                                  <Button disabled size="sm" className="gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> সেভ...</Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => saveField(tpl.key, f, 'collected')}
                                    className="bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold hover:opacity-90 gap-1.5"
                                  >
                                    <Check className="w-3.5 h-3.5" /> সংরক্ষণ
                                  </Button>
                                )}
                                {st !== 'skipped' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => saveField(tpl.key, f, 'skipped')}
                                    className="text-slate-500 hover:text-amber-300 gap-1"
                                  >
                                    <SkipForward className="w-3.5 h-3.5" /> নেই
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {templates.length === 0 && (
          <Card className="bg-slate-900/60 border-slate-800">
            <CardContent className="p-8 text-center text-slate-400">
              আপনার অ্যাকাউন্টে কোনো প্ল্যাটফর্ম যোগ করা হয়নি। এজেন্সির সাথে যোগাযোগ করুন।
            </CardContent>
          </Card>
        )}
      </main>

      {/* Sticky complete bar */}
      <div className="sticky bottom-0 z-40 bg-slate-950/90 backdrop-blur-xl border-t border-slate-800 px-4 lg:px-8 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="text-sm text-slate-400">
            <span className="text-emerald-400 font-semibold">{progress.collected}</span> সংগৃহীত ·{' '}
            <span className="text-amber-400 font-semibold">{progress.skipped}</span> স্কিপ ·{' '}
            <span className="text-slate-200 font-semibold">{progress.pending}</span> বাকি
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={submitting || progress.total === 0}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-bold hover:opacity-90 gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            সংগ্রহ সম্পন্ন করুন
          </Button>
        </div>
      </div>

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>সবকিছু জমা দেওয়া হয়েছে — শেষ করবেন?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 leading-relaxed">
              {progress.pending > 0 ? (
                <>
                  এখনও <strong className="text-amber-400">{progress.pending}টি ফিল্ড</strong> বাকি আছে।
                  এখনই শেষ করলে বাকিগুলো স্কিপ হিসেবে গণ্য হবে — পরে এজেন্সি চাইলে আবার সুযোগ দেবে।
                </>
              ) : (
                'শেষ করলে এই সেশনটি বন্ধ হয়ে যাবে এবং আপনার সাময়িক পাসওয়ার্ড নিষ্ক্রিয় হবে। আপনার দেওয়া তথ্যগুলো এজেন্সির কাছে নিরাপদে জমা থাকবে।'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700">
              না, আরও দেব
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => doComplete(progress.pending > 0)}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-bold hover:opacity-90"
            >
              হ্যাঁ, সম্পন্ন করুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
