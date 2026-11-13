'use client';

// Admin view: SetupBot Pro coverage per client + master JSON export.
// Shows category buckets, per-platform validation status, and lets admin
// download/copy the AES-256-GCM master JSON handoff (spec Phase 4).

import React, { useCallback, useEffect, useState } from 'react';
import {
  Bot, Download, Copy, Loader2, CheckCircle2, AlertTriangle, Clock, ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { SB_CATEGORIES, SB_TOTAL_PLATFORMS, SB_TOTAL_FIELDS, SB_VERSION } from '@/lib/setupbot';

interface ClientRow {
  id: string; name: string; business: string; username: string; status: string;
  collected: number; skipped: number;
}

export default function SetupBotAdminTab() {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ entries: { platform: string; fieldKey: string; status: string; validationStatus: string }[] } | null>(null);
  const [jsonBusy, setJsonBusy] = useState(false);
  const [json, setJson] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/clients');
      const d = await res.json();
      if (!res.ok) { toast({ title: d.error ?? 'লোড ব্যর্থ', variant: 'destructive' }); return; }
      setClients(d.clients);
      if (d.clients.length > 0 && !selId) pickClient(d.clients[0].id);
    } catch {
      toast({ title: 'নেটওয়ার্ক সমস্যা', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  const pickClient = async (id: string) => {
    setSelId(id);
    setJson(null);
    try {
      const res = await fetch(`/api/admin/clients/${id}`);
      const d = await res.json();
      if (!res.ok) { toast({ title: d.error ?? 'ডিটেইল লোড ব্যর্থ', variant: 'destructive' }); return; }
      setDetail(d.client);
    } catch {
      toast({ title: 'নেটওয়ার্ক সমস্যা', variant: 'destructive' });
    }
  };

  useEffect(() => { loadClients(); }, [loadClients]);

  const coverage = (() => {
    if (!detail) return null;
    const sbEntries = detail.entries.filter(e => SB_CATEGORIES.some(c => c.platforms.some(p => p.key === e.platform)));
    const byPlat = new Map<string, { collected: number; total: number; validation: string }>();
    for (const c of SB_CATEGORIES) {
      for (const p of c.platforms) {
        const es = sbEntries.filter(e => e.platform === p.key);
        if (es.length === 0) continue;
        byPlat.set(p.key, {
          collected: es.filter(e => e.status === 'collected').length,
          total: p.fields.length,
          validation: es.find(e => e.validationStatus !== 'none')?.validationStatus ?? 'none',
        });
      }
    }
    return { byPlat, sbCount: sbEntries.length };
  })();

  const exportJson = async () => {
    if (!selId || jsonBusy) return;
    setJsonBusy(true);
    try {
      const res = await fetch(`/api/setupbot/export?clientId=${selId}`);
      const d = await res.json();
      if (!res.ok) { toast({ title: d.error ?? 'এক্সপোর্ট ব্যর্থ', variant: 'destructive' }); return; }
      setJson(JSON.stringify(d, null, 2));
    } catch {
      toast({ title: 'নেটওয়ার্ক সমস্যা', variant: 'destructive' });
    } finally {
      setJsonBusy(false);
    }
  };

  const copyJson = () => {
    if (!json) return;
    navigator.clipboard?.writeText(json).then(() => toast({ title: 'মাস্টার JSON কপি হয়েছে ✔' })).catch(() => toast({ title: 'কপি ব্যর্থ', variant: 'destructive' }));
  };

  const downloadJson = () => {
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `setupbot-master-${selId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) {
    return <div className="flex items-center gap-3 text-slate-400 py-10 justify-center"><Loader2 className="w-5 h-5 animate-spin text-cyan-400" /> লোড হচ্ছে...</div>;
  }

  return (
    <div className="space-y-5">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardContent className="p-5 flex items-start gap-4">
          <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-white">SetupBot Pro <span className="font-mono text-xs text-cyan-400">v{SB_VERSION}</span></h3>
            <p className="text-sm text-slate-400">
              {SB_CATEGORIES.length} ক্যাটাগরি · <strong className="text-cyan-300">{SB_TOTAL_PLATFORMS}</strong> প্ল্যাটফর্ম · <strong className="text-cyan-300">{SB_TOTAL_FIELDS}</strong> ফিল্ড — বাংলা গাইড সহ। ক্লায়েন্ট পোর্টালে <strong className="text-slate-200">&quot;SetupBot Pro&quot;</strong> বাটনে কথোপকথনের মোড চালু হয়।
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-4 gap-3">
        {clients.map(c => (
          <button key={c.id} onClick={() => pickClient(c.id)}
            className={`text-left rounded-xl border p-4 transition-all ${selId === c.id ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'}`}>
            <div className="text-sm font-semibold text-white truncate">{c.name}</div>
            <div className="text-xs text-slate-500 truncate">@{c.username} · {c.business}</div>
            <div className="mt-2 flex gap-2">
              <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">{c.collected} সংগৃহীত</Badge>
              <Badge className="bg-slate-800 text-slate-400 border-slate-700">{c.status}</Badge>
            </div>
          </button>
        ))}
      </div>

      {coverage && detail && (
        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h4 className="font-semibold text-white">ক্যাটাগরি কভারেজ — <span className="text-cyan-400">{coverage.sbCount}</span>টি SetupBot এন্ট্রি</h4>
              <div className="flex gap-2">
                <Button size="sm" onClick={exportJson} disabled={jsonBusy} className="gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold hover:opacity-90 h-8">
                  {jsonBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} মাস্টার JSON
                </Button>
                {json && (
                  <>
                    <Button size="sm" variant="ghost" onClick={copyJson} className="text-cyan-300 gap-1 h-8"><Copy className="w-3.5 h-3.5" /> কপি</Button>
                    <Button size="sm" variant="ghost" onClick={downloadJson} className="text-emerald-300 gap-1 h-8"><Download className="w-3.5 h-3.5" /> সেভ</Button>
                  </>
                )}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {SB_CATEGORIES.map(cat => {
                const rows = cat.platforms.map(p => ({ p, v: coverage.byPlat.get(p.key) })).filter(r => r.v);
                return (
                  <div key={cat.key} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-6 h-6 rounded bg-gradient-to-br ${cat.grad} flex items-center justify-center text-[11px]`}>{cat.emoji}</span>
                      <span className="text-xs font-semibold text-slate-200">{cat.bn}</span>
                      <Badge className="ml-auto bg-slate-800 text-slate-400 border-slate-700 text-[10px]">{rows.length}/{cat.platforms.length}</Badge>
                    </div>
                    {rows.length === 0 ? (
                      <p className="text-[11px] text-slate-600">এখনো শুরু করেনি</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {rows.map(({ p, v }) => (
                          <li key={p.key} className="flex items-center gap-2 text-[11px]">
                            <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                            <span className="text-slate-300 truncate flex-1">{p.bn}</span>
                            <span className="font-mono text-slate-500">{v!.collected}/{v!.total}</span>
                            {v!.validation === 'valid' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                            {v!.validation === 'invalid' && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                            {(v!.validation === 'none' || v!.validation === 'error') && <Clock className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {json && (
        <pre className="max-h-64 overflow-auto custom-scrollbar rounded-xl bg-slate-950 border border-slate-800 p-4 text-[11px] font-mono text-slate-400 whitespace-pre-wrap">{json.slice(0, 3000)}{json.length > 3000 ? '\n… (সেভ/কপি বাটনে সম্পূর্ণ)' : ''}</pre>
      )}
    </div>
  );
}
