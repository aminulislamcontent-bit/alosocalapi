'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Radar, Loader2 } from 'lucide-react';
import LoginGateway from '@/components/portal/login-gateway';
import ClientPortal from '@/components/portal/client-portal';
import AdminConsole from '@/components/admin-console';
import type { SessionUser } from '@/lib/auth';

type AuthState = 'loading' | 'guest' | 'client' | 'admin';

export default function AppShell() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [state, setState] = useState<AuthState>('loading');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = await res.json();
      const u: SessionUser | null = data.user ?? null;
      setUser(u);
      setState(!u ? 'guest' : u.role === 'admin' ? 'admin' : 'client');
    } catch {
      setUser(null);
      setState('guest');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async session fetch; setState resolves in promise callback
    refresh();
  }, [refresh]);

  // Shared logout: destroy session server-side, then return to gateway
  const handleLogout = useCallback(() => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    setState('guest');
  }, []);

  // ── Splash while checking session ──
  if (state === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-400">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/20 mb-5">
          <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
            <Radar className="w-8 h-8 text-cyan-400 animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
          সেশন যাচাই হচ্ছে...
        </div>
      </div>
    );
  }

  // ── Guest: login gateway ──
  if (state === 'guest' || !user) {
    return <LoginGateway onLoggedIn={refresh} />;
  }

  // ── Client: credential collection portal ──
  if (state === 'client') {
    return <ClientPortal sessionUser={user} onLogout={handleLogout} />;
  }

  // ── Admin: full console (Client Access + Growth Suite) ──
  return <AdminConsole onLogout={handleLogout} />;
}
