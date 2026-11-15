#!/usr/bin/env node
/**
 * Fetch EVERY public repository tagged with the GitHub topic `mern-project`
 * (https://github.com/topics/mern-project) into docs/mern-projects/projects.json + .csv
 *
 * Why partitioning? The GitHub Search API returns at most 1,000 results per
 * query. The topic has >2,000 repos, so a single query silently truncates.
 * This script partitions by star-range, and (for the >1,000-repo 0-star
 * bucket) by creation year, so every bucket stays under the 1,000 cap and
 * the union is genuinely complete. Repos are de-duplicated by id.
 *
 * Auth: uses GITHUB_TOKEN / GH_TOKEN if set, otherwise `gh auth token`.
 * Usage:  node scripts/fetch-mern-projects.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT_DIR = "docs/mern-projects";
const TOPIC = "mern-project";
const PER_PAGE = 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function token() {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN)
    return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    return ""; // unauthenticated: 10 search req/min, script still works, slower
  }
}
const TOKEN = token();

async function search(query, page = 1) {
  await sleep(2100); // global throttle: stay under the 30/min authenticated search rate limit
  const path = `search/repositories?q=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}`;
  // Prefer `gh api` (authenticated, handles TLS/proxy correctly); fall back to fetch.
  try {
    const out = execFileSync("gh", ["api", path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(out);
  } catch (e) {
    if (!/ENOENT/.test(String(e))) {
      // gh present but request failed (e.g. rate limit) — wait and retry once via fetch path below.
      await sleep(15000);
    }
  }
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${query} p${page}: ${await res.text()}`);
  return res.json();
}

async function fetchBucket(query) {
  const first = await search(query, 1);
  const items = [...first.items];
  const pages = Math.ceil(Math.min(first.total_count, 1000) / PER_PAGE);
  for (let p = 2; p <= pages; p++) {
    await sleep(TOKEN ? 2100 : 7000); // stay under search rate limits (30/min auth, 10/min anon)
    items.push(...(await search(query, p)).items);
  }
  if (first.total_count > 1000)
    console.warn(`  ⚠ bucket still >1000 (truncated by GitHub): ${query} (${first.total_count})`);
  console.log(`  ${query}  -> ${items.length}/${first.total_count}`);
  return items;
}

/** Split one star bucket by creation year until every sub-bucket <= 1000. */
async function fetchStarBucket(stars) {
  const base = `topic:${TOPIC} stars:${stars}`;
  const probe = await search(base, 1);
  if (probe.total_count <= 1000) return fetchBucket(base);
  console.log(`  bucket ${stars} has ${probe.total_count} repos — splitting by created year`);
  let out = [];
  for (let year = 2008; year <= new Date().getFullYear(); year++) {
    const q = `${base} created:${year}-01-01..${year}-12-31`;
    const p = await search(q, 1);
    if (p.total_count === 0) continue;
    if (p.total_count <= 1000) {
      out.push(...(await fetchBucket(q)));
    } else {
      // Extremely unlikely; fall back month-by-month.
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, "0");
        const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
        const mq = `${base} created:${year}-${mm}-01..${year}-${mm}-${last}`;
        const mp = await search(mq, 1);
        if (mp.total_count) out.push(...(await fetchBucket(mq)));
      }
    }
  }
  return out;
}

const STAR_BUCKETS = [">=100", "50..99", "20..49", "10..19", "5..9", "3..4", "2..2", "1..1", "0..0"];
const byId = new Map();
for (const stars of STAR_BUCKETS) {
  for (const r of await fetchStarBucket(stars)) byId.set(r.id, r);
}

const repos = [...byId.values()]
  .map((r) => ({
    full_name: r.full_name,
    name: r.name,
    owner: r.owner.login,
    url: r.html_url,
    clone_url: r.clone_url,
    description: r.description ?? "",
    stars: r.stargazers_count,
    forks: r.forks_count,
    language: r.language ?? "",
    license: r.license?.spdx_id ?? "",
    topics: r.topics ?? [],
    archived: r.archived,
    created_at: r.created_at,
    updated_at: r.updated_at,
    pushed_at: r.pushed_at,
  }))
  .sort((a, b) => b.stars - a.stars || a.full_name.localeCompare(b.full_name));

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/projects.json`, JSON.stringify(repos, null, 2) + "\n");
const esc = (v) => `"${String(v).replaceAll('"', '""')}"`;
const csv = [
  "full_name,url,stars,forks,language,license,archived,created_at,updated_at,description",
  ...repos.map((r) =>
    [r.full_name, r.url, r.stars, r.forks, r.language, r.license, r.archived, r.created_at, r.updated_at, r.description].map(esc).join(",")
  ),
].join("\n");
writeFileSync(`${OUT_DIR}/projects.csv`, csv + "\n");

// Sanity check against the live total.
const total = (await search(`topic:${TOPIC}`, 1)).total_count;
console.log(`\nFetched ${repos.length} unique repos; GitHub reports ${total} for topic:${TOPIC}.`);
if (repos.length < total)
  console.warn("⚠ Fetched fewer than the live total — some bucket truncated. Re-run; counts change as repos are tagged/untagged.");
