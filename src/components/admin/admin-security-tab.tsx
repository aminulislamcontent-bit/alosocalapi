'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, LockKeyhole, Monitor, Copy, RefreshCw, LogOut, AlertTriangle, CheckCircle2 } from 'lucide-react';

type SessionItem = { current: boolean; userAgent: string; createdAt: string; lastSeenAt: string; expiresAt: string };
type MfaState = { enabled: boolean; recoveryCodesRemaining: number };

export default function AdminSecurityTab({ onLogout }: { onLogout: () => void }) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [mfa, setMfa] = useState<MfaState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [provisioningUri, setProvisioningUri] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const [sessionResponse, mfaResponse] = await Promise.all([
        fetch('/api/auth/sessions', { cache: 'no-store' }),
        fetch('/api/auth/mfa', { cache: 'no-store' }),
      ]);
      const [sessionData, mfaData] = await Promise.all([sessionResponse.json(), mfaResponse.json()]);
      if (!sessionResponse.ok) throw new Error(sessionData.error ?? 'Could not load sessions.');
      if (!mfaResponse.ok) throw new Error(mfaData.error ?? 'Could not load MFA state.');
      setSessions(sessionData.sessions ?? []); setMfa(mfaData);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load security settings.'); }
  }, []);

  // Initial async fetch hydrates this panel after the response resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: currentPassword, next: newPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Password update failed.');
      setCurrentPassword(''); setNewPassword(''); setNotice(`Password updated; ${data.otherSessionsRevoked ? 'other sessions were revoked.' : ''}`); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Password update failed.'); }
    finally { setBusy(false); }
  };

  const beginMfa = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/auth/mfa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setup', currentPassword: setupPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'MFA setup failed.');
      setProvisioningUri(data.provisioningUri); setSetupPassword(''); setNotice('Add the URI to an authenticator app within 10 minutes, then confirm a current six-digit code. Do not paste it into chat or save it in browser storage.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'MFA setup failed.'); }
    finally { setBusy(false); }
  };

  const confirmMfa = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/mfa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm', code: setupCode }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'MFA confirmation failed.');
      setRecoveryCodes(data.recoveryCodes ?? []); setSetupCode(''); setProvisioningUri(''); setNotice('MFA enabled. Save these one-time recovery codes offline; they will not be shown again.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'MFA confirmation failed.'); }
    finally { setBusy(false); }
  };

  const disableMfa = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/auth/mfa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disable', currentPassword: disablePassword, code: disableCode }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'MFA disable failed.');
      setDisablePassword(''); setDisableCode(''); setRecoveryCodes([]); setNotice('MFA disabled after password and code confirmation.'); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'MFA disable failed.'); }
    finally { setBusy(false); }
  };

  const revokeOtherSessions = async () => {
    if (!window.confirm('Revoke all other sessions for this account? The current session will remain active.')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke-others' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not revoke sessions.');
      setNotice(`${data.revoked} other session(s) revoked.`); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not revoke sessions.'); }
    finally { setBusy(false); }
  };

  const revokeAllSessions = async () => {
    if (!window.confirm('Revoke every session, including this one, and sign out?')) return;
    await fetch('/api/auth/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke-all' }) }).catch(() => undefined);
    onLogout();
  };

  const copyRecoveryCodes = async () => {
    try { await navigator.clipboard.writeText(recoveryCodes.join('\n')); setNotice('Recovery codes copied. Store them offline and clear the clipboard when finished.'); }
    catch { setError('Clipboard access failed. Store the codes in a secure offline location.'); }
  };

  return <div className="space-y-5 text-slate-100">
    <div className="rounded-2xl border border-cyan-500/20 bg-slate-900/80 p-5">
      <h2 className="flex items-center gap-2 text-xl font-bold"><ShieldCheck className="h-5 w-5 text-cyan-400" />Admin security</h2>
      <p className="mt-1 text-sm text-slate-400">MFA, password rotation, and session inventory for the local administrator. Secret material is not persisted in browser storage.</p>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">{notice}</p>}
    </div>

    <div className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={changePassword} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <h3 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-cyan-400" />Change password</h3>
        <input type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} placeholder="Current password" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
        <input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="New password (12+ characters)" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
        <button disabled={busy} className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Update password and revoke other sessions</button>
      </form>

      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <h3 className="flex items-center gap-2 font-semibold"><LockKeyhole className="h-4 w-4 text-amber-400" />Authenticator MFA</h3>
        <p className="text-sm text-slate-400">Status: <strong className={mfa?.enabled ? 'text-emerald-300' : 'text-amber-300'}>{mfa?.enabled ? `Enabled · ${mfa.recoveryCodesRemaining} recovery code(s) remain` : 'Not enabled'}</strong></p>
        {mfa?.enabled ? <form onSubmit={disableMfa} className="space-y-2">
          <input type="password" autoComplete="current-password" required value={disablePassword} onChange={event => setDisablePassword(event.target.value)} placeholder="Current password" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <input inputMode="numeric" autoComplete="one-time-code" required value={disableCode} onChange={event => setDisableCode(event.target.value)} placeholder="Authenticator code or recovery code" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <button disabled={busy} className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300 disabled:opacity-50">Disable MFA (requires both checks)</button>
        </form> : <form onSubmit={beginMfa} className="space-y-2">
          <input type="password" autoComplete="current-password" required value={setupPassword} onChange={event => setSetupPassword(event.target.value)} placeholder="Current password" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <button disabled={busy} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Start MFA enrollment</button>
        </form>}
        {provisioningUri && <form onSubmit={confirmMfa} className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-100">Add this URI manually to your authenticator. This seed is shown only for enrollment and expires in 10 minutes:</p>
          <textarea readOnly value={provisioningUri} rows={3} className="w-full select-all rounded bg-slate-950 p-2 text-xs font-mono text-slate-200" />
          <input inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={setupCode} onChange={event => setSetupCode(event.target.value.replace(/\D/g, ''))} placeholder="Six-digit code" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <button disabled={busy || setupCode.length !== 6} className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Confirm and enable MFA</button>
        </form>}
        {recoveryCodes.length > 0 && <div className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-200"><AlertTriangle className="h-4 w-4" />Save these recovery codes offline now. They are shown only once.</p>
          <div className="grid grid-cols-2 gap-1 font-mono text-xs text-slate-200">{recoveryCodes.map(code => <span key={code}>{code}</span>)}</div>
          <button type="button" onClick={() => void copyRecoveryCodes()} className="inline-flex items-center gap-2 rounded border border-slate-700 px-2 py-1 text-xs"><Copy className="h-3 w-3" />Copy codes</button>
          <p className="text-xs text-slate-500">Reloading or leaving this page clears the one-time display.</p>
        </div>}
      </div>
    </div>

    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
      <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div><h3 className="flex items-center gap-2 font-semibold"><Monitor className="h-4 w-4 text-cyan-400" />Active sessions</h3><p className="text-xs text-slate-500">No session IDs or tokens are exposed; device labels are untrusted user-agent text.</p></div>
        <div className="flex gap-2"><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300"><RefreshCw className="h-3.5 w-3.5" />Refresh</button><button onClick={() => void revokeOtherSessions()} className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs text-amber-200">Revoke others</button><button onClick={() => void revokeAllSessions()} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-200"><LogOut className="h-3.5 w-3.5" />Sign out all</button></div>
      </div>
      {sessions.length === 0 ? <p className="text-sm text-slate-500">No sessions listed.</p> : <ul className="space-y-2">{sessions.map((session, index) => <li key={`${session.createdAt}:${index}`} className="flex flex-col justify-between gap-2 rounded-lg border border-slate-800 p-3 text-xs md:flex-row md:items-center"><span className="flex items-center gap-2"><Monitor className="h-4 w-4 text-slate-500" />{session.userAgent}<span className={session.current ? 'rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-300' : 'rounded bg-slate-800 px-2 py-0.5 text-slate-400'}>{session.current ? 'This session' : 'Other session'}</span></span><span className="text-slate-500">Started {new Date(session.createdAt).toLocaleString()} · seen {new Date(session.lastSeenAt).toLocaleString()} · expires {new Date(session.expiresAt).toLocaleString()}</span></li>)}</ul>}
    </div>
  </div>;
}
