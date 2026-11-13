'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Users, Phone, Plus, Loader2, Search, Trash2, MessageCircle, Clock, TrendingUp, Zap, CalendarClock, AlertTriangle, History } from 'lucide-react';
import { STAGES, stageMeta, LEAD_SOURCES, sourceLabel } from '@/lib/business';

// ─── Types ───────────────────────────────────────────────────
interface DashStats {
  contacts: number; leads: number; openTasks: number; overdue: number; dueToday: number;
  weekInteractions: number; weekRuns: number; pipelineValue: number; conversionRate: number;
}
interface StageCount { count: number; value: number }
interface Dash {
  stats: DashStats;
  byStage: Record<string, StageCount>;
  recentLeads: { id: string; title: string; stage: string; course: string | null; value: number; contactName: string; updatedAt: string }[];
}
interface ContactRow {
  id: string; name: string; phone: string | null; email: string | null; kind: string;
  grade: string | null; source: string; note: string | null; createdAt: string;
  leadCount: number; openLeads: number; openTasks: number;
}
interface LeadRow {
  id: string; title: string; stage: string; course: string | null; value: number;
  contact: { id: string; name: string; phone: string | null };
  openTasks: number; updatedAt: string;
}
interface InteractionRow {
  id: string; channel: string; body: string; origin: string; createdAt: string; leadTitle?: string | null;
}
interface AutoResult { fired: number; details: string[] }

const taka = (n: number) => `৳${n.toLocaleString('en-US')}`;
const CHANNEL_LABEL: Record<string, string> = {
  call: 'ফোন কল', whatsapp: 'WhatsApp', email: 'ইমেইল', meeting: 'মিটিং', note: 'নোট', system: 'সিস্টেম',
};

export default function CrmTab() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; auto?: string[] } | null>(null);
  const [search, setSearch] = useState('');

  // dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [leadFor, setLeadFor] = useState<ContactRow | null>(null);

  const flash = (msg: string, auto?: AutoResult) => {
    setToast({ msg, auto: auto?.details });
    setTimeout(() => setToast(null), 4500);
  };

  const load = useCallback(async () => {
    try {
      const [d, c, l] = await Promise.all([
        fetch('/api/crm/dashboard', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/crm/contacts', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/crm/leads', { cache: 'no-store' }).then(r => r.json()),
      ]);
      setDash(d.stats ? (d as Dash) : null);
      setContacts(c.contacts ?? []);
      setLeads(l.leads ?? []);
    } catch {
      setToast({ msg: 'ডেটা লোড করা যায়নি — আবার চেষ্টা করুন।' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const moveStage = async (lead: LeadRow, stage: string) => {
    const res = await fetch('/api/crm/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lead.id, stage }),
    });
    const data = await res.json();
    if (res.ok) {
      flash(`"${lead.title}" → ${stageMeta(stage).label}`, data.automation);
      load();
    } else flash(data.error ?? 'পরিবর্তন ব্যর্থ হয়েছে।');
  };

  const deleteLead = async (id: string) => {
    if (!confirm('এই লিডটি মুছে ফেলবেন?')) return;
    await fetch('/api/crm/leads', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    flash('লিড মুছে ফেলা হয়েছে।');
    load();
  };

  const deleteContact = async (id: string) => {
    if (!confirm('কন্টাক্ট ও তার সব লিড/টাস্ক/টাইমলাইন মুছে যাবে। নিশ্চিত?')) return;
    await fetch('/api/crm/contacts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setDetailId(null);
    flash('কন্টাক্ট মুছে ফেলা হয়েছে।');
    load();
  };

  const filtered = contacts.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone ?? '').includes(search)
  );
  const detailContact = contacts.find(c => c.id === detailId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-cyan-400" /> CRM ডেটা লোড হচ্ছে...
      </div>
    );
  }

  const s = dash?.stats;
  const statCards: { icon: React.ReactNode; label: string; value: string; tone: string }[] = [
    { icon: <Users className="w-4 h-4" />, label: 'মোট কন্টাক্ট', value: String(s?.contacts ?? 0), tone: 'text-cyan-300' },
    { icon: <TrendingUp className="w-4 h-4" />, label: 'সক্রিয় লিড', value: String(s?.leads ?? 0), tone: 'text-sky-300' },
    { icon: <Zap className="w-4 h-4" />, label: 'পাইপলাইন ভ্যালু', value: taka(s?.pipelineValue ?? 0), tone: 'text-emerald-300' },
    { icon: <TrendingUp className="w-4 h-4" />, label: 'কনভার্সন রেট', value: `${s?.conversionRate ?? 0}%`, tone: 'text-violet-300' },
    { icon: <CalendarClock className="w-4 h-4" />, label: 'আজকের টাস্ক', value: String(s?.dueToday ?? 0), tone: 'text-amber-300' },
    { icon: <AlertTriangle className="w-4 h-4" />, label: 'ওভারডিউ টাস্ক', value: String(s?.overdue ?? 0), tone: 'text-red-300' },
    { icon: <History className="w-4 h-4" />, label: '৭ দিনে ইন্টার‍্যাকশন', value: String(s?.weekInteractions ?? 0), tone: 'text-teal-300' },
    { icon: <Zap className="w-4 h-4" />, label: '৭ দিনে অটোমেশন রান', value: String(s?.weekRuns ?? 0), tone: 'text-fuchsia-300' },
  ];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-cyan-500/40 bg-slate-900/95 backdrop-blur px-4 py-3 shadow-2xl shadow-cyan-950/40 text-sm text-slate-200 space-y-1">
          <div className="font-medium text-cyan-300 flex items-center gap-2"><Zap className="w-4 h-4" />{toast.msg}</div>
          {toast.auto?.map((d, i) => <div key={i} className="text-xs text-slate-400">{d}</div>)}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((c, i) => (
          <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className={`flex items-center gap-2 text-xs ${c.tone}`}>{c.icon}{c.label}</div>
            <div className="text-2xl font-bold text-slate-100 mt-1.5 font-mono">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Pipeline Board */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" /> ভর্তি পাইপলাইন
            <span className="text-[10px] font-normal text-slate-500">(স্টেজ বদলালেই অটোমেশন চলবে)</span>
          </h3>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold gap-1.5 h-8">
            <Plus className="w-3.5 h-3.5" /> নতুন কন্টাক্ট
          </Button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
          {STAGES.map(st => {
            const stageLeads = leads.filter(l => l.stage === st.key);
            const stageValue = stageLeads.reduce((sum, l) => sum + l.value, 0);
            return (
              <div key={st.key} className={`min-w-[220px] w-[220px] shrink-0 rounded-xl border ${st.bg} p-2.5`}>
                <div className={`text-xs font-semibold ${st.color} flex items-center justify-between px-1 pb-2`}>
                  <span>{st.label}</span>
                  <span className="font-mono text-[10px] opacity-80">{stageLeads.length} • {taka(stageValue)}</span>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                  {stageLeads.map(l => (
                    <div key={l.id} className="rounded-lg bg-slate-950/80 border border-slate-800 p-2.5 space-y-1.5">
                      <div className="text-xs font-medium text-slate-200 leading-snug">{l.title}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Users className="w-3 h-3" />{l.contact.name}
                        {l.openTasks > 0 && <span className="ml-auto text-amber-400 font-mono">⚡{l.openTasks}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] text-emerald-300 font-mono">{l.value > 0 ? taka(l.value) : '—'}</span>
                        <div className="flex items-center gap-1">
                          <Select value={l.stage} onValueChange={v => moveStage(l, v)}>
                            <SelectTrigger className="h-6 w-[110px] text-[10px] bg-slate-900 border-slate-700 px-2" aria-label="স্টেজ পরিবর্তন">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700 text-xs">
                              {STAGES.map(x => <SelectItem key={x.key} value={x.key} className="text-xs">{x.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <button onClick={() => deleteLead(l.id)} aria-label="লিড মুছুন" className="text-slate-600 hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="text-[11px] text-slate-600 text-center py-6">খালি</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contacts */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" /> কন্টাক্ট তালিকা
            <span className="text-[10px] font-normal text-slate-500">({contacts.length} জন)</span>
          </h3>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="নাম বা ফোন দিয়ে খুঁজুন..." className="pl-8 h-8 text-xs bg-slate-950 border-slate-800" aria-label="কন্টাক্ট খুঁজুন" />
          </div>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
          {filtered.map(c => (
            <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 hover:border-slate-700 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-200">{c.name}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">{c.kind === 'student' ? 'শিক্ষার্থী' : c.kind === 'guardian' ? 'অভিভাবক' : c.kind === 'business' ? 'ব্যবসা' : 'অন্যান্য'}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">{sourceLabel(c.source)}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                  {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                  {c.grade && <span>শ্রেণি: {c.grade}</span>}
                  <span>লিড: {c.leadCount} (চলমান {c.openLeads})</span>
                  {c.openTasks > 0 && <span className="text-amber-400">টাস্ক: {c.openTasks}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {c.phone && (
                  <a href={`https://wa.me/${c.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" aria-label="WhatsApp করুন" className="p-2 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" />
                  </a>
                )}
                <Button size="sm" variant="outline" onClick={() => setDetailId(c.id)} className="h-7 text-[11px] border-slate-700 bg-slate-900 hover:bg-slate-800">
                  <History className="w-3 h-3 mr-1" /> টাইমলাইন
                </Button>
                <Button size="sm" variant="outline" onClick={() => setLeadFor(c)} className="h-7 text-[11px] border-cyan-500/30 text-cyan-300 bg-cyan-500/5 hover:bg-cyan-500/15">
                  <Plus className="w-3 h-3 mr-1" /> লিড
                </Button>
                <button onClick={() => deleteContact(c.id)} aria-label="কন্টাক্ট মুছুন" className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-slate-500 text-xs py-10">
              কোনো কন্টাক্ট নেই। উপরের <span className="text-cyan-400">নতুন কন্টাক্ট</span> বাটনে ক্লিক করে শুরু করুন।
            </div>
          )}
        </div>
      </div>

      <CreateContactDialog open={createOpen} onOpenChange={setCreateOpen} onDone={(msg, auto) => { flash(msg, auto); load(); }} />
      <AddLeadDialog contact={leadFor} onOpenChange={o => !o && setLeadFor(null)} onDone={(msg, auto) => { flash(msg, auto); load(); }} />
      <ContactDrawer contact={detailContact} onOpenChange={o => !o && setDetailId(null)} onChanged={load} />
    </div>
  );
}

// ─── Create contact (+ optional first lead) ──────────────────
function CreateContactDialog({ open, onOpenChange, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  onDone: (msg: string, auto?: AutoResult) => void;
}) {
  const [form, setForm] = useState({ name: '', phone: '', kind: 'student', grade: '', source: 'manual', leadTitle: '', course: '', leadValue: '' });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    const res = await fetch('/api/crm/contacts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      onOpenChange(false);
      setForm({ name: '', phone: '', kind: 'student', grade: '', source: 'manual', leadTitle: '', course: '', leadValue: '' });
      onDone(`${form.name} যোগ হয়েছে${form.leadTitle ? ' — স্বাগতম-অটোমেশন চালু হয়েছে!' : ''}`, data.automation);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle>নতুন কন্টাক্ট</DialogTitle>
          <DialogDescription className="text-slate-400">শিক্ষার্থী/অভিভাবকের তথ্য দিন। চাইলে সাথে প্রথম লিডও খুলতে পারেন — সাথে সাথেই স্বাগতম ও ফলো-আপ অটোমেশন চলবে।</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-slate-300">নাম *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="যেমন: তানভীর আহমেদ" className="bg-slate-950 border-slate-800" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">ফোন / WhatsApp</Label>
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+8801XXXXXXXXX" className="bg-slate-950 border-slate-800" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">ধরন</Label>
            <Select value={form.kind} onValueChange={v => setForm(f => ({ ...f, kind: v }))}>
              <SelectTrigger className="bg-slate-950 border-slate-800"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="student">শিক্ষার্থী</SelectItem>
                <SelectItem value="guardian">অভিভাবক</SelectItem>
                <SelectItem value="business">ব্যবসা</SelectItem>
                <SelectItem value="other">অন্যান্য</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">উৎস</Label>
            <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
              <SelectTrigger className="bg-slate-950 border-slate-800"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {LEAD_SOURCES.map(x => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-slate-300">আগ্রহের শ্রেণি/কোর্স লেভেল</Label>
            <Input value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} placeholder="যেমন: HSC, ভর্তি প্রস্তুতি, IELTS" className="bg-slate-950 border-slate-800" />
          </div>
          <div className="sm:col-span-2 rounded-lg border border-dashed border-cyan-500/30 bg-cyan-500/5 p-3 space-y-3">
            <div className="text-[11px] text-cyan-300 font-medium flex items-center gap-1.5"><Zap className="w-3 h-3" /> প্রথম লিড (ঐচ্ছিক — দিলে অটোমেশন সাথে সাথে চলবে)</div>
            <Input value={form.leadTitle} onChange={e => setForm(f => ({ ...f, leadTitle: e.target.value }))} placeholder="লিডের শিরোনাম, যেমন: IELTS ব্যাচে ভর্তি চাই" className="bg-slate-950 border-slate-800 text-xs" />
            <div className="grid grid-cols-2 gap-2">
              <Input value={form.course} onChange={e => setForm(f => ({ ...f, course: e.target.value }))} placeholder="কোর্স" className="bg-slate-950 border-slate-800 text-xs" />
              <Input value={form.leadValue} onChange={e => setForm(f => ({ ...f, leadValue: e.target.value }))} placeholder="সম্ভাব্য ফি (৳)" type="number" className="bg-slate-950 border-slate-800 text-xs" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400">বাতিল</Button>
          <Button onClick={submit} disabled={busy || !form.name.trim()} className="bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} সংরক্ষণ করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add lead for existing contact ───────────────────────────
function AddLeadDialog({ contact, onOpenChange, onDone }: {
  contact: ContactRow | null; onOpenChange: (o: boolean) => void;
  onDone: (msg: string, auto?: AutoResult) => void;
}) {
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!contact || !title.trim()) return;
    setBusy(true);
    const res = await fetch('/api/crm/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId: contact.id, title, course, value: Number(value) || 0 }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setTitle(''); setCourse(''); setValue('');
      onOpenChange(false);
      onDone(`নতুন লিড তৈরি হয়েছে — অটোমেশন ${data.automation?.fired ?? 0}টি নিয়ম চালু হয়েছে`, data.automation);
    }
  };

  return (
    <Dialog open={!!contact} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
        <DialogHeader>
          <DialogTitle>নতুন লিড — {contact?.name}</DialogTitle>
          <DialogDescription className="text-slate-400">লিড তৈরি হলেই স্বাগতম মেসেজ ও ২৪ ঘণ্টার ফলো-আপ টাস্ক অটোমেটিক তৈরি হবে।</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-slate-300">শিরোনাম *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="যেমন: HSC ব্যাচ-২৭ এ ভর্তি চাই" className="bg-slate-950 border-slate-800" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-slate-300">কোর্স</Label>
              <Input value={course} onChange={e => setCourse(e.target.value)} placeholder="যেমন: IELTS" className="bg-slate-950 border-slate-800" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">সম্ভাব্য ফি (৳)</Label>
              <Input value={value} onChange={e => setValue(e.target.value)} type="number" placeholder="8000" className="bg-slate-950 border-slate-800" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400">বাতিল</Button>
          <Button onClick={submit} disabled={busy || !title.trim()} className="bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} লিড খুলুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Contact drawer: timeline + log interaction ──────────────
function ContactDrawer({ contact, onOpenChange, onChanged }: {
  contact: ContactRow | null; onOpenChange: (o: boolean) => void; onChanged: () => void;
}) {
  const [items, setItems] = useState<InteractionRow[]>([]);
  const [channel, setChannel] = useState('call');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const loadTimeline = useCallback(async (cid: string) => {
    const res = await fetch(`/api/crm/interactions?contactId=${cid}`, { cache: 'no-store' });
    const data = await res.json();
    setItems(data.interactions ?? []);
  }, []);

  useEffect(() => {
    if (contact) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on selection change
      loadTimeline(contact.id);
    }
  }, [contact, loadTimeline]);

  const logIt = async () => {
    if (!contact || !text.trim()) return;
    setBusy(true);
    await fetch('/api/crm/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId: contact.id, channel, body: text }),
    });
    setBusy(false);
    setText('');
    loadTimeline(contact.id);
    onChanged();
  };

  return (
    <Dialog open={!!contact} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-lg max-h-[85vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle>{contact?.name} — যোগাযোগ টাইমলাইন</DialogTitle>
          <DialogDescription className="text-slate-400">
            {contact?.phone && <span className="block">{contact.phone}</span>}
            প্রতিটি কল/মেসেজের রেকর্ড — যেকোনো সময় দেখুন।
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2">
          <div className="flex gap-2">
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-32 bg-slate-950 border-slate-800 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {Object.entries(CHANNEL_LABEL).filter(([k]) => k !== 'system').map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={text} onChange={e => setText(e.target.value)} placeholder="কী আলোচনা হলো? সংক্ষেপে লিখুন..." className="bg-slate-950 border-slate-800 text-xs" onKeyDown={e => e.key === 'Enter' && logIt()} aria-label="ইন্টার‍্যাকশন বিবরণ" />
            <Button size="sm" onClick={logIt} disabled={busy || !text.trim()} className="bg-cyan-500 text-slate-950 font-semibold h-8 shrink-0">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
          {items.map(i => (
            <div key={i.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{CHANNEL_LABEL[i.channel] ?? i.channel}</span>
                {i.origin !== 'manual' && <span className="text-fuchsia-400 flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />অটোমেশন</span>}
                <span className="ml-auto flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{new Date(i.createdAt).toLocaleString('bn-BD', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{i.body}</p>
            </div>
          ))}
          {items.length === 0 && <div className="text-center text-[11px] text-slate-600 py-6">এখনো কোনো রেকর্ড নেই।</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
