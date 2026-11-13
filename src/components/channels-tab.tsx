'use client';

import React, { useMemo, useState } from 'react';
import {
  Search,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Link2,
  LayoutGrid,
  Ruler,
  CalendarClock,
  Ban
} from 'lucide-react';
import {
  CHANNELS,
  GROUP_META,
  TIER_META,
  type ChannelGroup,
  type MarketingChannel,
  type ChannelStatusMap
} from '@/lib/channels-data';

interface Props {
  channelStatus: ChannelStatusMap;
  onToggleLive: (id: string) => void;
  onSetHandle: (id: string, handle: string) => void;
  onCopy: (text: string, label: string) => void;
}

const GROUP_FILTERS: { id: ChannelGroup | 'all'; label: string }[] = [
  { id: 'all', label: 'All Channels' },
  { id: 'foundation', label: 'Foundation' },
  { id: 'meta', label: 'Meta' },
  { id: 'google', label: 'Google' },
  { id: 'social', label: 'Social & Content' },
  { id: 'paid', label: 'Paid Networks' },
  { id: 'retention', label: 'Retention' }
];

export default function ChannelsTab({ channelStatus, onToggleLive, onSetHandle }: Props) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<ChannelGroup | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CHANNELS.filter(c => {
      if (group !== 'all' && c.group !== group) return false;
      if (!q) return true;
      const haystack = [c.name, ...c.assets, ...c.funnel, c.useCase ?? ''].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [group, query]);

  const liveCount = CHANNELS.filter(c => channelStatus[c.id]?.live).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-cyan-400" />
            Marketing Channel Matrix
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            All {CHANNELS.length} channels with asset types, creative sizes, and best posting windows — prioritized for lead generation &amp; sales.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
            Live: <strong className="text-emerald-400">{liveCount} / {CHANNELS.length}</strong>
          </span>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels, assets, use cases..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 lg:pb-0">
          {GROUP_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setGroup(f.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all border ${
                group === f.id
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Channel Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {filtered.map(channel => {
          const status = channelStatus[channel.id];
          const isLive = !!status?.live;
          const gm = GROUP_META[channel.group];
          const tm = TIER_META[channel.leadTier];
          const isOpen = expanded === channel.id;

          return (
            <div
              key={channel.id}
              className={`p-5 rounded-2xl border transition-all space-y-4 ${
                isLive
                  ? 'bg-slate-900 border-emerald-500/30'
                  : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white">{channel.name}</h3>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${gm.badge}`}>{gm.label}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${tm.badge}`} title={tm.desc}>{tm.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {channel.funnel.map(f => (
                      <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">{f}</span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => onToggleLive(channel.id)}
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${
                    isLive
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                  aria-label={`Mark ${channel.name} as ${isLive ? 'not live' : 'live'}`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isLive ? 'Live' : 'Mark Live'}
                </button>
              </div>

              {/* Use Case */}
              {channel.useCase && (
                <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 border border-slate-800/60 rounded-xl p-3">
                  💡 {channel.useCase}
                </p>
              )}

              {/* Asset chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {channel.assets.slice(0, 4).map(a => (
                  <span key={a} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300">{a}</span>
                ))}
                {channel.assets.length > 4 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-cyan-400">+{channel.assets.length - 4} more</span>
                )}
              </div>

              {/* Expand toggle */}
              <button
                onClick={() => setExpanded(isOpen ? null : channel.id)}
                className="w-full py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] font-medium text-slate-300 hover:text-cyan-300 hover:border-cyan-500/30 transition-all flex items-center justify-center gap-1.5"
              >
                {isOpen ? 'Hide Details' : 'View Sizes, Best Times & Setup'}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Expanded Details */}
              {isOpen && (
                <div className="space-y-4 pt-1">
                  {/* Sizes */}
                  {channel.sizes.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                        <Ruler className="w-3.5 h-3.5 text-cyan-400" /> Creative Sizes
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {channel.sizes.map(s => (
                          <div key={s.label} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                            <p className="text-[11px] font-mono text-slate-200">{s.label}</p>
                            {s.note && <p className="text-[10px] text-cyan-400/80 mt-0.5">{s.note}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Best Times */}
                  {channel.bestTimes.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                        <CalendarClock className="w-3.5 h-3.5 text-emerald-400" /> Best Times
                      </h4>
                      <div className="space-y-1.5">
                        {channel.bestTimes.map(t => (
                          <div key={t.window} className="flex items-start gap-2 text-[11px]">
                            <Clock className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                            <span className="font-mono text-emerald-300">{t.window}</span>
                            {t.note && <span className="text-slate-500">— {t.note}</span>}
                          </div>
                        ))}
                      </div>
                      {channel.bestDays && (
                        <p className="text-[11px] text-slate-300 font-mono">📅 {channel.bestDays.join(' • ')}</p>
                      )}
                    </div>
                  )}

                  {/* Avoid */}
                  {channel.avoid && channel.avoid.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-[11px] font-mono text-red-400/90 flex items-center gap-1.5 uppercase tracking-wider">
                        <Ban className="w-3.5 h-3.5" /> Avoid
                      </h4>
                      {channel.avoid.map(a => (
                        <p key={a} className="text-[11px] text-slate-400 flex items-center gap-2">
                          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" /> {a}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Full assets */}
                  <div className="space-y-1.5">
                    <h4 className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <Link2 className="w-3.5 h-3.5 text-slate-400" /> All Assets
                    </h4>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {channel.assets.map(a => (
                        <span key={a} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300">{a}</span>
                      ))}
                    </div>
                  </div>

                  {/* Setup link */}
                  {channel.setupUrl && (
                    <a
                      href={channel.setupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold hover:from-cyan-500/30 hover:to-blue-600/30 transition-all"
                    >
                      {channel.setupLabel ?? 'Open Official Setup'}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              {/* Live handle input */}
              {isLive && (
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Live handle / URL</label>
                  <input
                    value={status?.handle ?? ''}
                    onChange={(e) => onSetHandle(channel.id, e.target.value)}
                    placeholder="e.g. facebook.com/yourpage"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="p-10 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-sm text-slate-400">
          No channels match your search. Try a different keyword or filter.
        </div>
      )}
    </div>
  );
}
