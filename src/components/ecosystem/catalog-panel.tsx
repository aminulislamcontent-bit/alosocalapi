'use client';
import { useEffect, useState } from 'react';
import type { CatalogEntry } from '@/lib/ecosystem/catalog';

type Snapshot = {
  verifiedAt: string;
  entries: CatalogEntry[];
  projects: { project: string; status: string; assessment: string }[];
};
const endpoint = '/api/admin/ecosystem';
async function query(action: string, data: Record<string, unknown>) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data }),
  });
  const result = await res.json();
  if (!res.ok) throw Error(result.error || 'Request failed.');
  return result;
}
export default function CatalogPanel() {
  const [catalog, setCatalog] = useState<Snapshot | null>(null),
    [filter, setFilter] = useState(''),
    [category, setCategory] = useState(''),
    [capability, setCapability] = useState(''),
    [terms, setTerms] = useState(''),
    [selection, select] = useState<string[]>([]),
    [message, notify] = useState('');
  useEffect(() => {
    const ctl = new AbortController();
    fetch(endpoint, { signal: ctl.signal })
      .then(async (r) => {
        if (!r.ok) throw Error('Administrator access required.');
        setCatalog(await r.json());
      })
      .catch((e) => {
        if (!ctl.signal.aborted) notify(e.message);
      });
    return () => ctl.abort();
  }, []);
  if (!catalog) return <p role="status">{message || 'Loading ecosystem…'}</p>;
  const entries = catalog.entries,
    shown = entries.filter(
      (e) =>
        (!category || e.category === category) &&
        (!terms || e.codeClass === terms) &&
        (!capability ||
          (capability === 'adapter'
            ? !!e.ollamaTag
            : capability === 'archived'
              ? e.archived
              : !!e.hardwareDocs)) &&
        `${e.name} ${e.codeLicense} ${e.weightsTerms || ''} ${e.maintenance}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
    );
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(selection, null, 2)], {
        type: 'application/json',
      }),
    );
    a.download = 'ecosystem-selection.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return (
    <section className="space-y-4 rounded-xl border border-slate-700 p-5">
      <h2 className="text-xl font-semibold">Open-source AI ecosystem</h2>
      <p>
        Repository evidence checked {catalog.verifiedAt}. {entries.length}{' '}
        records · {entries.filter((e) => e.archived).length} archived. Code
        licenses do not clear model weights for commercial use.
      </p>
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search ecosystem"
          placeholder="Name, license or maintenance…"
          className="bg-slate-900 p-2"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          aria-label="Category"
          className="bg-slate-900"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {[...new Set(entries.map((e) => e.category))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="License review"
          className="bg-slate-900"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
        >
          <option value="">All root licenses</option>
          <option>review</option>
          <option>verified-root-license</option>
        </select>
        <select
          aria-label="Compatibility"
          className="bg-slate-900"
          value={capability}
          onChange={(e) => setCapability(e.target.value)}
        >
          <option value="">All compatibility states</option>
          <option value="adapter">Local Ollama adapter</option>
          <option value="hardware">Upstream hardware guidance</option>
          <option value="archived">Archived source</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-3">
        <button onClick={download}>
          Export shortlist ({selection.length})
        </button>
        <label>
          Import shortlist{' '}
          <input
            type="file"
            accept="application/json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                if (f.size > 32768) throw Error('File too large.');
                const result = await query('validate', {
                  ids: JSON.parse(await f.text()),
                });
                select(result.ids);
                notify('Selection imported for this view only.');
              } catch (err) {
                notify(String(err));
              }
            }}
          />
        </label>
      </div>
      <p role="status" className="text-cyan-300">
        {message}
      </p>
      <p>
        {shown.length} matching entries ·{' '}
        <a className="underline" href={endpoint} download="ecosystem.json">
          Export inventory
        </a>
      </p>
      <div className="max-h-[34rem] overflow-auto space-y-2">
        {shown.map((e) => (
          <article className="border-b border-slate-800 py-2" key={e.id}>
            <label>
              <input
                type="checkbox"
                checked={selection.includes(e.id)}
                onChange={() =>
                  select(
                    selection.includes(e.id)
                      ? selection.filter((v) => v !== e.id)
                      : [...selection, e.id],
                  )
                }
              />{' '}
              {e.name}
            </label>{' '}
            · {e.category} ·{' '}
            <a className="underline" href={e.docs}>
              Pinned docs
            </a>
            {e.hardwareDocs && (
              <>
                {' '}
                ·{' '}
                <a className="underline" href={e.hardwareDocs}>
                  Hardware notes
                </a>
              </>
            )}
            <p className="text-sm">
              {e.maintenance} · root {e.codeLicense || 'unknown'} ({e.codeClass}
              ) · release {e.release?.tagName || 'unreported'} ·{' '}
              {e.ollamaTag
                ? 'Factory adapter available'
                : 'No Factory execution adapter'}
            </p>
            <details>
              <summary>
                Updates and advisories ({e.advisories?.length ?? 'unknown'}{' '}
                sampled)
              </summary>
              <p>
                Last upstream push {e.pushedAt.slice(0, 10)}. Snapshot, not a
                dependency scan.
              </p>
              {e.advisories?.map((a) => (
                <a className="block underline" key={a.id} href={a.url}>
                  {a.id} · {a.severity}
                </a>
              ))}
            </details>
            {e.weights && (
              <a className="underline" href={e.weights}>
                Weights: {e.weightsTerms || 'terms unknown'} (review checkpoint)
              </a>
            )}
            {e.ollamaTag && (
              <button
                className="block text-cyan-300"
                onClick={async () => {
                  try {
                    const r = await query('preflight', { id: e.id });
                    notify(
                      `${r.tag}: ${r.reason}; Ollama ${r.runtimeVersion || 'not detected'}, available RAM ${(r.availableBytes / 2 ** 30).toFixed(1)} GiB, VRAM unknown.`,
                    );
                  } catch (err) {
                    notify(String(err));
                  }
                }}
              >
                Check installation and host compatibility
              </button>
            )}
          </article>
        ))}
      </div>
      <details>
        <summary>Project integration status</summary>
        {catalog.projects.map((p) => (
          <p key={p.project} className="mt-2">
            <strong>
              {p.project} — {p.status}
            </strong>
            <br />
            {p.assessment}
          </p>
        ))}
      </details>
    </section>
  );
}
