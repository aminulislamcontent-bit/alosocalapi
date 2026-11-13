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
import { Loader2, Plus, Trash2, Zap, CalendarClock, AlertTriangle, CheckCircle2, Phone, Circle, CheckCircle } from 'lucide-react';

interface TaskRow {
  id: string; title: string; done: boolean; dueAt: string | null; priority: string;
  origin: string; overdue: boolean; contactName: string | null; contactPhone: string | null;
  leadTitle: string | null; completedAt: string | null;
}

const PRIO: Record<string, { label: string; cls: string }> = {
  high: { label: 'উচ্চ', cls: 'text-red-300 border-red-500/30 bg-red-500/10' },
  medium: { label: 'মাঝারি', cls: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  low: { label: 'কম', cls: 'text-slate-400 border-slate-600 bg-slate-800/60' },
};

export default function CrmTasksTab() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'today' | 'overdue' | 'done'>('open');
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', dueAt: '', priority: 'medium' });
  const [busy, setBusy] = useState(false);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/crm/tasks', { cache: 'no-store' });
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (t: TaskRow) => {
    await fetch('/api/crm/tasks', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, done: !t.done }),
    });
    flash(!t.done ? `সম্পন্ন হয়েছে: ${t.title}` : `আবার খোলা হয়েছে: ${t.title}`);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('টাস্কটি মুছে ফেলবেন?')) return;
    await fetch('/api/crm/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    flash('টাস্ক মুছে ফেলা হয়েছে।');
    load();
  };

  const submit = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    await fetch('/api/crm/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, dueAt: form.dueAt || undefined }),
    });
    setBusy(false);
    setOpen(false);
    setForm({ title: '', dueAt: '', priority: 'medium' });
    flash('টাস্ক তৈরি হয়েছে।');
    load();
  };

  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const shown = tasks.filter(t => {
    if (filter === 'open') return !t.done;
    if (filter === 'done') return t.done;
    if (filter === 'overdue') return !t.done && t.overdue;
    if (filter === 'today') return !t.done && t.dueAt && new Date(t.dueAt) <= endOfToday;
    return true;
  });

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-slate-400 text-sm gap-3"><Loader2 className="w-5 h-5 animate-spin text-cyan-400" /> টাস্ক লোড হচ্ছে...</div>;
  }

  const openCount = tasks.filter(t => !t.done).length;
  const overdueCount = tasks.filter(t => !t.done && t.overdue).length;

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-cyan-500/40 bg-slate-900/95 backdrop-blur px-4 py-3 shadow-2xl text-sm text-slate-200 flex items-center gap-2">
          <Zap className="w-4 h-4 text-cyan-300" />{toast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {([
            ['open', `খোলা (${openCount})`],
            ['today', 'আজকের'],
            ['overdue', `ওভারডিউ (${overdueCount})`],
            ['done', 'সম্পন্ন'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${filter === k ? 'bg-slate-800 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold gap-1.5 h-8 shrink-0">
          <Plus className="w-3.5 h-3.5" /> নতুন টাস্ক
        </Button>
      </div>

      <div className="space-y-2 max-h-[65vh] overflow-y-auto custom-scrollbar">
        {shown.map(t => (
          <div key={t.id} className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${t.done ? 'border-slate-800/60 bg-slate-950/40 opacity-60' : t.overdue ? 'border-red-500/30 bg-red-950/20' : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'}`}>
            <button onClick={() => toggle(t)} aria-label={t.done ? 'পুনরায় খুলুন' : 'সম্পন্ন করুন'} className="mt-0.5 shrink-0 text-slate-500 hover:text-emerald-400 transition-colors">
              {t.done ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm ${t.done ? 'line-through text-slate-500' : 'text-slate-200'}`}>{t.title}</div>
              <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px]">
                <span className={`px-1.5 py-0.5 rounded border font-medium ${PRIO[t.priority]?.cls ?? PRIO.medium.cls}`}>{PRIO[t.priority]?.label ?? 'মাঝারি'}</span>
                {t.dueAt && (
                  <span className={`flex items-center gap-1 ${t.overdue ? 'text-red-400' : 'text-slate-500'}`}>
                    {t.overdue ? <AlertTriangle className="w-3 h-3" /> : <CalendarClock className="w-3 h-3" />}
                    {new Date(t.dueAt).toLocaleString('bn-BD', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                )}
                {t.contactName && <span className="text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{t.contactName}</span>}
                {t.origin.startsWith('rule:') && <span className="text-fuchsia-400 flex items-center gap-0.5"><Zap className="w-3 h-3" />অটোমেশন</span>}
                {t.done && t.completedAt && <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{new Date(t.completedAt).toLocaleDateString('bn-BD')}</span>}
              </div>
            </div>
            {t.contactPhone && (
              <a href={`https://wa.me/${t.contactPhone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors shrink-0">
                <Phone className="w-4 h-4" />
              </a>
            )}
            <button onClick={() => remove(t.id)} aria-label="মুছুন" className="p-1.5 text-slate-600 hover:text-red-400 transition-colors shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {shown.length === 0 && (
          <div className="text-center text-slate-500 text-xs py-12">
            {filter === 'done' ? 'এখনো কোনো টাস্ক সম্পন্ন হয়নি।' : 'কোনো টাস্ক নেই — দুর্দান্ত! 🎯'}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
          <DialogHeader>
            <DialogTitle>নতুন টাস্ক</DialogTitle>
            <DialogDescription className="text-slate-400">ম্যানুয়াল ফলো-আপ টাস্ক তৈরি করুন।</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-slate-300">শিরোনাম *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="যেমন: রফিক ভাইকে ফি নিয়ে কল করুন" className="bg-slate-950 border-slate-800" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-slate-300">ডেডলাইন</Label>
                <Input type="datetime-local" value={form.dueAt} onChange={e => setForm(f => ({ ...f, dueAt: e.target.value }))} className="bg-slate-950 border-slate-800 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300">প্রায়োরিটি</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="bg-slate-950 border-slate-800"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    <SelectItem value="high">উচ্চ</SelectItem>
                    <SelectItem value="medium">মাঝারি</SelectItem>
                    <SelectItem value="low">কম</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-400">বাতিল</Button>
            <Button onClick={submit} disabled={busy || !form.title.trim()} className="bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} তৈরি করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
