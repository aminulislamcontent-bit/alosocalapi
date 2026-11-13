'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Radar, ShieldCheck, LogIn, UserRound, KeyRound, Lock,
  ClipboardCopy, Zap, ArrowDownToLine, Landmark, RefreshCcw, Eye, EyeOff, Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const HOW_IT_WORKS = [
  {
    icon: Landmark,
    title: '১. অ্যাকাউন্ট তৈরি',
    desc: 'আমরা (এজেন্সি) আপনার জন্য সাময়িক ইউজারনেম ও পাসওয়ার্ড বানিয়ে WhatsApp-এ পাঠাই।',
  },
  {
    icon: ClipboardCopy,
    title: '২. তথ্য সংগ্রহ',
    desc: 'লগইন করে সিস্টেমের দেখানো ধাপ অনুসরণ করুন — প্রতিটি আইডি/টোকেন কোথায় পাবেন বাংলায় লেখা আছে।',
  },
  {
    icon: RefreshCcw,
    title: '৩. অটো-লগআউট ও নিরাপত্তা',
    desc: 'সংগ্রহ শেষ হলে সেশন বন্ধ হয়ে যায়। এরপর আপনি নিশ্চিন্তে আপনার পাসওয়ার্ড বদলে নিতে পারেন — API টোকেনে কোনো প্রভাব পড়ে না।',
  },
];

const SECURITY_CHIPS = [
  { icon: Lock, label: 'সাময়িক পাসওয়ার্ড' },
  { icon: ShieldCheck, label: 'অটো-লগআউট' },
  { icon: EyeOff, label: 'পাসওয়ার্ড কখনো লাগে না' },
  { icon: Zap, label: '৫ মিনিটে সেটআপ' },
];

export default function LoginGateway({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { toast } = useToast();
  const router = useRouter();
  const [clientForm, setClientForm] = useState({ username: '', password: '' });
  const [adminForm, setAdminForm] = useState({ username: '', password: '' });
  const [showPw, setShowPw] = useState<{ client: boolean; admin: boolean }>({ client: false, admin: false });
  const [loading, setLoading] = useState<'client' | 'admin' | null>(null);

  const doLogin = async (role: 'client' | 'admin') => {
    const form = role === 'client' ? clientForm : adminForm;
    if (!form.username.trim() || !form.password) {
      toast({ title: 'ইউজারনেম ও পাসওয়ার্ড দিন', variant: 'destructive' });
      return;
    }
    setLoading(role);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? 'লগইন ব্যর্থ হয়েছে', variant: 'destructive' });
        return;
      }
      toast({ title: role === 'admin' ? 'অ্যাডমিন প্যানেলে স্বাগতম!' : 'স্বাগতম! চলুন শুরু করি।' });
      onLoggedIn();
      router.refresh();
    } catch {
      toast({ title: 'নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন', variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  const fillDemo = () => setClientForm({ username: 'demo', password: 'demo1234' });

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-3xl" />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 lg:px-8 py-10 lg:py-16">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">

          {/* ── Left: Branding ── */}
          <section aria-label="পরিচিতি">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/20">
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                  <Radar className="w-7 h-7 text-cyan-400" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">ALO EDUCATION BD</h1>
                <p className="text-xs font-mono text-cyan-400 uppercase tracking-wider">CRM &amp; Automation Hub · v4.0</p>
              </div>
            </div>

            <h2 className="text-3xl md:text-4xl font-bold leading-tight text-white mb-4">
              ক্রেডেনশিয়াল তুলতে আর <span className="text-cyan-400">হুলুস্থুল নয়</span> —
              ক্লায়েন্ট নিজেই দিয়ে দেবে, <span className="text-cyan-400">ধাপে ধাপে</span>
            </h2>
            <p className="text-slate-400 leading-relaxed mb-8">
              CRM, অটোমেশন বা মার্কেটিং চালাতে যেসব API টোকেন, WhatsApp Lite ID, Page ID ও Web URL দরকার —
              সেগুলো খুঁজে বের করতে যে সময় নষ্ট হয়, এই পোর্টাল সেটা শূন্যে নামিয়ে আনে (১৩টি প্ল্যাটফর্ম)।
              ক্লায়েন্ট লগইন করে বাংলা গাইড দেখে নিজের তথ্য জমা দেয়; কালেকশন শেষ হলে অ্যাকাউন্ট অটো-লক।
            </p>

            <div className="space-y-4 mb-8">
              {HOW_IT_WORKS.map((s, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <s.icon className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-100 text-sm">{s.title}</h3>
                    <p className="text-sm text-slate-400 mt-0.5 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {SECURITY_CHIPS.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
                  <c.icon className="w-3.5 h-3.5 text-emerald-400" />
                  {c.label}
                </span>
              ))}
            </div>
          </section>

          {/* ── Right: Login Card ── */}
          <section aria-label="লগইন">
            <Card className="bg-slate-900/80 border-slate-800 shadow-2xl shadow-black/40 backdrop-blur">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl text-white">লগইন করুন</CardTitle>
                    <CardDescription className="text-slate-400 mt-1">আপনার অ্যাকাউন্টের ধরন বেছে নিন</CardDescription>
                  </div>
                  <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 font-mono text-[10px]">
                    STAGING
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="client" className="w-full">
                  <TabsList className="grid grid-cols-2 w-full bg-slate-950 border border-slate-800">
                    <TabsTrigger value="client" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-300 gap-2">
                      <UserRound className="w-4 h-4" /> ক্লায়েন্ট
                    </TabsTrigger>
                    <TabsTrigger value="admin" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-300 gap-2">
                      <KeyRound className="w-4 h-4" /> অ্যাডমিন
                    </TabsTrigger>
                  </TabsList>

                  {/* Client login */}
                  <TabsContent value="client" className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="client-user" className="text-sm font-medium text-slate-300">ইউজারনেম</label>
                      <Input
                        id="client-user"
                        autoComplete="username"
                        placeholder="যেমন: fashion1234"
                        value={clientForm.username}
                        onChange={e => setClientForm(f => ({ ...f, username: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && doLogin('client')}
                        className="bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="client-pass" className="text-sm font-medium text-slate-300">পাসওয়ার্ড</label>
                      <div className="relative">
                        <Input
                          id="client-pass"
                          type={showPw.client ? 'text' : 'password'}
                          autoComplete="current-password"
                          placeholder="সাময়িক পাসওয়ার্ড"
                          value={clientForm.password}
                          onChange={e => setClientForm(f => ({ ...f, password: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && doLogin('client')}
                          className="bg-slate-950 border-slate-800 text-slate-100 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw(s => ({ ...s, client: !s.client }))}
                          aria-label={showPw.client ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখান'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          {showPw.client ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button
                      onClick={() => doLogin('client')}
                      disabled={loading !== null}
                      className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold hover:opacity-90 gap-2"
                    >
                      {loading === 'client' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                      তথ্য সংগ্রহ শুরু করুন
                    </Button>
                    <button
                      onClick={fillDemo}
                      className="w-full text-xs text-slate-500 hover:text-cyan-400 transition-colors"
                    >
                      ডেমো টেস্ট: demo / demo1234 — ক্লিক করে অটো-ফিল করুন
                    </button>
                  </TabsContent>

                  {/* Admin login */}
                  <TabsContent value="admin" className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="admin-user" className="text-sm font-medium text-slate-300">অ্যাডমিন ইউজারনেম</label>
                      <Input
                        id="admin-user"
                        autoComplete="username"
                        placeholder="alamin"
                        value={adminForm.username}
                        onChange={e => setAdminForm(f => ({ ...f, username: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && doLogin('admin')}
                        className="bg-slate-950 border-slate-800 text-slate-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="admin-pass" className="text-sm font-medium text-slate-300">মাস্টার পাসওয়ার্ড</label>
                      <div className="relative">
                        <Input
                          id="admin-pass"
                          type={showPw.admin ? 'text' : 'password'}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          value={adminForm.password}
                          onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && doLogin('admin')}
                          className="bg-slate-950 border-slate-800 text-slate-100 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw(s => ({ ...s, admin: !s.admin }))}
                          aria-label={showPw.admin ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখান'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          {showPw.admin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button
                      onClick={() => doLogin('admin')}
                      disabled={loading !== null}
                      className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold hover:opacity-90 gap-2"
                    >
                      {loading === 'admin' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                      অ্যাডমিন কনসোলে প্রবেশ
                    </Button>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      প্রথমবার: <span className="font-mono text-slate-400">alamin / alamin2026</span> — লগইনের পর অ্যাকাউন্ট সেটিংস থেকে পাসওয়ার্ড বদলে নিন।
                    </p>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <div className="mt-4 flex items-center gap-2 justify-center text-xs text-slate-600">
              <ArrowDownToLine className="w-3.5 h-3.5" />
              সব ডেটা এই স্টেজিং এনভায়রনমেন্টেই থাকে — বাইরে কোথাও প্রকাশিত হয় না
            </div>
          </section>
        </div>
      </main>

      <footer className="mt-auto border-t border-slate-800/60 py-4 text-center text-xs text-slate-600">
        Al-Amin IP Access — Personal Agency Tool · Staging Environment · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
