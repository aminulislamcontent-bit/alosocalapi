# AI Automation Server Provider Stack

Goal: add a complete, open-source **AI automation + server** foundation to this
project so "anything" (agent workflows, local AI, media, public hosting) can be
built on it — without forking 170 MB of third-party code into the app.

All 7 upstream projects requested by the project owner are added as
**pinned git submodules** (100% of each repo, at an exact commit; fetch or
update any time). Their code stays in their own repos/licences; this app
integrates them as separate services/processes.

```bash
bash scripts/providers.sh init     # clone/fetch all 7 (shallow)
bash scripts/providers.sh status   # pinned commits + sizes
bash scripts/providers.sh update   # bump pins to upstream HEAD (review before committing)
bash scripts/providers.sh doctor   # check expected env vars
```

## The stack

| Provider | Role in the stack | Licence | Pinned at |
|---|---|---|---|
| [jnMetaCode/agency-orchestrator](https://github.com/jnMetaCode/agency-orchestrator) | **Orchestration core** — one sentence → AI expert team → verified deliverable; YAML/DAG workflows, 15 LLM providers (11 key-free), Web Studio/Docker | Apache-2.0 | see `git submodule status` |
| [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) | Agent library (EN) — full AI-agency personas | MIT | 〃 |
| [jnMetaCode/agency-agents-zh](https://github.com/jnMetaCode/agency-agents-zh) | Agent library (ZH) — 277 experts incl. Chinese-market agents | MIT | 〃 |
| [Anas-Khan93/ai-agency-agents](https://github.com/Anas-Khan93/ai-agency-agents) | Agent workforce — dev/growth/research/strategy/creative agents | MIT | 〃 |
| [YouBTech01/YBT-Army-135M](https://github.com/YouBTech01/YBT-Army-135M) | Local 135M LLM + chat UI — free on-device drafts/triage | ⚠️ **NOASSERTION** | 〃 |
| [obsproject/obs-studio](https://github.com/obsproject/obs-studio) | Media server — streaming/recording, websocket-automatable lessons/webinars | ⚠️ **GPL-2.0** | 〃 |
| [nginx/nginx](https://github.com/nginx/nginx) | Server edge — HTTP/reverse-proxy/load-balancer in front of everything | BSD-2-Clause | 〃 |

Machine-readable manifest: [`providers.json`](./providers.json) ·
Live status API (login required): `GET /api/automation/providers` ·
Example edge config: [`nginx.conf.example`](./nginx.conf.example)

## How it fits together

```
internet ──▶ NGINX (or existing Caddyfile — pick one) ──▶ this Next.js app  :3000
                     │                                      │ /api/automation/providers
                     └──────────────▶ agency-orchestrator   :8080 (AUTOMATION_ORCHESTRATOR_URL)
                                          ▲ agent personas: agency-agents / agency-agents-zh / ai-agency-agents
                                          ▲ cheap local drafts: YBT-Army-135M (YBT_ARMY_URL)
OBS Studio (separate media machine/process) ── websocket (OBS_WEBSOCKET_URL) ──▶ automated recording/streaming
```

## Honest limits — read before promising "100% anything"

1. **Adding ≠ running.** Submodules are source code. Each service still needs
   its own install/build/run (orchestrator: Docker; YBT: Python; OBS: desktop
   app; NGINX: system service) and the env vars in `providers.json` / `.env.example`.
2. **Licences are real.** YBT-Army-135M has **no clear open-source licence**
   (research/evaluation only until the owner grants one). OBS is **GPL-2.0** —
   run it as a separate process, never link it into this app. Everything else
   above is MIT/Apache/BSD.
3. **OBS has 3 nested submodules** — `providers.sh init` fetches it with
   `--recursive`; the others are single-level.
4. Like the previous topic catalogue (`docs/mern-projects/`), these pins are
   the committed form. The ~170 MB of cloned code is *not* committed — any
   developer/CI restores it with one `providers.sh init`.
