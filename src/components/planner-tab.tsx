'use client';

import React from 'react';
import {
  Rocket,
  ExternalLink,
  Wand2,
  Copy,
  Trash2,
  CheckCircle2,
  Circle,
  KeyRound,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import {
  LAUNCH_PHASES,
  getChannel,
  type ChannelStatusMap,
  type AccessIdMap
} from '@/lib/channels-data';

interface Props {
  channelStatus: ChannelStatusMap;
  accessIds: AccessIdMap;
  onToggleLive: (id: string) => void;
  onGenerateXX: (id: string) => void;
  onRemoveXX: (id: string, xxId: string) => void;
  onCopy: (text: string, label: string) => void;
  onOpenVault: () => void;
}

export default function PlannerTab({
  channelStatus,
  accessIds,
  onToggleLive,
  onGenerateXX,
  onRemoveXX,
  onCopy,
  onOpenVault
}: Props) {
  // Overall progress: unique channels across all phases
  const allStepChannelIds = Array.from(new Set(LAUNCH_PHASES.flatMap(p => p.steps.map(s => s.channelId))));
  const completedCount = allStepChannelIds.filter(id => channelStatus[id]?.live).length;
  const progressPct = Math.round((completedCount / allStepChannelIds.length) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Rocket className="w-5 h-5 text-cyan-400" />
            New Company Launch Planner
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            No marketing site or platform yet? Start at Phase 0 and follow the roadmap — each step creates one channel and issues placeholder XX Access IDs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-mono text-slate-500 uppercase">Launch Progress</p>
            <p className="text-sm font-bold text-cyan-300 font-mono">{completedCount} / {allStepChannelIds.length} channels</p>
          </div>
          <div className="w-28 h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      {/* XX ID System Explainer */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/60 via-slate-900 to-cyan-950/60 border border-cyan-500/30 relative overflow-hidden">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
            <KeyRound className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-white flex items-center gap-2">
              XX Access ID System
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">Pre-Launch Mode</span>
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              When a platform is not created yet, generate a placeholder <span className="font-mono text-cyan-300">XX-XXXX-XXXX</span> Access ID per channel.
              Use these codes in planning docs, agency briefs and the .env export — then swap in real credentials later from the OAuth App Vault.
            </p>
          </div>
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-5">
        {LAUNCH_PHASES.map((phase, pIdx) => {
          const done = phase.steps.filter(s => channelStatus[s.channelId]?.live).length;
          const total = phase.steps.length;
          const phaseComplete = done === total;

          return (
            <div
              key={phase.id}
              className={`p-5 rounded-2xl border space-y-4 ${
                phaseComplete
                  ? 'bg-slate-900/70 border-emerald-500/30'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              {/* Phase header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold font-mono border ${
                    phaseComplete
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                      : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  }`}>
                    {String(pIdx).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">{phase.name}</h3>
                    <p className="text-[11px] text-slate-400">{phase.tagline}</p>
                  </div>
                </div>
                <span className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border self-start ${
                  phaseComplete
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}>
                  {done} / {total} done
                </span>
              </div>

              {/* Steps */}
              <div className="space-y-3">
                {phase.steps.map((step, sIdx) => {
                  const channel = getChannel(step.channelId);
                  const isLive = !!channelStatus[step.channelId]?.live;
                  const ids = accessIds[step.channelId] ?? [];

                  return (
                    <div
                      key={`${phase.id}-${step.channelId}-${sIdx}`}
                      className={`p-4 rounded-xl border transition-all ${
                        isLive ? 'bg-slate-950/40 border-emerald-500/20' : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {isLive ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <Circle className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
                          )}
                          <div className="space-y-1 min-w-0">
                            <p className="text-xs font-bold text-white flex items-center gap-2 flex-wrap">
                              {step.title}
                              {channel && (
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{channel.name}</span>
                              )}
                            </p>
                            <p className="text-[11px] text-slate-400 leading-relaxed">{step.why}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {channel?.setupUrl && (
                            <a
                              href={channel.setupUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-medium border border-cyan-500/20 transition-all flex items-center gap-1"
                            >
                              {channel.setupLabel ?? 'Setup'}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          <button
                            onClick={() => onGenerateXX(step.channelId)}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-[10px] font-medium border border-indigo-500/30 transition-all flex items-center gap-1"
                          >
                            <Wand2 className="w-3 h-3" />
                            Generate XX ID
                          </button>
                          <button
                            onClick={() => onToggleLive(step.channelId)}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1 ${
                              isLive
                                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                            }`}
                          >
                            {isLive ? 'Undo Live' : 'Mark Live'}
                            {!isLive && <ChevronRight className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      {/* Issued XX IDs */}
                      {ids.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-cyan-400" /> XX Access IDs:
                          </span>
                          {ids.map(xx => (
                            <span key={xx} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900 border border-cyan-500/30 font-mono text-[10px] text-cyan-300">
                              {xx}
                              <button
                                onClick={() => onCopy(xx, 'XX Access ID')}
                                className="text-slate-500 hover:text-cyan-300 transition-colors"
                                aria-label={`Copy ${xx}`}
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => onRemoveXX(step.channelId, xx)}
                                className="text-slate-600 hover:text-red-400 transition-colors"
                                aria-label={`Remove ${xx}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
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

      {/* After launch: real credentials */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <h4 className="text-sm font-bold text-white">Channels created? Replace XX placeholders with real OAuth credentials.</h4>
          <p className="text-xs text-slate-400">
            Head to the OAuth App Vault, paste your real App IDs &amp; Secrets, then export the final .env for production.
          </p>
        </div>
        <button
          onClick={onOpenVault}
          className="shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/20"
        >
          <KeyRound className="w-4 h-4" />
          Open OAuth App Vault
        </button>
      </div>
    </div>
  );
}
