'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2, Zap, BookOpen, Activity, Ban, CheckCircle2 } from 'lucide-react';

interface Rule {
  id: string; name: string; trigger: string; condition: string | null;
  action: string; payload: { title?: string; channel?: string; body?: string; dueInHours?: number; priority?: string };
  enabled: boolean; builtIn: boolean;
}
interface Run { id: string; ruleName: string; status: string; detail: string | null; createdAt: string }
interface KbEntry { id: string; title: string; category: string; body: string; updatedAt: string }

const TRIGGER_LABEL: Record<string, string> = {
  lead_created: 'নতুন লিড তৈরি হলে',
  stage_changed: 'লিডের স্টেজ বদলালে',
  task_completed: 'টাস্ক সম্পন্ন হলে',
  contact_created: 'নতুন কন্টাক্ট যোগ হলে',
};
const STAGE_CONDITIONS = [
  { key: 'contacted', label: 'যোগাযোগ হয়েছে' }, { key: 'demo', label: 'ডেমো ক্লাস' },
  { key: 'negotiated', label: 'ফি আলোচনা' }, { key: 'enrolled', label: 'ভর্তি সম্পন্ন' }, { key: 'lost', label: 'হারিয়ে গেছে' },
];
const KB_CATEGORIES: Record<string, string> = {
  course: 'কোর্স', fee: 'ফি', schedule: 'শিডিউল', policy: 'পলিসি', faq: 'প্রশ্নোত্তর', general: 'সাধারণ',
};

export default function AutomationsTab() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [kb, setKb] = useState<KbEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    try {
      const [a, k] = await Promise.all([
        fetch('/api/crm/automations', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/crm/kb', { cache: 'no-store' }).then(r => r.json()),
      ]);
      setRules(a.rules ?? []);
      setRuns(a.runs ?? []);
      setKb(k.entries ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRule = async (r: Rule) => {
    await fetch('/api/crm/automations', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, enabled: !r.enabled }),
    });
    flash(!r.enabled ? `চালু হয়েছে: ${r.name}` : `বন্ধ হয়েছে: ${r.name}`);
    load();
  };

  const deleteRule = async (r: Rule) => {
    if (!confirm(`"${r.name}" মুছে ফেলবেন?`)) return;
    const res = await fetch('/api/crm/automations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id }) });
    const data = await res.json();
    flash(res.ok ? 'নিয়ম মুছে ফেলা হয়েছে।' : (data.error ?? 'মোছা যায়নি।'));
    load();
  };

  const deleteKb = async (id: string) => {
    if (!confirm('এন্ট্রিটি মুছে ফেলবেন?')) return;
    await fetch('/api/crm/kb', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    flash('নলেজ এন্ট্রি মুছে ফেলা হয়েছে।');
    load();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-slate-400 text-sm gap-3"><Loader2 className="w-5 h-5 animate-spin text-cyan-400" /> অটোমেশন লোড হচ্ছে...</div>;
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-cyan-500/40 bg-slate-900/95 backdrop-blur px-4 py-3 shadow-2xl text-sm text-slate-200 flex items-center gap-2">
          <Zap className="w-4 h-4 text-cyan-300" />{toast}
        </div>
      )}

      {/* Rules */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Zap className="w-4 h-4 text-fuchsia-400" /> অটোমেশন নিয়মাবলি
            <span className="text-[10px] font-normal text-slate-500">({rules.filter(r => r.enabled).length}/{rules.length} চালু)</span>
          </h3>
          <Button size="sm" onClick={() => setNewOpen(true)} className="bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-semibold gap-1.5 h-8">
            <Plus className="w-3.5 h-3.5" /> কাস্টম নিয়ম
          </Button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {rules.map(r => (
            <div key={r.id} className={`rounded-xl border p-3 space-y-2 transition-colors ${r.enabled ? 'border-slate-700 bg-slate-950/60' : 'border-slate-800/50 bg-slate-950/30 opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-200 leading-snug flex items-center gap-1.5 flex-wrap">
                    {r.name}
                    {r.builtIn && <Badge variant="outline" className="text-[9px] px-1 py-0 border-fuchsia-500/30 text-fuchsia-300">বিল্ট-ইন</Badge>}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {TRIGGER_LABEL[r.trigger]}{r.condition ? ` → স্টেজ "${STAGE_CONDITIONS.find(s => s.key === r.condition)?.label ?? r.condition}"` : ''}
                    {' → '}
                    {r.action === 'create_task' ? 'টাস্ক তৈরি' : 'টাইমলাইনে লগ'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch checked={r.enabled} onCheckedChange={() => toggleRule(r)} aria-label={`${r.name} ${r.enabled ? 'বন্ধ করুন' : 'চালু করুন'}`} />
                  {!r.builtIn && (
                    <button onClick={() => deleteRule(r)} aria-label="মুছুন" className="text-slate-600 hover:text-red-400 transition-colors p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {r.action === 'create_task' && r.payload.title && (
                <div className="text-[10px] text-slate-500 bg-slate-900/60 rounded-lg px-2 py-1.5 border border-slate-800">
                  টাস্ক: {r.payload.title}{r.payload.dueInHours ? ` • ডেডলাইন +${r.payload.dueInHours}ঘ • ${r.payload.priority === 'high' ? 'উচ্চ' : r.payload.priority === 'low' ? 'কম' : 'মাঝারি'} প্রায়োরিটি` : ''}
                </div>
              )}
              {r.action === 'log_interaction' && r.payload.body && (
                <div className="text-[10px] text-slate-500 bg-slate-900/60 rounded-lg px-2 py-1.5 border border-slate-800 leading-relaxed">
                  {r.payload.channel === 'whatsapp' ? 'WhatsApp' : 'সিস্টেম'} লগ: {r.payload.body.slice(0, 100)}{r.payload.body.length > 100 ? '…' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Run log */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-cyan-400" /> সাম্প্রতিক অটোমেশন রান
          <span className="text-[10px] font-normal text-slate-500">(সর্বশেষ {runs.length}টি)</span>
        </h3>
        <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
          {runs.map(r => (
            <div key={r.id} className="flex items-start gap-2 text-[11px] rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2">
              {r.status === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" /> : <Ban className="w-3.5 h-3.5 text-slate-600 mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <span className="text-slate-300 font-medium">{r.ruleName}</span>
                {r.detail && <span className="text-slate-500"> — {r.detail}</span>}
              </div>
              <span className="text-slate-600 shrink-0">{new Date(r.createdAt).toLocaleString('bn-BD', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          ))}
          {runs.length === 0 && <div className="text-center text-[11px] text-slate-600 py-6">এখনো কোনো রান হয়নি — লিড যোগ করলেই শুরু হবে।</div>}
        </div>
      </div>

      {/* Knowledge base */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-400" /> নলেজ বেস
            <span className="text-[10px] font-normal text-slate-500">(কোর্স, ফি, শিডিউল, পলিসি — টিমের সবার জন্য)</span>
          </h3>
          <Button size="sm" onClick={() => setKbOpen(true)} className="bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-semibold gap-1.5 h-8">
            <Plus className="w-3.5 h-3.5" /> এন্ট্রি যোগ করুন
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto custom-scrollbar">
          {kb.map(e => (
            <div key={e.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 shrink-0">{KB_CATEGORIES[e.category] ?? e.category}</span>
                  <span className="text-xs font-medium text-slate-200 truncate">{e.title}</span>
                </div>
                <button onClick={() => deleteKb(e.id)} aria-label="মুছুন" className="text-slate-600 hover:text-red-400 transition-colors p-1 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed whitespace-pre-line line-clamp-4">{e.body}</p>
            </div>
          ))}
          {kb.length === 0 && <div className="text-center text-[11px] text-slate-600 py-6 md:col-span-2">নলেজ বেস খালি — কোর্সের ফি/শিডিউল যোগ করুন।</div>}
        </div>
      </div>

      <NewRuleDialog open={newOpen} onOpenChange={setNewOpen} onDone={msg => { flash(msg); load(); }} />
      <NewKbDialog open={kbOpen} onOpenChange={setKbOpen} onDone={msg => { flash(msg); load(); }} />
    </div>
  );
}

// ─── Custom rule dialog ──────────────────────────────────────
function NewRuleDialog({ open, onOpenChange, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; onDone: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('stage_changed');
  const [condition, setCondition] = useState('enrolled');
  const [ruleAction, setRuleAction] = useState('create_task');
  const [title, setTitle] = useState('');
  const [dueIn, setDueIn] = useState('24');
  const [priority, setPriority] = useState('medium');
  const [channel, setChannel] = useState('system');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const payload = ruleAction === 'create_task'
      ? { title: title || 'ফলো-আপ: {name}', dueInHours: Number(dueIn) || 0, priority }
      : { channel, body: body || 'অটোমেশন ইভেন্ট রেকর্ড হয়েছে।' };
    const res = await fetch('/api/crm/automations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, trigger, condition: trigger === 'stage_changed' ? condition : undefined, ruleAction, payload }),
    });
    setBusy(false);
    if (res.ok) {
      onOpenChange(false);
      setName(''); setTitle(''); setBody('');
      onDone(`কাস্টম নিয়ম "${name}" তৈরি হয়েছে — এখন থেকে স্বয়ংক্রিয়ভাবে চলবে।`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle>কাস্টম অটোমেশন নিয়ম</DialogTitle>
          <DialogDescription className="text-slate-400">যখন ট্রিগার ঘটবে, তখন অ্যাকশন স্বয়ংক্রিয়ভাবে চলবে। টেমপ্লেটে {`{name}, {course}, {phone}`} ব্যবহার করা যায়।</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-slate-300">নিয়মের নাম *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="যেমন: ভর্তির পর আইডি কার্ড বানান" className="bg-slate-950 border-slate-800" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-slate-300">ট্রিগার</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {Object.entries(TRIGGER_LABEL).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {trigger === 'stage_changed' && (
              <div className="space-y-1.5">
                <Label className="text-slate-300">কোন স্টেজে</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {STAGE_CONDITIONS.map(s => <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-slate-300">অ্যাকশন</Label>
              <Select value={ruleAction} onValueChange={setRuleAction}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="create_task" className="text-xs">টাস্ক তৈরি</SelectItem>
                  <SelectItem value="log_interaction" className="text-xs">টাইমলাইনে লগ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {ruleAction === 'create_task' ? (
            <div className="space-y-2 rounded-lg border border-dashed border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="টাস্কের শিরোনাম: যেমন {name}-কে স্বাগতম কল দিন" className="bg-slate-950 border-slate-800 text-xs" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={dueIn} onChange={e => setDueIn(e.target.value)} type="number" placeholder="ডেডলাইন (ঘণ্টা)" className="bg-slate-950 border-slate-800 text-xs" />
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    <SelectItem value="high" className="text-xs">উচ্চ প্রায়োরিটি</SelectItem>
                    <SelectItem value="medium" className="text-xs">মাঝারি</SelectItem>
                    <SelectItem value="low" className="text-xs">কম</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-dashed border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-xs w-40"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="whatsapp" className="text-xs">WhatsApp</SelectItem>
                  <SelectItem value="call" className="text-xs">ফোন কল</SelectItem>
                  <SelectItem value="email" className="text-xs">ইমেইল</SelectItem>
                  <SelectItem value="system" className="text-xs">সিস্টেম</SelectItem>
                </SelectContent>
              </Select>
              <Textarea value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder="লগ টেক্সট: যেমন {name} {course}-এ আগ্রহী..." className="bg-slate-950 border-slate-800 text-xs" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400">বাতিল</Button>
          <Button onClick={submit} disabled={busy || !name.trim()} className="bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-semibold gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} নিয়ম তৈরি করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Knowledge base entry dialog ─────────────────────────────
function NewKbDialog({ open, onOpenChange, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; onDone: (msg: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('course');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    await fetch('/api/crm/kb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, category, body }) });
    setBusy(false);
    onOpenChange(false);
    setTitle(''); setBody('');
    onDone('নলেজ বেসে এন্ট্রি যোগ হয়েছে।');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
        <DialogHeader>
          <DialogTitle>নলেজ বেসে এন্ট্রি</DialogTitle>
          <DialogDescription className="text-slate-400">কোর্সের ফি, ব্যাচ শিডিউল, ভর্তি পলিসি — টিমের সবার জন্য সংরক্ষণ করুন।</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-slate-300">শিরোনাম *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="যেমন: IELTS ব্যাচের ফি ২০২৬" className="bg-slate-950 border-slate-800" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">ক্যাটাগরি</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {Object.entries(KB_CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-300">বিবরণ *</Label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={4} placeholder="বিস্তারিত লিখুন..." className="bg-slate-950 border-slate-800 text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400">বাতিল</Button>
          <Button onClick={submit} disabled={busy || !title.trim() || !body.trim()} className="bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-semibold gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} সংরক্ষণ করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
