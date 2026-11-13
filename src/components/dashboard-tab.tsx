'use client';

import React from 'react';
import {
  LayoutGrid,
  Rocket,
  Target,
  ShieldCheck,
  Clock,
  ArrowUpRight,
  Lock,
  FileText,
  TrendingUp,
  Building2,
  Gauge
} from 'lucide-react';
import {
  CHANNELS,
  LAUNCH_PHASES,
  getChannel,
  type ChannelStatusMap,
  type CompanyProfile
} from '@/lib/channels-data';
import type { VaultToken, PasswordAuditEntry } from '@/lib/vault-data';

interface Props {
  company: CompanyProfile;
  onCompanyChange: (c: CompanyProfile) => void;
  channelStatus: ChannelStatusMap;
  tokens: VaultToken[];
  passwordAudit: Record<string, PasswordAuditEntry>;
  onGoTo: (tab: 'channels' | 'planner' | 'credentials' | 'rotation' | 'env') => void;
}

const FOUNDATION_IDS = ['website-seo', 'google-analytics'];
const CORE_IDS = ['facebook', 'whatsapp', 'instagram', 'messenger'];
const CONTENT_IDS = ['tiktok', 'youtube', 'linkedin'];
const RETENTION_IDS = ['email-marketing', 'telegram'];

const PEAK_WINDOWS = [
  { label: 'Facebook', windows: '12–2 PM • 5–7 PM • 8–10 PM' },
  { label: 'Instagram', windows: '11 AM–1 PM • 6–8 PM • 10–11 PM' },
  { label: 'YouTube Shorts', windows: '11–12 PM • 3–6 PM • 9–11 PM' },
  { label: 'LinkedIn (B2B)', windows: '9–11 AM • 12–2 PM (Tue–Thu)' }
];

export default function DashboardTab({
  company,
  onCompanyChange,
  channelStatus,
  tokens,
  passwordAudit,
  onGoTo
}: Props) {
  const isLive = (id: string) => !!channelStatus[id]?.live;

  // Readiness score: 0-100
  const foundationScore = FOUNDATION_IDS.filter(isLive).length * 15; // 30
  const coreScore = CORE_IDS.filter(isLive).length * 10; // 40
  const contentScore = CONTENT_IDS.some(isLive) ? 15 : 0;
  const retentionScore = RETENTION_IDS.some(isLive) ? 15 : 0;
  const score = foundationScore + coreScore + contentScore + retentionScore;

  const liveCount = CHANNELS.filter(c => isLive(c.id)).length;

  // Next best actions: first not-live channels in phase order
  const seen = new Set<string>();
  const nextActions: { channelId: string; title: string; why: string }[] = [];
  for (const phase of LAUNCH_PHASES) {
    for (const step of phase.steps) {
      if (seen.has(step.channelId)) continue;
      seen.add(step.channelId);
      if (!isLive(step.channelId) && nextActions.length < 4) {
        nextActions.push({ channelId: step.channelId, title: step.title, why: step.why });
      }
    }
  }

  // Vault stats
  const rotatedCount = Object.values(passwordAudit).filter(a => a.rotated).length;
  const totalPlatforms = Object.keys(passwordAudit).length || 1;
  const rotationPct = Math.round((rotatedCount / totalPlatforms) * 100);

  // Score ring geometry
  const ringRadius = 52;
  const circumference = 2 * Math.PI * ringRadius;
  const dashOffset = circumference - (score / 100) * circumference;

  const scoreColor = score >= 75 ? '#34d399' : score >= 40 ? '#22d3ee' : '#fbbf24';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-cyan-400" />
            Operations Dashboard
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            One glance: launch readiness, channel coverage, vault security, and what to do next.
          </p>
        </div>
        <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 self-start">
          Channels Live: <strong className="text-emerald-400">{liveCount} / {CHANNELS.length}</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Company Profile + Score */}
        <div className="space-y-6">
          {/* Company Profile */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              Company Profile
            </h3>
            <div className="space-y-3">
              {([
                { label: 'Company Name', placeholder: 'e.g. BDTECH360', value: company.name, set: (v: string) => onCompanyChange({ ...company, name: v }) },
                { label: 'Niche / Industry', placeholder: 'e.g. Tech & Digital Services', value: company.niche, set: (v: string) => onCompanyChange({ ...company, niche: v }) },
                { label: 'Target Audience', placeholder: 'e.g. SME owners, 25-45, Dhaka', value: company.audience, set: (v: string) => onCompanyChange({ ...company, audience: v }) },
                { label: 'Monthly Marketing Budget', placeholder: 'e.g. 30,000 BDT', value: company.budget, set: (v: string) => onCompanyChange({ ...company, budget: v }) }
              ]).map(f => (
                <div key={f.label} className="space-y-1">
                  <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{f.label}</label>
                  <input
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500">Auto-saved to this browser. Appears in the .env export header.</p>
          </div>

          {/* Readiness Score */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              Lead-Gen Readiness Score
            </h3>
            <div className="flex items-center gap-5">
              <svg width="128" height="128" viewBox="0 0 128 128" className="shrink-0">
                <circle cx="64" cy="64" r={ringRadius} fill="none" stroke="#1e293b" strokeWidth="10" />
                <circle
                  cx="64"
                  cy="64"
                  r={ringRadius}
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 64 64)"
                />
                <text x="64" y="60" textAnchor="middle" fill="#f1f5f9" fontSize="26" fontWeight="bold">{score}</text>
                <text x="64" y="80" textAnchor="middle" fill="#64748b" fontSize="11">/ 100</text>
              </svg>
              <div className="space-y-2 text-[11px] flex-1">
                {([
                  { label: 'Foundation (site + analytics)', value: foundationScore, max: 30 },
                  { label: 'Core lead channels', value: coreScore, max: 40 },
                  { label: 'Content engine running', value: contentScore, max: 15 },
                  { label: 'Retention active', value: retentionScore, max: 15 }
                ]).map(row => (
                  <div key={row.label} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">{row.label}</span>
                      <span className="font-mono text-slate-300">{row.value}/{row.max}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all"
                        style={{ width: `${(row.value / row.max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Middle: Next Best Actions */}
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 h-fit">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-cyan-400" />
                Next Best Actions
              </h3>
              <span className="text-[10px] font-mono text-slate-500">by launch priority</span>
            </div>

            {nextActions.length === 0 ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                <p className="text-xs font-semibold text-emerald-300">🎉 All planned channels are live!</p>
                <p className="text-[11px] text-slate-400 mt-1">Move to paid amplification and scale your winners.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {nextActions.map((action, i) => {
                  const ch = getChannel(action.channelId);
                  return (
                    <div key={action.channelId} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-cyan-500/15 text-cyan-400 text-[10px] font-bold flex items-center justify-center font-mono shrink-0">
                          {i + 1}
                        </span>
                        <p className="text-xs font-semibold text-white">{ch?.name ?? action.channelId}</p>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{action.why}</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onGoTo('planner')}
                          className="px-2.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[10px] font-bold transition-all flex items-center gap-1"
                        >
                          <Rocket className="w-3 h-3" />
                          Open Planner
                        </button>
                        {ch?.setupUrl && (
                          <a
                            href={ch.setupUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium transition-all flex items-center gap-1"
                          >
                            Setup Link
                            <ArrowUpRight className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Peak windows quick reference */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 h-fit">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              Peak Posting Windows
            </h3>
            <div className="space-y-2">
              {PEAK_WINDOWS.map(w => (
                <div key={w.label} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                  <span className="text-[11px] font-semibold text-slate-200">{w.label}</span>
                  <span className="text-[10px] font-mono text-emerald-300 text-right">{w.windows}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => onGoTo('channels')}
              className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-semibold border border-cyan-500/20 transition-all flex items-center justify-center gap-1.5"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              View Full Channel Matrix
            </button>
          </div>
        </div>

        {/* Right: Vault snapshot */}
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 h-fit">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Access Vault Snapshot
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <p className="text-xl font-bold text-cyan-300 font-mono">{tokens.length}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Active Tokens</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                <p className="text-xl font-bold text-emerald-300 font-mono">{rotationPct}%</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Rotation Compliant</p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => onGoTo('credentials')}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 transition-all flex items-center justify-center gap-2"
              >
                <Lock className="w-3.5 h-3.5 text-cyan-400" />
                Open OAuth App Vault
              </button>
              <button
                onClick={() => onGoTo('rotation')}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 transition-all flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Rotation Audit
              </button>
              <button
                onClick={() => onGoTo('env')}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 text-[11px] font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-cyan-500/20"
              >
                <FileText className="w-3.5 h-3.5" />
                Export .env Config
              </button>
            </div>
          </div>

          {/* Goal reminder */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-cyan-950/40 border border-emerald-500/20 space-y-2 h-fit">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" />
              Primary Objective
            </h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Prioritize channels that <strong className="text-emerald-300">collect leads</strong> and <strong className="text-emerald-300">increase sales</strong> —
              while automation (auto-replies, broadcasts, token vaults) keeps marketing operations running on easy mode.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
