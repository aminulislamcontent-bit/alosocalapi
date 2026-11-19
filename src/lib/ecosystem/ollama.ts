import os from 'node:os';
import { localModel } from './catalog';

export function loopback(raw: string) {
  const url = new URL(raw);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw Error('Expected a loopback HTTP Ollama origin.');
  return url.origin;
}
export async function localPreflight(id: unknown) {
  const tag = localModel(id);
  const origin = loopback(
    process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  );
  const pin = process.env.ALOAPI_QWEN3_8B_DIGEST || '';
  const get = async (path: string) => {
    const res = await fetch(origin + path, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw Error('Runtime metadata unavailable');
    return res.json();
  };
  const hostRam = os.totalmem();
  const freeRam = os.freemem();
  const availableBytes = Math.min(freeRam, process.availableMemory());
  const base = {
    tag,
    hostRam,
    availableBytes,
    cpuArchitecture: os.arch(),
    vramBytes: null,
    installed: false,
    approved: false,
    runtimeVersion: null as string | null,
    artifactBytes: null as number | null,
  };
  try {
    const [info, tags] = await Promise.all([
      get('/api/version'),
      get('/api/tags'),
    ]);
    if (typeof info.version !== 'string' || !Array.isArray(tags.models))
      throw Error('Invalid Ollama response');
    const entry = tags.models.find((m: { name?: string }) => m?.name === tag);
    const metadata = {
      ...base,
      runtimeVersion: info.version,
      installed: !!entry,
      artifactBytes:
        Number.isSafeInteger(entry?.size) && entry.size > 0
          ? Number(entry.size)
          : null,
    };
    const approved = /^[a-f0-9]{64}$/.test(pin) && entry?.digest === pin;
    const reason = !entry
      ? 'not-installed'
      : !approved
        ? 'digest-not-approved'
        : !metadata.artifactBytes
          ? 'size-unknown'
          : availableBytes < metadata.artifactBytes * 1.5
            ? 'insufficient-free-memory'
            : 'ready';
    return { ...metadata, approved, reason };
  } catch {
    return { ...base, reason: 'runtime-unavailable' };
  }
}
