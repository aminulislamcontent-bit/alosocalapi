#!/usr/bin/env node
// Metadata only. Never clone, install, or execute a topic repository.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const topic = 'metagpt';
const query = `is:public topic:${topic} fork:false`;
// Conservative list, not a legal classifier. Review new SPDX IDs before including them.
const approved = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0', 'GPL-2.0', 'GPL-3.0', 'LGPL-3.0', 'AGPL-3.0']);
const repos = new Map();
let total;
for (let page = 1; ; page++) {
  const response = JSON.parse(execFileSync('gh', ['api', '-X', 'GET', 'search/repositories', '-f', `q=${query}`, '-f', 'sort=stars', '-F', 'per_page=100', '-F', `page=${page}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  total ??= response.total_count;
  if (response.incomplete_results || total > 1000 || total !== response.total_count) throw new Error('Incomplete or changing search; no snapshot written.');
  for (const repo of response.items) repos.set(repo.id, repo);
  if (page * 100 >= total) break;
}
if (repos.size !== total) throw new Error('Missing or duplicate results; retry later.');
const projects = [...repos.values()].filter(r => approved.has(r.license?.spdx_id)).map(r => ({
  repository: r.full_name, url: r.html_url, license: r.license.spdx_id, archived: r.archived, language: r.language, description: r.description,
})).sort((a,b) => a.repository.localeCompare(b.repository, 'en'));
const date = new Date().toISOString().slice(0,10);
const dir = new URL('../docs/metagpt-projects/', import.meta.url);
writeFileSync(new URL('projects.json', dir), JSON.stringify({ topic, query, date, total, excluded: total - projects.length, projects }, null, 2)+'\n');
writeFileSync(new URL('INDEX.md', dir), `# GitHub topic: MetaGPT\n\nSnapshot ${date} · ${total} public non-fork repositories · ${projects.length} with an included open-source license · ${total-projects.length} omitted for missing, unclear, or unreviewed license metadata. Archived projects are marked.\n\n| Repository | GitHub license | Status |\n|---|---|---|\n`+projects.map(p=>`| [${p.repository}](${p.url}) | ${p.license} | ${p.archived?'Archived':'Not archived'} |`).join('\n')+'\n');
console.log(`Listed ${projects.length} of ${total} repositories.`);
