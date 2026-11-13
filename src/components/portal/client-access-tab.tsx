'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Copy, Download, Eye, EyeOff, Lock, Unlock, KeyRound, Trash2, RefreshCcw,
  Users, UserCheck, CheckCircle2, ListChecks, Loader2, MessageCircle, FileJson,
  History, Search,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { PlatformIcon } from '@/components/portal/platform-icons';
import { PLATFORM_TEMPLATES, buildEnvText, buildReportText, getTemplate } from '@/lib/platforms';

interface ClientRow {
  id: string;
  name: string;
  business: string;
  phone: string | null;
  username: string;
  status: string;
  platforms: string[];
  createdAt: string;
  completedAt: string | null;
  stats: { collected: number; skipped: number; done: number };
}

interface EntryItem { platform: string; fieldKey: string; value: string; status: string; updatedAt: string }
interface LogItem { actor: string; action: string; detail: string | null; ip: string | null; createdAt: string }
interface ClientDetail extends ClientRow { entries: EntryItem[]; logs: LogItem[] }

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: 'সক্রিয়', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  completed: { label: 'সম্পন্ন', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  locked: { label: 'লক', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

export default function ClientAccessTab() {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', business: '', phone: '' });
  const [pickedPlatforms, setPickedPlatforms] = useState<string[]>([]);
  const [created, setCreated] = useState<{ name: string; business: string; username: string; tempPassword: string } | null>(null);

  // Password reset result
  const [pwReset, setPwReset] = useState<{ name: string; username: string; tempPassword: string } | null>(null);

  // Detail
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/clients');
      if (res.status === 401) { window.location.reload(); return; }
      const data = await res.json();
      if (res.ok) setClients(data.clients);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => ({
    total: clients.length,
    active: clients.filter(c => c.status === 'active').length,
    completed: clients.filter(c => c.status === 'completed').length,
    collected: clients.reduce((s, c) => s + c.stats.collected, 0),
  }), [clients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) || c.business.toLowerCase().includes(q) || c.username.includes(q)
    );
  }, [clients, query]);

  // ── Create client ──
  const doCreate = async () => {
    if (!form.name.trim() || !form.business.trim()) {
      toast({ title: 'নাম ও ব্যবসার নাম দিন', variant: 'destructive' });
      return;
    }
    if (pickedPlatforms.length === 0) {
      toast({ title: 'অন্তত একটি প্ল্যাটফর্ম সিলেক্ট করুন', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form.phone.trim() ? { ...form, platforms: pickedPlatforms } : { ...form, phone: undefined, platforms: pickedPlatforms }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? 'তৈরি করা যায়নি', variant: 'destructive' });
        return;
      }
      setCreated({
        name: data.client.name,
        business: data.client.business,
        username: data.client.username,
        tempPassword: data.tempPassword,
      });
      load();
    } finally {
      setCreating(false);
    }
  };

  const whatsappInvite = (c: { name: string; business: string; username: string; tempPassword: string }) =>
    `স্বাগতম ${c.name} ভাই/আপু! 👋\n\nআপনার মার্কেটিং অটোমেশন সেটআপ শুরু করতে নিচের লিংকে লগইন করুন:\n\n🔗 লিংক: [আপনার পোর্টাল লিংক]\n👤 ইউজারনেম: ${c.username}\n🔑 সাময়িক পাসওয়ার্ড: ${c.tempPassword}\n\n📌 করণীয়:\n১. লগইন করে প্রতিটি ফিল্ডের "কীভাবে পাবেন?" গাইড দেখুন (বাংলায়)\n২. আইডি/টোকেনগুলো কপি করে জমা দিন — পাসওয়ার্ড দেওয়ার দরকার নেই\n৩. শেষ হলে "সংগ্রহ সম্পন্ন করুন" চাপুন — সেশন অটো-লগআউট হবে\n\n🔒 নিরাপত্তা: কালেকশন শেষ হলে এই সাময়িক পাসওয়ার্ড নিষ্ক্রিয় হয়ে যাবে। এরপর আপনি আপনার অ্যাকাউন্টের পাসওয়ার্ড নিরাপদে বদলে নিতে পারবেন — আমাদের কাজে কোনো সমস্যা হবে না।`;

  // ── Detail ──
  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setReveal({});
    try {
      const res = await fetch(`/api/admin/clients/${id}`);
      const data = await res.json();
      if (res.ok) setDetail(data.client);
    } finally {
      setDetailLoading(false);
    }
  };

  const patch = async (id: string, action: 'lock' | 'unlock' | 'reset_password') => {
    const res = await fetch(`/api/admin/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast({ title: data.error ?? 'ব্যর্থ', variant: 'destructive' });
      return;
    }
    if (action === 'reset_password') {
      const c = clients.find(x => x.id === id);
      setPwReset({ name: c?.name ?? '', username: c?.username ?? '', tempPassword: data.tempPassword });
    } else {
      toast({ title: action === 'lock' ? 'অ্যাকাউন্ট লক করা হয়েছে' : 'অ্যাকাউন্ট আনলক হয়েছে' });
    }
    load();
    if (detail?.id === id) openDetail(id);
  };

  const doDelete = async (id: string) => {
    const res = await fetch(`/api/admin/clients/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ title: 'ক্লায়েন্ট মুছে ফেলা হয়েছে' });
      setDeleteTarget(null);
      setDetail(null);
      load();
    }
  };

  const download = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyOr = async (text: string, label: string) => {
    const ok = await copyText(text);
    toast({ title: ok ? `${label} কপি হয়েছে ✔` : 'কপি ব্যর্থ — ম্যানুয়ালি কপি করুন', variant: ok ? 'default' : 'destructive' });
  };

  const detailEntry = (platform: string, fieldKey: string) =>
    detail?.entries.find(e => e.platform === platform && e.fieldKey === fieldKey);

  // ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { icon: Users, label: 'মোট ক্লায়েন্ট', value: totals.total, color: 'text-cyan-400' },
          { icon: UserCheck, label: 'সক্রিয় (কালেকশন চলছে)', value: totals.active, color: 'text-emerald-400' },
          { icon: CheckCircle2, label: 'সম্পন্ন ও লক', value: totals.completed, color: 'text-blue-400' },
          { icon: ListChecks, label: 'সংগৃহীত ফিল্ড', value: totals.collected, color: 'text-amber-400' },
        ].map((s, i) => (
          <div key={i} className="rounded-xl bg-slate-900/70 border border-slate-800 p-4">
            <div className="flex items-center justify-between">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-2xl font-bold text-white font-mono">{s.value}</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="নাম, ব্যবসা বা ইউজারনেম খুঁজুন..."
            className="pl-9 bg-slate-900 border-slate-800 text-slate-100"
            aria-label="ক্লায়েন্ট খুঁজুন"
          />
        </div>
        <Button
          onClick={() => { setForm({ name: '', business: '', phone: '' }); setPickedPlatforms([]); setCreated(null); setCreateOpen(true); }}
          className="bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold hover:opacity-90 gap-2"
        >
          <Plus className="w-4 h-4" /> নতুন ক্লায়েন্ট অ্যাকাউন্ট
        </Button>
        <Button variant="ghost" onClick={load} className="text-slate-400 gap-2">
          <RefreshCcw className="w-4 h-4" /> রিফ্রেশ
        </Button>
      </div>

      {/* Client list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mr-3 text-cyan-400" /> লোড হচ্ছে...
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-10 text-center text-slate-400">
            <Users className="w-10 h-10 mx-auto text-slate-700 mb-3" />
            এখনও কোনো ক্লায়েন্ট অ্যাকাউন্ট নেই। <span className="text-cyan-400">&quot;নতুন ক্লায়েন্ট অ্যাকাউন্ট&quot;</span> চেপে শুরু করুন।
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => {
            const totalFields = c.platforms.reduce((s, p) => s + (getTemplate(p)?.fields.length ?? 0), 0);
            const pct = totalFields === 0 ? 0 : Math.round((c.stats.done / totalFields) * 100);
            const meta = STATUS_META[c.status] ?? STATUS_META.active;
            return (
              <Card key={c.id} className="bg-slate-900/60 border-slate-800 hover:border-slate-700 transition-colors">
                <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-white">{c.name}</h3>
                      <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {c.business} · <span className="font-mono">@{c.username}</span>
                      {c.phone ? ` · ${c.phone}` : ''}
                    </p>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {c.platforms.map(p => {
                        const t = getTemplate(p);
                        if (!t) return null;
                        return (
                          <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[10px] text-slate-400">
                            <PlatformIcon name={t.icon} className="w-3 h-3" /> {t.nameBn}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="w-full lg:w-44 shrink-0">
                    <Progress value={pct} className="h-2 bg-slate-950 [&>div]:bg-gradient-to-r [&>div]:from-cyan-500 [&>div]:to-blue-600" />
                    <p className="text-[10px] text-slate-500 mt-1 font-mono">
                      {c.stats.collected} সংগৃহীত / {totalFields} ফিল্ড · {pct}%
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => openDetail(c.id)} className="border-slate-700 text-slate-200 hover:bg-slate-800 gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> বিস্তারিত
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => patch(c.id, 'reset_password')} className="text-amber-400 hover:text-amber-300 gap-1.5" title="নতুন সাময়িক পাসওয়ার্ড">
                      <KeyRound className="w-3.5 h-3.5" /> রিসেট
                    </Button>
                    {c.status === 'active' ? (
                      <Button size="sm" variant="ghost" onClick={() => patch(c.id, 'lock')} className="text-red-400 hover:text-red-300 gap-1.5" title="লক">
                        <Lock className="w-3.5 h-3.5" /> লক
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => patch(c.id, 'unlock')} className="text-emerald-400 hover:text-emerald-300 gap-1.5" title="আনলক">
                        <Unlock className="w-3.5 h-3.5" /> আনলক
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(c)} className="text-slate-500 hover:text-red-300" title="মুছুন">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create modal ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar">
          {!created ? (
            <>
              <DialogHeader>
                <DialogTitle>নতুন ক্লায়েন্ট অ্যাকাউন্ট</DialogTitle>
                <DialogDescription className="text-slate-400">
                  সাময়িক ইউজারনেম ও পাসওয়ার্ড অটো-জেনারেট হবে। কালেকশন শেষ হলে অ্যাকাউন্ট অটো-লক হবে।
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="c-name" className="text-slate-300">ক্লায়েন্টের নাম *</Label>
                  <Input id="c-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="যেমন: রহিম উদ্দিন" className="bg-slate-950 border-slate-800" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-biz" className="text-slate-300">ব্যবসার নাম *</Label>
                  <Input id="c-biz" value={form.business} onChange={e => setForm(f => ({ ...f, business: e.target.value }))} placeholder="যেমন: Rahim Fashion" className="bg-slate-950 border-slate-800" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-phone" className="text-slate-300">ফোন / WhatsApp (ঐচ্ছিক)</Label>
                  <Input id="c-phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+8801XXXXXXXXX" className="bg-slate-950 border-slate-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">যেসব প্ল্যাটফর্মের তথ্য লাগবে *</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setPickedPlatforms(PLATFORM_TEMPLATES.map(t => t.key))}
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-cyan-500/30 text-cyan-300 bg-cyan-500/5 hover:bg-cyan-500/15 transition-colors font-medium"
                    >
                      সবগুলো নির্বাচন করুন ({PLATFORM_TEMPLATES.length} প্ল্যাটফর্ম)
                    </button>
                    {pickedPlatforms.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPickedPlatforms([])}
                        className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        নির্বাচন মুছুন
                      </button>
                    )}
                    <span className="text-[11px] text-slate-500">{pickedPlatforms.length}টি নির্বাচিত</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto custom-scrollbar p-1">
                    {PLATFORM_TEMPLATES.map(t => (
                      <label
                        key={t.key}
                        className={`flex items-center gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${pickedPlatforms.includes(t.key) ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}
                      >
                        <Checkbox
                          checked={pickedPlatforms.includes(t.key)}
                          onCheckedChange={(v) =>
                            setPickedPlatforms(p => (v ? [...p, t.key] : p.filter(x => x !== t.key)))
                          }
                          aria-label={t.nameBn}
                        />
                        <PlatformIcon name={t.icon} className="w-4 h-4 text-slate-300 shrink-0" />
                        <span className="text-xs text-slate-300 leading-tight">{t.nameBn}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCreateOpen(false)} className="text-slate-400">বাতিল</Button>
                <Button onClick={doCreate} disabled={creating} className="bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold gap-2">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  অ্যাকাউন্ট তৈরি করুন
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" /> অ্যাকাউন্ট তৈরি হয়েছে!
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  এই পাসওয়ার্ডটি <strong className="text-amber-400">একবারই</strong> দেখানো হবে — এখনই কপি করে ক্লায়েন্টকে পাঠিয়ে দিন।
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">ক্লায়েন্ট</span>
                    <span className="text-sm text-slate-200">{created.name} · {created.business}</span>
                  </div>
                  <Separator className="bg-slate-800" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">ইউজারনেম</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-cyan-300">{created.username}</code>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400" onClick={() => copyOr(created.username, 'ইউজারনেম')} aria-label="ইউজারনেম কপি">
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">সাময়িক পাসওয়ার্ড</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-amber-300">{created.tempPassword}</code>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400" onClick={() => copyOr(created.tempPassword, 'পাসওয়ার্ড')} aria-label="পাসওয়ার্ড কপি">
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => copyOr(whatsappInvite(created), 'WhatsApp মেসেজ')}
                  className="w-full border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 gap-2"
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp ইনভাইট মেসেজ কপি করুন
                </Button>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => { setCreated(null); setCreateOpen(false); }}
                  className="bg-slate-800 text-slate-200 hover:bg-slate-700"
                >
                  সম্পন্ন
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Password reset result ── */}
      <Dialog open={pwReset !== null} onOpenChange={(v) => !v && setPwReset(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          {pwReset && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-amber-400" /> নতুন সাময়িক পাসওয়ার্ড
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  পুরনো পাসওয়ার্ড বাতিল হয়ে গেছে। {pwReset.name}-কে নতুনটি পাঠিয়ে দিন।
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">ইউজারনেম</span>
                  <code className="text-sm font-mono text-cyan-300">{pwReset.username}</code>
                </div>
                <Separator className="bg-slate-800" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">নতুন পাসওয়ার্ড</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-amber-300">{pwReset.tempPassword}</code>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400" onClick={() => copyOr(pwReset.tempPassword, 'পাসওয়ার্ড')} aria-label="পাসওয়ার্ড কপি">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => copyOr(whatsappInvite({ name: pwReset.name, business: '', username: pwReset.username, tempPassword: pwReset.tempPassword }), 'WhatsApp মেসেজ')}
                className="w-full border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 gap-2"
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp মেসেজ কপি করুন
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Detail modal ── */}
      <Dialog open={detail !== null || detailLoading} onOpenChange={(v) => { if (!v) setDetail(null); }}>
        <DialogContent aria-describedby={undefined} className="bg-slate-900 border-slate-800 text-slate-100 max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar">
          {detailLoading || !detail ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <DialogTitle className="sr-only">ডেটা লোড হচ্ছে</DialogTitle>
              <Loader2 className="w-6 h-6 animate-spin mr-3 text-cyan-400" /> লোড হচ্ছে...
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {detail.name}
                  <Badge variant="outline" className={`text-[10px] ${(STATUS_META[detail.status] ?? STATUS_META.active).cls}`}>
                    {(STATUS_META[detail.status] ?? STATUS_META.active).label}
                  </Badge>
                  <span className="text-xs font-mono text-slate-500">@{detail.username}</span>
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  {detail.business}
                  {detail.completedAt ? ` · সম্পন্ন: ${new Date(detail.completedAt).toLocaleDateString('bn-BD')}` : ''}
                </DialogDescription>
              </DialogHeader>

              {/* Export buttons */}
              <div className="flex flex-wrap gap-2 py-1">
                <Button size="sm" variant="outline" className="border-slate-700 text-slate-200 gap-1.5"
                  onClick={() => copyOr(buildEnvText(detail.platforms, detail.entries, detail.business), '.env')}
                >
                  <Copy className="w-3.5 h-3.5" /> .env কপি
                </Button>
                <Button size="sm" variant="outline" className="border-slate-700 text-slate-200 gap-1.5"
                  onClick={() => download(`${detail.username}-credentials.env`, buildEnvText(detail.platforms, detail.entries, detail.business))}
                >
                  <Download className="w-3.5 h-3.5" /> .env ডাউনলোড
                </Button>
                <Button size="sm" variant="outline" className="border-slate-700 text-slate-200 gap-1.5"
                  onClick={() => copyOr(buildReportText(detail.platforms, detail.entries, detail.business), 'রিপোর্ট')}
                >
                  <MessageCircle className="w-3.5 h-3.5" /> রিপোর্ট কপি
                </Button>
                <Button size="sm" variant="outline" className="border-slate-700 text-slate-200 gap-1.5"
                  onClick={() => download(`${detail.username}-data.json`, JSON.stringify(detail.entries, null, 2))}
                >
                  <FileJson className="w-3.5 h-3.5" /> JSON
                </Button>
              </div>

              {/* Entries by platform */}
              <div className="space-y-4 py-1">
                {detail.platforms.map(pKey => {
                  const tpl = getTemplate(pKey);
                  if (!tpl) return null;
                  const entriesForPlatform = detail.entries.filter(e => e.platform === pKey);
                  const collectedCount = entriesForPlatform.filter(e => e.status === 'collected').length;
                  return (
                    <div key={pKey} className="rounded-xl border border-slate-800 bg-slate-950/50 overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/60 border-b border-slate-800">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${tpl.gradient} p-0.5`}>
                          <div className="w-full h-full bg-slate-950 rounded-[6px] flex items-center justify-center">
                            <PlatformIcon name={tpl.icon} className="w-4 h-4 text-white" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-white">{tpl.nameBn}</h4>
                          <p className="text-[10px] text-slate-500">{collectedCount}/{tpl.fields.length} সংগৃহীত</p>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-800/60">
                        {tpl.fields.map(f => {
                          const e = detailEntry(pKey, f.key);
                          const id = `${pKey}:${f.key}`;
                          const shown = reveal[id] ?? false;
                          return (
                            <div key={f.key} className="px-4 py-2.5 flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-300">
                                  {f.labelBn} <span className="text-slate-600 font-mono">{f.label}</span>
                                </p>
                                {(!e || e.status === 'pending') ? (
                                  <p className="text-xs text-slate-600 mt-0.5">— এখনো দেওয়া হয়নি —</p>
                                ) : e.status === 'skipped' ? (
                                  <p className="text-xs text-amber-500/80 mt-0.5">স্কিপ করা হয়েছে</p>
                                ) : (
                                  <p className="text-xs font-mono text-emerald-300/90 mt-0.5 truncate">
                                    {shown || f.sensitive === false ? e.value : `${e.value.slice(0, 4)}••••••••${e.value.slice(-4)}`}
                                  </p>
                                )}
                              </div>
                              {e?.status === 'collected' && e.value && (
                                <div className="flex gap-1 shrink-0">
                                  {f.sensitive !== false && (
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500" onClick={() => setReveal(r => ({ ...r, [id]: !shown }))} aria-label="দেখান/লুকান">
                                      {shown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </Button>
                                  )}
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500" onClick={() => copyOr(e.value, f.labelBn)} aria-label="কপি">
                                    <Copy className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Activity log */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/60 border-b border-slate-800">
                  <History className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-sm font-semibold text-white">অ্যাক্টিভিটি লগ</h4>
                </div>
                <div className="divide-y divide-slate-800/60 max-h-56 overflow-y-auto custom-scrollbar">
                  {detail.logs.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-slate-600">কোনো অ্যাক্টিভিটি নেই</p>
                  ) : (
                    detail.logs.map((l, i) => (
                      <div key={i} className="px-4 py-2 flex items-start gap-3 text-xs">
                        <Badge variant="outline" className={`text-[9px] shrink-0 ${l.actor === 'client' ? 'border-cyan-500/40 text-cyan-400' : 'border-slate-700 text-slate-400'}`}>
                          {l.actor}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-300">{l.detail ?? l.action}</p>
                          <p className="text-slate-600 mt-0.5 font-mono text-[10px]">
                            {new Date(l.createdAt).toLocaleString('bn-BD')}{l.ip ? ` · IP: ${l.ip}` : ''}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>ক্লায়েন্ট মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              <strong>{deleteTarget?.name}</strong> ({deleteTarget?.business}) এর সব সংগৃহীত ডেটা স্থায়ীভাবে মুছে যাবে।
              প্রয়োজন হলে আগে .env এক্সপোর্ট করে রাখুন।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-200">বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && doDelete(deleteTarget.id)} className="bg-red-600 text-white hover:bg-red-500">
              হ্যাঁ, মুছুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
