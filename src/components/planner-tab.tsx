'use client';

import React from 'react';
import {
  Rocket,
  ExternalLink,
  CheckCircle2,
  Circle,
  ChevronRight,
} from 'lucide-react';
import {
  LAUNCH_PHASES,
  getChannel,
  type ChannelStatusMap
} from '@/lib/channels-data';

interface Props {
  channelStatus: ChannelStatusMap;
  onToggleChecklist: (id: string) => void;
  onOpenIntegrations: () => void;
}

export default function PlannerTab({
  channelStatus,
  onToggleChecklist,
  onOpenIntegrations
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
            Local Setup Checklist
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Use these phases as a manual planning checklist. A checked item is self-reported only; ALOAPI does not inspect or change provider accounts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-mono text-slate-500 uppercase">Checklist progress</p>
            <p className="text-sm font-bold text-cyan-300 font-mono">{completedCount} / {allStepChannelIds.length} steps marked</p>
          </div>
          <div className="w-28 h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-100">
        These checkboxes and optional account handles are local planning notes, not proof of connection or authorization. ALOAPI no longer generates placeholder account IDs. Any legacy “XX” values in browser storage are ignored and are never exported.
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
                  const markedComplete = !!channelStatus[step.channelId]?.live;

                  return (
                    <div
                      key={`${phase.id}-${step.channelId}-${sIdx}`}
                      className={`p-4 rounded-xl border transition-all ${
                        markedComplete ? 'bg-slate-950/40 border-emerald-500/20' : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {markedComplete ? (
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
                            onClick={() => onToggleChecklist(step.channelId)}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1 ${
                              markedComplete
                                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                            }`}
                          >
                            {markedComplete ? 'Undo checklist' : 'Mark setup checklist complete'}
                            {!markedComplete && <ChevronRight className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Manual setup handoff */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <h4 className="text-sm font-bold text-white">Need provider-specific setup details?</h4>
          <p className="text-xs text-slate-400">
            Use API Intelligence to review official documentation and requirements. Provider access and verification remain unclaimed until supported evidence exists.
          </p>
        </div>
        <button
          onClick={onOpenIntegrations}
          className="shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/20"
        >
          Open API Intelligence
        </button>
      </div>
    </div>
  );
}
